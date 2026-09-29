/**
 * Fábrica do servidor MCP do Orbyva: só o protocolo — os dois handlers, as annotations, o
 * `instructions` e o logging. Nada de ambiente aqui (nem `.env`, nem `node:fs`, nem Supabase);
 * isso é trabalho de `mcp/server.ts`.
 *
 * PORQUÊ SEPARADO: enquanto os handlers moravam dentro de `main()`, a única forma de exercitá-los
 * era subir o processo stdio com credencial de verdade. Fora daqui eles ganham um teste com
 * `InMemoryTransport` (`src/domain/orb/__tests__/mcpServer.test.ts`), que é o que prova a garantia
 * mais importante deste arquivo: **erro vira `isError: true`, nunca exceção**. Uma exceção que
 * escapa de um handler é respondida como erro de JSON-RPC, o cliente REJEITA, e o host mostra só
 * "servidor desconectado" — com a causa real (credencial errada, tool inexistente) perdida.
 *
 * As tools não são declaradas aqui: vêm de `supabase/functions/_shared/orb/registry.ts`, o mesmo
 * registro que a Edge Function `orb-agent` consome.
 *
 * MONTAGEM HÍBRIDA (2M.3), e ela é deliberada: o objeto é um `McpServer`, porque é ele que traz o
 * roteamento de URI template, o `resources/templates/list` e o `completion/complete` — mas as tools
 * continuam em handler cru sobre `mcp.server`. `McpServer.registerTool` só aceita schema Zod
 * (`dist/esm/server/mcp.js` lança em qualquer outra coisa), `zod` não é dependência direta do
 * projeto e `_shared/orb` não pode importar módulo externo: migrar as tools custaria 30 schemas
 * duplicados fora do diretório compartilhado, que é exatamente o que a feature 098 evitou.
 *
 * Somente leitura: nenhuma tool escreve no banco. A fronteira de segurança continua sendo o RLS —
 * o client injetado em `OrbToolContext` usa a anon key mais o JWT do usuário, nunca service role.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type LoggingMessageNotification,
} from "@modelcontextprotocol/sdk/types.js";

import {
  orbToolAnnotations,
  orbToolErrorCode,
  orbMcpTools,
  runOrbTool,
} from "../supabase/functions/_shared/orb/registry.ts";
import { buildMcpInstructions, ORB_PROMPTS } from "../supabase/functions/_shared/orb/prompts.ts";
import { stripUiFields } from "../supabase/functions/_shared/orb/helpers.ts";
import type {
  OrbToolContext,
  OrbToolErrorCode,
} from "../supabase/functions/_shared/orb/types.ts";
import { registerOrbPrompts } from "./prompts.ts";
import { registerOrbResources } from "./resources.ts";

export const VERSION = "0.2.0";

/**
 * Acima disto a chamada vira um log `warning`. Fica abaixo do `ORB_TOOL_TIMEOUT_MS` (15s) de
 * propósito: o valor útil é o que avisa ANTES de a tool ser interrompida — depois do timeout já
 * existe um erro para olhar.
 */
export const LIMIAR_DE_LATENCIA_MS = 5_000;

/** Uma mensagem de erro comprida no log não ajuda ninguém e ainda enche o canal do host. */
const LOG_MENSAGEM_MAX_CHARS = 200;

/**
 * De onde sai o contexto de execução das tools (client autenticado, `userId`, hoje no fuso).
 *
 * É resolvido a cada chamada, e não uma vez no boot, por dois motivos: o host precisa conseguir
 * listar as tools mesmo com a credencial errada, e `today` muda com a virada do dia num servidor
 * que fica semanas ligado.
 *
 * `renovar: true` é o pedido de "resolva de novo, a sessão de antes morreu" — quem implementa deve
 * descartar a sessão memoizada antes de responder. Uma função sem parâmetro nenhum
 * (`() => Promise<OrbToolContext>`, o caso dos testes e de qualquer contexto fixo) satisfaz este
 * tipo: nesse caso a repetição acontece com o mesmo contexto e só custa uma ida ao banco.
 */
export type OrbContextProvider = (opcoes?: { renovar?: boolean }) => Promise<OrbToolContext>;

/**
 * A linha que o servidor imprime no stderr ao subir. Mora aqui, e não solta dentro do `main()` de
 * `mcp/server.ts`, porque ela ANUNCIA um número: o único jeito de garantir que esse número é o que
 * o host realmente vê em `tools/list` é derivá-lo do mesmo `orbMcpTools` do handler e cobrir com
 * teste. Já errou: o banner contava `orbTools` (o registro inteiro, 37) depois que a feature 100
 * tirou `open_screen` e `propose_create` do catálogo do MCP, e passou meses dizendo duas a mais do
 * que o servidor anunciava.
 */
export function bannerDeBoot(): string {
  return (
    `Orbyva MCP server v${VERSION} no stdio — ${orbMcpTools.length} tools, ` +
    `${ORB_PROMPTS.length} prompts, mais os resources e templates de leitura direta. ` +
    `Somente leitura; a sessão é resolvida na primeira consulta.`
  );
}

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function respostaDeErro(mensagem: string) {
  return { content: [{ type: "text" as const, text: mensagem }], isError: true };
}

/** `input_invalido` é o modelo errando a chamada, não o servidor quebrando — não polui como erro. */
const NIVEL_POR_CODIGO: Record<OrbToolErrorCode, LoggingMessageNotification["params"]["level"]> = {
  input_invalido: "warning",
  nao_encontrado: "warning",
  auth_expirada: "error",
  erro_de_banco: "error",
  timeout: "error",
};

export function createOrbMcpServer(getCtx: OrbContextProvider): McpServer {
  const mcp = new McpServer(
    { name: "orbyva", version: VERSION },
    {
      capabilities: {
        tools: {},
        /**
         * `logging` habilita `notifications/message` e o handler de `logging/setLevel` (o SDK
         * registra sozinho quando a capability existe). `resources` e `prompts` são declaradas mais
         * abaixo, por quem as registra — nunca com `subscribe`: este servidor não escuta Realtime,
         * então prometer notificação de mudança seria mentir na capability.
         */
        logging: {},
      },
      instructions: buildMcpInstructions(),
    }
  );
  const server = mcp.server;

  /**
   * Explícito e ANTES do `connect`: `setRequestHandler` de `tools/*` só passa por
   * `assertRequestHandlerCapability` se `tools` já estiver declarada, e `registerCapabilities`
   * recusa qualquer alteração depois que o transporte sobe. `listChanged: false` é a verdade — o
   * catálogo é um array de módulo e nunca emitimos `notifications/tools/list_changed`.
   */
  server.registerCapabilities({ tools: { listChanged: false } });

  /**
   * Log estruturado para o host. O payload é SEMPRE `{tool, code, message}` — nunca o resultado da
   * tool e nunca o `input`: são extrato bancário, medicação e nota pessoal. `message` é o texto em
   * PT-BR que já vai no `tool_result` do mesmo turno, então não conta como vazamento novo.
   *
   * Nunca deixa o erro escapar: `sendLoggingMessage` rejeita com "Not connected" antes do
   * `connect`, e derrubar uma consulta porque o log falhou seria trocar dado por telemetria.
   */
  const logar = (
    level: LoggingMessageNotification["params"]["level"],
    dados: { tool: string; code: string; message: string }
  ): void => {
    void server
      .sendLoggingMessage({
        level,
        logger: "orbyva",
        data: { ...dados, message: dados.message.slice(0, LOG_MENSAGEM_MAX_CHARS) },
      })
      .catch(() => {
        // Host sem logging, transporte ainda não conectado: nada a fazer, e nada que justifique
        // interromper a chamada de tool.
      });
  };

  // Sem sessão de propósito: o host precisa ver o catálogo mesmo com a credencial errada.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: orbMcpTools.map((tool) => ({
      name: tool.name,
      // `title` é o rótulo humano (o `name` continua sendo o id); `orbToolAnnotations` é a fonte
      // única dos hints — ler `tool.annotations` cru aqui perderia o default do registry, e toda
      // tool apareceria como potencialmente destrutiva no host.
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: orbToolAnnotations(tool),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const input = (args ?? {}) as Record<string, unknown>;

    // Antes da sessão: tool inexistente não é problema de credencial, e responder "não consegui
    // entrar no Orbyva" para um nome errado manda o host caçar o bug no lugar errado.
    //
    // A checagem é contra `orbMcpTools`, não contra o registro inteiro: o que não é anunciado não
    // pode ser chamado por nome adivinhado (as tools só do app não teriam onde surtir efeito aqui).
    if (!orbMcpTools.some((tool) => tool.name === name)) {
      logar("warning", { tool: name, code: "nao_encontrado", message: "Tool desconhecida." });
      return respostaDeErro(
        `Não existe uma tool chamada "${name}" neste servidor. Chame tools/list para ver o catálogo.`
      );
    }

    let ctx: OrbToolContext;
    try {
      ctx = await getCtx();
    } catch (erro) {
      const message = mensagemDoErro(erro);
      logar("error", { tool: name, code: "auth_expirada", message });
      return respostaDeErro(`Não consegui entrar no Orbyva: ${message}`);
    }

    const inicio = Date.now();
    let saida = await runOrbTool(name, input, ctx);

    /**
     * O JWT do usuário morre em ~1h e nenhum caminho de login o renova dentro da query. `code` é
     * contrato (`OrbToolErrorCode`), ao contrário do texto do erro — que era o que este ponto
     * inspecionava por regex até a fundação da Onda 2 exportar `orbToolErrorCode`.
     */
    if (!saida.ok && orbToolErrorCode(saida.result) === "auth_expirada") {
      try {
        saida = await runOrbTool(name, input, await getCtx({ renovar: true }));
      } catch (erro) {
        const message = mensagemDoErro(erro);
        logar("error", { tool: name, code: "auth_expirada", message });
        return respostaDeErro(`A sessão do Orbyva expirou e não deu para renovar: ${message}`);
      }
    }

    const duracao = Date.now() - inicio;
    if (duracao >= LIMIAR_DE_LATENCIA_MS) {
      logar("warning", {
        tool: name,
        code: "latencia_alta",
        message: `${duracao}ms (limiar ${LIMIAR_DE_LATENCIA_MS}ms).`,
      });
    }

    if (!saida.ok) {
      const code = orbToolErrorCode(saida.result) ?? "erro_de_banco";
      const erro = (saida.result as { error?: unknown }).error;
      logar(NIVEL_POR_CODIGO[code] ?? "error", {
        tool: name,
        code,
        message: typeof erro === "string" ? erro : "Falha sem mensagem.",
      });
    }

    return {
      // `stripUiFields`: capa, pôster e afins existem para a tela do Orbyva desenhar cartão — o
      // host MCP recebe o dado, e URL de imagem ali é só token pago em toda rodada seguinte.
      content: [
        { type: "text" as const, text: JSON.stringify(stripUiFields(saida.result), null, 2) },
      ],
      isError: !saida.ok,
    };
  });

  // 2M.3 e 2M.4. Os dois registram as próprias capabilities lá dentro, e por isso precisam rodar
  // aqui — antes de `main()` conectar o stdio.
  registerOrbResources(mcp, getCtx);
  registerOrbPrompts(server);

  /**
   * O SDK declara `resources: { listChanged: true }` sozinho ao registrar o primeiro resource, e
   * isso seria promessa falsa: nunca chamamos `sendResourceListChanged`. Como `registerCapabilities`
   * faz merge raso por chave, este ajuste tem de vir DEPOIS de `registerOrbResources` para valer.
   */
  server.registerCapabilities({ resources: { listChanged: false } });

  return mcp;
}
