/**
 * Contrato MCP do servidor do Orbyva, exercitado por um cliente de verdade em cima de
 * `InMemoryTransport` — o par de transportes ligados do próprio SDK, sem processo, sem stdio e sem
 * banco.
 *
 * O QUE ESTE ARQUIVO PROTEGE: a promessa do topo de `mcp/orbMcpServer.ts` de que **erro vira
 * `isError: true`, nunca exceção**. Um `throw` que escapa de um handler é respondido como erro de
 * JSON-RPC, o cliente REJEITA, e o host mostra "servidor desconectado" — a causa real (nome de tool
 * errado, credencial vencida) morre no caminho. A garantia estava escrita em comentário desde a
 * 098 e nunca tinha sido verificada.
 *
 * Por isso os testes de falha usam `.resolves`: o que se prova é a ausência de rejeição, não só o
 * conteúdo da resposta.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { bannerDeBoot, createOrbMcpServer } from "../../../../mcp/orbMcpServer.ts";
import type { OrbContextProvider } from "../../../../mcp/orbMcpServer.ts";
import {
  ORB_APP_ONLY_TOOLS,
  orbMcpTools,
  orbTools,
} from "../../../../supabase/functions/_shared/orb/registry.ts";
import { buildMcpInstructions } from "../../../../supabase/functions/_shared/orb/prompts.ts";
import type { OrbDb } from "../../../../supabase/functions/_shared/orb/types.ts";
import { fakeDb } from "./fakeDb.ts";

const contextoDe = (db: OrbDb): OrbContextProvider => async () => ({
  db,
  userId: "user-1",
  today: "2026-09-08",
  timezone: "America/Sao_Paulo",
});

/** Sobe servidor e cliente ligados em memória e devolve o cliente já inicializado. */
async function conectar(getCtx: OrbContextProvider) {
  const server = createOrbMcpServer(getCtx);
  const client = new Client({ name: "teste-orbyva", version: "0.0.0" }, { capabilities: {} });
  const [doCliente, doServidor] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(doServidor), client.connect(doCliente)]);
  return {
    client,
    fechar: async () => {
      await client.close();
      await server.close();
    },
  };
}

/**
 * O `content` do MCP é uma união (texto/imagem/áudio/recurso), e o retorno de `callTool` é ele
 * mesmo unido ao formato legado (`toolResult`) — daí receber `unknown` e estreitar aqui. As tools
 * da Orb só emitem texto.
 */
function textoDe(resultado: unknown): string {
  const content = (resultado as { content?: { type: string; text?: string }[] }).content;
  expect(content?.[0]?.type).toBe("text");
  return content?.[0]?.text ?? "";
}

describe("servidor MCP da Orb", () => {
  it("anuncia o catálogo inteiro com title, description e annotations", async () => {
    const { client, fechar } = await conectar(contextoDe(fakeDb({})));

    const { tools } = await client.listTools();

    // O catálogo do MCP é o registro MENOS as tools que só existem dentro do app (feature 100):
    // um host sem tela do Orbyva não tem para onde navegar nem onde confirmar uma criação.
    expect(tools).toHaveLength(orbMcpTools.length);
    expect(tools.map((tool) => tool.name)).toEqual(orbMcpTools.map((tool) => tool.name));
    for (const soDoApp of ORB_APP_ONLY_TOOLS) {
      expect(tools.map((tool) => tool.name)).not.toContain(soDoApp);
    }
    for (const tool of tools) {
      expect(tool.inputSchema.type, `${tool.name} sem inputSchema de objeto`).toBe("object");
      expect(tool.description?.length ?? 0, `${tool.name} sem descrição`).toBeGreaterThan(20);
      // O rótulo é contrato de UI (`orbToolTitle` alimenta o chat): tool sem `title` aparece no
      // host como `query_x`.
      expect(tool.title, `${tool.name} sem title`).toBeTruthy();
      // Vêm de `orbToolAnnotations`, não de `tool.annotations` cru — ler o campo direto perderia o
      // default e toda tool apareceria como possivelmente destrutiva para o host.
      //
      // Tudo que o MCP anuncia é leitura: a única tool de escrita (`propose_create`) fica de fora
      // do catálogo, e este teste é o que impede a próxima entrar de carona sem alguém decidir.
      expect(tool.annotations?.readOnlyHint, `${tool.name} não declarada só leitura`).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }

    await fechar();
  });

  it("o banner de boot conta o que o servidor realmente anuncia, não o registro inteiro", async () => {
    const { client, fechar } = await conectar(contextoDe(fakeDb({})));
    const { tools } = await client.listTools();

    const banner = bannerDeBoot();

    // O número do banner é a única coisa que quem sobe o servidor lê antes de qualquer chamada:
    // ele tem de bater com `tools/list`, e não com `orbTools` (que ainda traz as duas tools só do
    // app). Este teste amarra os dois lados — o banner e a resposta real do protocolo.
    expect(banner).toContain(`${tools.length} tools`);
    expect(banner).toContain(`${orbMcpTools.length} tools`);
    expect(orbTools.length).toBeGreaterThan(orbMcpTools.length);
    expect(banner).not.toContain(`${orbTools.length} tools`);

    await fechar();
  });

  it("manda a política da Orb no instructions e não promete o que não cumpre nas capabilities", async () => {
    const { client, fechar } = await conectar(contextoDe(fakeDb({})));

    // A política é a MESMA do `orb-agent` (`_shared/orb/prompts.ts`): sem isto, o host que fala com
    // estas tools não sabe que é só leitura nem que precisa consultar a categoria antes.
    expect(client.getInstructions()).toBe(buildMcpInstructions());
    expect(client.getInstructions()).toContain("query_finance_categories");

    // Canário de deriva: a frase de abertura enumera as áreas, e o modelo lê essa lista como o
    // universo do que existe. Quando lugares e veículos entraram no catálogo (2T.2/2T.4) a frase
    // ficou para trás — com as tools no ar e o texto dizendo que não havia esse dado. Toda área
    // nova precisa aparecer aqui também.
    for (const area of ["lugares", "veículos"]) {
      expect(client.getInstructions(), `instructions não cita ${area}`).toContain(area);
    }

    const capacidades = client.getServerCapabilities();
    expect(capacidades?.tools).toBeDefined();
    expect(capacidades?.logging).toBeDefined();
    // Desde a 2M.3/2M.4 o servidor serve resources e prompts — mas nenhuma das três listas muda em
    // execução e nenhuma notificação de mudança é emitida, então `listChanged` tem de ser `false`.
    // E `subscribe` continua fora: o stdio não escuta Realtime, prometer seria mentir.
    expect(capacidades?.resources).toMatchObject({ listChanged: false });
    expect(capacidades?.resources?.subscribe).toBeUndefined();
    expect(capacidades?.prompts).toMatchObject({ listChanged: false });
    expect(capacidades?.tools).toMatchObject({ listChanged: false });

    await fechar();
  });

  it("executa uma tool e devolve texto com JSON parseável", async () => {
    const db = fakeDb({
      task: [
        {
          id: "t1",
          title: "Atrasada",
          status: "todo",
          due_date: "2026-09-01",
          due_time: null,
          start_date: null,
          priority: "high",
          project_id: null,
          parent_task_id: null,
          estimated_duration: null,
          completed_at: null,
        },
      ],
    });
    const { client, fechar } = await conectar(contextoDe(db));

    const resultado = await client.callTool({ name: "query_tasks", arguments: {} });

    expect(resultado.isError).toBeFalsy();
    const dados = JSON.parse(textoDe(resultado)) as {
      today: string;
      tasks: { title: string; overdue: boolean }[];
    };
    expect(dados.today).toBe("2026-09-08");
    expect(dados.tasks[0]).toMatchObject({ title: "Atrasada", overdue: true });

    await fechar();
  });

  it("tool inexistente vira isError, sem rejeitar e sem pedir sessão", async () => {
    let pediuContexto = false;
    const { client, fechar } = await conectar(async () => {
      pediuContexto = true;
      throw new Error("não deveria ter chegado aqui");
    });

    const resultado = await client.callTool({ name: "nao_existe", arguments: {} });

    expect(resultado.isError).toBe(true);
    expect(textoDe(resultado)).toContain("nao_existe");
    // Nome errado não é problema de credencial: responder "não consegui entrar no Orbyva" mandaria
    // quem lê caçar o bug no lugar errado.
    expect(pediuContexto).toBe(false);

    await fechar();
  });

  it("falha de autenticação vira isError, não rejeição", async () => {
    const { client, fechar } = await conectar(async () => {
      throw new Error('Rode "npm run mcp:login" para entrar de novo.');
    });

    await expect(
      client.callTool({ name: "query_tasks", arguments: {} })
    ).resolves.toMatchObject({ isError: true });

    const resultado = await client.callTool({ name: "query_tasks", arguments: {} });
    expect(textoDe(resultado)).toContain("mcp:login");

    await fechar();
  });

  it("erro da própria tool chega como isError com code estruturado", async () => {
    const { client, fechar } = await conectar(contextoDe(fakeDb({})));

    const resultado = await client.callTool({
      name: "query_tasks",
      arguments: { campo_inventado: 1 },
    });

    expect(resultado.isError).toBe(true);
    // O corpo continua sendo o `OrbToolFailure` do registry: é o `code` que o host usa para decidir
    // (reautenticar, corrigir a chamada), não o texto.
    expect(JSON.parse(textoDe(resultado))).toMatchObject({ code: "input_invalido" });

    await fechar();
  });
});
