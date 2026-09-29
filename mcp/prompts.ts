/**
 * `prompts/list` e `prompts/get` do servidor MCP do Orbyva (item 2M.4 do plano).
 *
 * O CONTEÚDO não mora aqui: os cinco prompts vêm de `_shared/orb/prompts.ts`, que é TS puro e é o
 * mesmo módulo que alimenta as pílulas do chat da Orb no app. Este arquivo é só a tradução do
 * catálogo para o protocolo — quem quiser mudar texto mexe lá, não aqui.
 *
 * POR QUE HANDLER CRU, e não `McpServer.registerPrompt`: `registerPrompt` só aceita `argsSchema`
 * como *raw shape* do Zod (`PromptArgsRawShape` em `dist/esm/server/mcp.d.ts`), e `zod` não é
 * dependência direta do projeto. Declarar os argumentos aqui em Zod criaria uma segunda descrição
 * dos mesmos campos fora do diretório compartilhado — exatamente o que a feature 098 evitou nas
 * tools. Os argumentos de prompt MCP são todos `string` sem schema no protocolo, então não se perde
 * validação nenhuma: o que se perde é o `complete` por argumento, que nenhum destes cinco usa (mês,
 * valor, parcelas, gênero e percentual não têm domínio enumerável).
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import {
  ORB_PROMPTS,
  findOrbPrompt,
} from "../supabase/functions/_shared/orb/prompts.ts";

/**
 * Registra os dois handlers no `Server` cru (`mcp.server`).
 *
 * `registerCapabilities` PRECISA vir antes do `setRequestHandler`: o SDK recusa registrar
 * `prompts/list` sem a capability declarada (`assertRequestHandlerCapability`), e recusa declarar
 * capability depois do `connect`. `listChanged: false` é honesto — o catálogo é constante de módulo
 * e nunca emitimos `notifications/prompts/list_changed`.
 */
export function registerOrbPrompts(server: Server): void {
  server.registerCapabilities({ prompts: { listChanged: false } });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: ORB_PROMPTS.map((prompt) => ({
      name: prompt.name,
      title: prompt.title,
      description: prompt.description,
      arguments: prompt.arguments,
    })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = findOrbPrompt(name);
    if (!prompt) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Não existe um prompt chamado "${name}". Chame prompts/list para ver o catálogo.`
      );
    }

    /**
     * `required` é contrato do `prompts/list`, mas o SDK não o impõe em `prompts/get` — sem esta
     * checagem, "posso-parcelar" sem `valor` renderizaria "R$ ?" e o modelo responderia sobre uma
     * compra de valor nenhum, com cara de resposta boa.
     */
    const faltando = prompt.arguments
      .filter((argumento) => argumento.required && !((args?.[argumento.name] ?? "").trim()))
      .map((argumento) => argumento.name);
    if (faltando.length > 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `O prompt "${name}" exige ${faltando.map((campo) => `"${campo}"`).join(" e ")}. ` +
          `Chame de novo preenchendo ${faltando.length > 1 ? "esses campos" : "esse campo"}.`
      );
    }

    return {
      description: prompt.description,
      messages: [
        {
          role: "user" as const,
          content: { type: "text" as const, text: prompt.build(args ?? {}) },
        },
      ],
    };
  });
}
