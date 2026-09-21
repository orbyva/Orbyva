/**
 * Resources, templates, completion e prompts do servidor MCP (itens 2M.3 e 2M.4), exercitados por
 * um cliente de verdade em cima de `InMemoryTransport`.
 *
 * O QUE ESTE ARQUIVO PROTEGE, e que nenhum outro cobre:
 *  1. **Template não vaza para `resources/list`.** A string literal `orbyva://orcamento/{mes}` na
 *     listagem faria um host correto tentar ler `{mes}` ao pé da letra. Ela pertence a
 *     `resources/templates/list`; quem entra na listagem são as URIs concretas do `list`.
 *  2. **`resources/list` sobrevive sem sessão.** Ele é a primeira coisa que o host chama, antes de
 *     qualquer login — uma exceção ali apaga também as URIs fixas e o servidor parece vazio.
 *  3. **Prompt não cita nome de tool.** O texto promete CAPACIDADE; citar `query_x` vira mentira
 *     silenciosa no dia em que a tool for renomeada, e quem descobre é o usuário.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createOrbMcpServer } from "../../../../mcp/orbMcpServer.ts";
import type { OrbContextProvider } from "../../../../mcp/orbMcpServer.ts";
import {
  ORB_PROMPTS,
  ORB_SUGESTOES_DE_CHAT,
} from "../../../../supabase/functions/_shared/orb/prompts.ts";
import { orbTools } from "../../../../supabase/functions/_shared/orb/registry.ts";
import type { OrbDb } from "../../../../supabase/functions/_shared/orb/types.ts";
import { fakeDb } from "./fakeDb.ts";

const HOJE = "2026-09-08";

const TAREFA = {
  id: "t1",
  title: "Escrever o relatório",
  status: "todo",
  due_date: "2026-09-08",
  due_time: null,
  start_date: null,
  priority: "high",
  project_id: "p1",
  parent_task_id: null,
  estimated_duration: null,
  completed_at: null,
};

/** Linhas mínimas para os resources lerem algo além de lista vazia. */
function bancoDeTeste(): OrbDb {
  return fakeDb({
    class: [
      {
        id: 7,
        name: "Mercado",
        type: { id: 3, name: "Alimentação", exclude_from_spend: false, nature: { name: "Despesa" } },
      },
    ],
    project: [
      { id: "p1", name: "Orbyva", description: null, status: "active", goal_id: null },
      { id: "p2", name: "Casa nova", description: null, status: "archived", goal_id: null },
    ],
    task: [TAREFA],
    habit: [
      {
        id: "h1",
        name: "Ler",
        description: null,
        frequency: "daily",
        target_per_week: 7,
        kind: "build",
        is_health: false,
      },
    ],
    vw_monthly_budget_summary: [
      {
        type_name: "Alimentação",
        class_name: "Mercado",
        nature_name: "Despesa",
        budget_month: "2026-09-01",
        planned_value: 1000,
        spent_value: 1200,
        remaining_value: -200,
        percentage_used: 120,
        status: "ESTOUROU",
      },
    ],
  });
}

const contextoDe = (db: OrbDb): OrbContextProvider => async () => ({
  db,
  userId: "user-1",
  today: HOJE,
  timezone: "America/Sao_Paulo",
});

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

/** O conteúdo de um `resources/read` é união de texto e binário; os nossos são sempre JSON. */
function jsonDe(resultado: unknown): unknown {
  const contents = (resultado as { contents?: { mimeType?: string; text?: string }[] }).contents;
  expect(contents?.[0]?.mimeType).toBe("application/json");
  return JSON.parse(contents?.[0]?.text ?? "null");
}

const URIS_FIXAS = [
  "orbyva://financas/categorias",
  "orbyva://projetos",
  "orbyva://habitos",
  "orbyva://metas",
  "orbyva://hoje",
];

describe("resources do MCP da Orb", () => {
  it("lista as URIs fixas e as concretas dos templates, nunca o template cru", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    const { resources } = await client.listResources();
    const uris = resources.map((recurso) => recurso.uri);

    for (const uri of URIS_FIXAS) expect(uris).toContain(uri);

    // O `list` de cada template expande o domínio finito: sem isto o usuário teria de adivinhar o
    // uuid do projeto e o formato do mês para montar a URI na mão.
    expect(uris).toContain("orbyva://orcamento/2026-09");
    expect(uris).toContain("orbyva://gastos/2026-08");
    expect(uris).toContain("orbyva://agenda/2026-09-08");
    expect(uris).toContain("orbyva://projeto/p1/tarefas");
    // Arquivado não entra na listagem (empurraria projeto ativo para fora do teto), mas a URI
    // continua legível.
    expect(uris).not.toContain("orbyva://projeto/p2/tarefas");

    // A garantia principal: nada com chave de template na listagem de resources.
    expect(uris.filter((uri) => uri.includes("{"))).toEqual([]);

    await fechar();
  });

  it("declara os quatro templates em resources/templates/list", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    const { resourceTemplates } = await client.listResourceTemplates();

    expect(resourceTemplates.map((modelo) => modelo.uriTemplate).sort()).toEqual([
      "orbyva://agenda/{data}",
      "orbyva://gastos/{mes}",
      "orbyva://orcamento/{mes}",
      "orbyva://projeto/{id}/tarefas",
    ]);
    for (const modelo of resourceTemplates) {
      expect(modelo.mimeType, `${modelo.uriTemplate} sem mimeType`).toBe("application/json");
      expect(modelo.description?.length ?? 0, `${modelo.uriTemplate} sem descrição`).toBeGreaterThan(
        20
      );
    }

    await fechar();
  });

  it("lê uma URI fixa reusando a tool do catálogo", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    const dados = jsonDe(
      await client.readResource({ uri: "orbyva://financas/categorias" })
    ) as { categories: { class_name: string; type_name: string }[] };

    // Mesmo retorno de `query_finance_categories` — é ela que produz o conteúdo, não uma query nova.
    expect(dados.categories[0]).toMatchObject({ class_name: "Mercado", type_name: "Alimentação" });

    await fechar();
  });

  it("roteia o template pelo UriTemplate e passa a variável para a tool", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    const orcamento = jsonDe(await client.readResource({ uri: "orbyva://orcamento/2026-09" })) as {
      month: string;
      budgets: unknown[];
    };
    expect(orcamento.month).toBe("2026-09");
    expect(orcamento.budgets).toHaveLength(1);

    const agenda = jsonDe(await client.readResource({ uri: "orbyva://agenda/2026-09-08" })) as {
      start_date: string;
      end_date: string;
    };
    // `days: 1` — a agenda de UM dia, não a semana inteira a partir dele.
    expect(agenda).toMatchObject({ start_date: "2026-09-08", end_date: "2026-09-08" });

    await fechar();
  });

  it("hoje junta tarefas, agenda e hábitos num objeto só", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    const hoje = jsonDe(await client.readResource({ uri: "orbyva://hoje" })) as {
      today: string;
      timezone: string;
      tarefas: { tasks: unknown[] };
      agenda: unknown;
      habitos: { habits: unknown[] };
      blocos_com_falha?: unknown;
    };

    expect(hoje.today).toBe(HOJE);
    expect(hoje.timezone).toBe("America/Sao_Paulo");
    expect(hoje.tarefas.tasks).toHaveLength(1);
    expect(hoje.habitos.habits).toHaveLength(1);
    expect(hoje.agenda).toBeDefined();
    // Nada falhou: o campo só aparece quando algum bloco morreu, para "vazio" e "não consegui ler"
    // não virarem a mesma coisa.
    expect(hoje.blocos_com_falha).toBeUndefined();

    await fechar();
  });

  it("URI que não casa com nada vira erro, não conteúdo vazio", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    await expect(client.readResource({ uri: "orbyva://inventado/42" })).rejects.toThrow();

    await fechar();
  });

  it("sem sessão, a listagem perde as URIs de dado mas mantém as fixas", async () => {
    const { client, fechar } = await conectar(async () => {
      throw new Error('Rode "npm run mcp:login" para entrar de novo.');
    });

    const { resources } = await client.listResources();
    const uris = resources.map((recurso) => recurso.uri);

    // Fail-soft: o `list` de cada template devolve vazio em vez de derrubar a listagem inteira.
    expect(uris.sort()).toEqual([...URIS_FIXAS].sort());
    // Ler continua falhando com a causa de verdade, e não com "recurso não encontrado".
    await expect(client.readResource({ uri: "orbyva://projetos" })).rejects.toThrow(/mcp:login/);

    await fechar();
  });

  it("completa mes a partir de hoje e id de projeto pelo nome", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    const meses = await client.complete({
      ref: { type: "ref/resource", uri: "orbyva://orcamento/{mes}" },
      argument: { name: "mes", value: "2026-0" },
    });
    // 12 meses terminando em 2026-09; os de 2025 não casam com o prefixo.
    expect(meses.completion.values).toEqual([
      "2026-09",
      "2026-08",
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
      "2026-03",
      "2026-02",
      "2026-01",
    ]);

    // Ninguém digita uuid de cabeça: o filtro casa contra o NOME e devolve o id.
    const projetos = await client.complete({
      ref: { type: "ref/resource", uri: "orbyva://projeto/{id}/tarefas" },
      argument: { name: "id", value: "orb" },
    });
    expect(projetos.completion.values).toEqual(["p1"]);

    await fechar();
  });
});

describe("prompts do MCP da Orb", () => {
  it("anuncia os cinco prompts com title, description e argumentos descritos", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    const { prompts } = await client.listPrompts();

    expect(prompts.map((prompt) => prompt.name)).toEqual([
      "revisao-do-mes",
      "posso-parcelar",
      "fechar-o-dia",
      "o-que-assistir",
      "cortar-gastos",
    ]);
    for (const prompt of prompts) {
      expect(prompt.title, `${prompt.name} sem title`).toBeTruthy();
      expect(prompt.description?.length ?? 0, `${prompt.name} sem descrição`).toBeGreaterThan(20);
      for (const argumento of prompt.arguments ?? []) {
        expect(argumento.description, `${prompt.name}.${argumento.name} sem descrição`).toBeTruthy();
      }
    }

    await fechar();
  });

  it("monta a mensagem interpolando os argumentos", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    const comArgumentos = await client.getPrompt({
      name: "posso-parcelar",
      arguments: { valor: "5000", parcelas: "10" },
    });
    const texto = comArgumentos.messages[0]?.content;
    expect(comArgumentos.messages[0]?.role).toBe("user");
    expect(texto).toMatchObject({ type: "text" });
    expect((texto as { text: string }).text).toContain("R$ 5000 em 10x");

    // Argumento opcional ausente usa o padrão documentado, não some do texto.
    const semParcelas = await client.getPrompt({
      name: "posso-parcelar",
      arguments: { valor: "300" },
    });
    expect((semParcelas.messages[0]?.content as { text: string }).text).toContain("em 12x");

    await fechar();
  });

  it("prompt sem argumento obrigatório e prompt inexistente viram erro", async () => {
    const { client, fechar } = await conectar(contextoDe(bancoDeTeste()));

    // Sem `valor` o texto renderizaria "R$ ?" e o modelo responderia sobre compra nenhuma — com
    // cara de resposta boa, que é o pior modo de falhar.
    await expect(client.getPrompt({ name: "posso-parcelar" })).rejects.toThrow(/valor/);
    await expect(client.getPrompt({ name: "nao-existe" })).rejects.toThrow(/nao-existe/);

    await fechar();
  });

  it("nenhum prompt cita nome de tool", () => {
    const nomes = orbTools.map((tool) => tool.name);
    for (const prompt of ORB_PROMPTS) {
      const texto = [
        prompt.title,
        prompt.description,
        prompt.build({ valor: "1", percentual: "1" }),
      ].join("\n");
      for (const nome of nomes) {
        expect(texto, `"${prompt.name}" cita a tool ${nome}`).not.toContain(nome);
      }
      // Guarda o formato, não só os nomes de hoje: uma tool futura chamada `query_algo` também
      // não pode aparecer.
      expect(texto).not.toMatch(/\b(query|simulate|propose)_[a-z_]+/);
    }
  });

  it("as pílulas do chat vêm da mesma fonte dos prompts", () => {
    expect(ORB_SUGESTOES_DE_CHAT.length).toBeGreaterThan(0);
    for (const sugestao of ORB_SUGESTOES_DE_CHAT) {
      expect(sugestao.trim()).toBe(sugestao);
      expect(sugestao).not.toMatch(/\b(query|simulate|propose)_[a-z_]+/);
    }
  });
});
