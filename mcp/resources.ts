/**
 * `resources/list`, `resources/templates/list`, `resources/read` e `completion/complete` do servidor
 * MCP do Orbyva (item 2M.3 do plano).
 *
 * POR QUE ISTO EXISTE: hoje toda pergunta financeira gasta uma rodada inteira só para descobrir o
 * nome da categoria — é o que a própria política manda fazer ("consulte a categoria ANTES de
 * afirmar que ela existe"). Com a árvore de categorias disponível como *resource*, o host entrega
 * o catálogo no contexto inicial e o turno cai de duas rodadas para uma. O mesmo vale para
 * projetos, hábitos e metas: são domínios pequenos, estáveis e que quase toda pergunta precisa.
 *
 * NENHUMA QUERY NOVA MORA AQUI. Todo resource é lido pelas MESMAS tools do catálogo, via
 * `runOrbTool` — o que garante de graça o teto de tempo, a coerção de input, a classificação de
 * erro e a regra de escopo por tabela. Uma segunda forma de ler `class` ou `project` seria uma
 * segunda verdade sobre os mesmos dados, divergindo no primeiro filtro que alguém esquecesse.
 *
 * DIVISÃO ENTRE URI FIXA E TEMPLATE, que o protocolo trata como coisas diferentes:
 *  - URI fixa (`resources/list`): domínio de um item só. `orbyva://projetos` é *a* lista.
 *  - Template (`resources/templates/list`, NUNCA em `resources/list`): a string literal
 *    `orbyva://orcamento/{mes}` não é legível — um host correto que a encontrasse em
 *    `resources/list` tentaria ler `{mes}` ao pé da letra. Quem coloca URIs concretas na listagem é
 *    o `list` de cada template (os últimos 12 meses, os próximos 7 dias, os projetos por nome),
 *    porque sem isso o usuário teria de adivinhar um uuid para montar a URI na mão.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { ListResourcesResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { Variables } from "@modelcontextprotocol/sdk/shared/uriTemplate.js";

import { orbToolErrorCode, runOrbTool } from "../supabase/functions/_shared/orb/registry.ts";
import { stripUiFields } from "../supabase/functions/_shared/orb/helpers.ts";
import { shiftDays } from "../supabase/functions/_shared/orb/helpers.ts";
import type {
  OrbToolContext,
  OrbToolErrorCode,
} from "../supabase/functions/_shared/orb/types.ts";
import type { OrbContextProvider } from "./orbMcpServer.ts";

/** Todo resource daqui é JSON: é o formato que o host repassa ao modelo sem reinterpretar. */
const MIME = "application/json";

/** Janela do `list` e do `complete` dos dois templates mensais. Um ano fecha a sazonalidade. */
const MESES_LISTADOS = 12;

/** Janela do `list` da agenda. Mais que uma semana vira ruído numa lista de resources. */
const DIAS_LISTADOS = 7;

/**
 * Teto de projetos que viram resource. Sem ele, quem tem 200 projetos recebe 200 entradas em
 * `resources/list` — a mesma poluição de contexto que o item 7 das regras evita nas tools.
 */
const MAX_PROJETOS_LISTADOS = 30;

/** Tarefas do snapshot do dia: o que vence hoje ou antes. */
const TAREFAS_DE_HOJE = 15;

/** Tarefas por projeto. Abaixo do teto de 100 da tool, de propósito. */
const TAREFAS_POR_PROJETO = 50;

/**
 * `complete` roda a cada tecla digitada. Sem cache, um usuário digitando o nome de um projeto
 * dispararia uma leitura de `project` + `task` por caractere. Curto porque a lista muda (projeto
 * novo aparece na próxima janela) e nada aqui é decisão de negócio.
 */
const CACHE_DE_PROJETOS_MS = 30_000;

/**
 * Falha de tool → erro de JSON-RPC.
 *
 * `resources/read` NÃO tem o `isError` das tools: aqui o único jeito honesto de dizer "não deu" é o
 * erro do protocolo. Devolver `{"error": ...}` como se fosse o conteúdo seria pior que a falha —
 * o host anexaria ao contexto um objeto com cara de dado.
 */
const CODIGO_JSONRPC: Record<OrbToolErrorCode, number> = {
  input_invalido: ErrorCode.InvalidParams,
  nao_encontrado: ErrorCode.InvalidParams,
  auth_expirada: ErrorCode.InternalError,
  erro_de_banco: ErrorCode.InternalError,
  timeout: ErrorCode.InternalError,
};

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

async function contexto(
  getCtx: OrbContextProvider,
  opcoes?: { renovar?: boolean }
): Promise<OrbToolContext> {
  try {
    return await getCtx(opcoes);
  } catch (erro) {
    throw new McpError(
      ErrorCode.InternalError,
      `Não consegui entrar no Orbyva: ${mensagemDoErro(erro)}`
    );
  }
}

/**
 * Roda uma tool do catálogo e devolve o resultado cru, com a MESMA retentativa de sessão expirada
 * do handler de `tools/call`: o JWT do usuário morre em ~1h e nenhum caminho de leitura o renova
 * sozinho. `code` é contrato (`OrbToolErrorCode`), o texto do erro não.
 */
async function lerTool(
  getCtx: OrbContextProvider,
  nome: string,
  input: Record<string, unknown>
): Promise<unknown> {
  let saida = await runOrbTool(nome, input, await contexto(getCtx));
  if (!saida.ok && orbToolErrorCode(saida.result) === "auth_expirada") {
    saida = await runOrbTool(nome, input, await contexto(getCtx, { renovar: true }));
  }
  // Resource fica ANEXADO ao contexto e é repassado em toda rodada: campo de UI aqui custa caro.
  if (saida.ok) return stripUiFields(saida.result);

  const codigo = orbToolErrorCode(saida.result) ?? "erro_de_banco";
  const mensagem = (saida.result as { error?: unknown }).error;
  throw new McpError(
    CODIGO_JSONRPC[codigo] ?? ErrorCode.InternalError,
    typeof mensagem === "string" ? mensagem : `Não consegui ler "${nome}" agora.`
  );
}

/**
 * Corpo de um `resources/read`.
 *
 * JSON compacto de propósito, ao contrário do `JSON.stringify(_, null, 2)` do `tools/call`: o
 * resultado de uma tool é lido uma vez, enquanto o conteúdo de um resource fica anexado ao contexto
 * e é repassado em TODA rodada seguinte do turno. Indentação ali é legibilidade; aqui é imposto.
 */
function conteudoJson(uri: URL, dados: unknown): ReadResourceResult {
  return {
    contents: [{ uri: uri.toString(), mimeType: MIME, text: JSON.stringify(dados) }],
  };
}

/**
 * Valor de uma variável de template.
 *
 * O casamento é do `UriTemplate` do SDK (é ele que escapa as partes literais e entende operador e
 * explode — o que uma regex escrita à mão erra). O `decodeURIComponent` é explícito porque
 * `UriTemplate.match()` devolve o segmento CRU, sem decodificar: sem isto, um nome com espaço
 * chegaria à tool como `a%20b`.
 */
function variavel(variables: Variables, nome: string): string {
  const bruto = variables[nome];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof valor !== "string" || valor === "") {
    throw new McpError(ErrorCode.InvalidParams, `A URI não trouxe o valor de "${nome}".`);
  }
  try {
    return decodeURIComponent(valor);
  } catch {
    throw new McpError(
      ErrorCode.InvalidParams,
      `O valor de "${nome}" na URI está mal codificado (percent-encoding inválido).`
    );
  }
}

/**
 * `resources/list` é chamado no boot do host, antes de qualquer login. Uma exceção aqui derrubaria
 * a listagem INTEIRA — inclusive as URIs fixas, que existem mesmo sem sessão. Lista vazia é o
 * fracasso certo: o host mostra menos opções, e não uma tela de erro no lugar do servidor.
 */
async function listaSuave(
  montar: () => Promise<ListResourcesResult["resources"]>
): Promise<ListResourcesResult> {
  try {
    return { resources: await montar() };
  } catch {
    return { resources: [] };
  }
}

/** Os `quantidade` meses terminando no mês de `hoje`, do mais recente para o mais antigo. */
function mesesRecentes(hoje: string, quantidade: number): string[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const saida: string[] = [];
  for (let i = 0; i < quantidade; i += 1) {
    // `Date.UTC` com mês negativo faz o rollover de ano sozinho; e UTC porque a data já vem
    // resolvida no fuso do usuário — reinterpretar no fuso da máquina moveria o mês.
    const data = new Date(Date.UTC(ano, mes - 1 - i, 1));
    saida.push(`${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return saida;
}

/** Os `quantidade` dias a partir de `hoje`, inclusive. */
function diasSeguintes(hoje: string, quantidade: number): string[] {
  return Array.from({ length: quantidade }, (_, i) => shiftDays(hoje, i));
}

interface ProjetoResumo {
  id: string;
  name: string;
  status?: string;
  tasks_open?: number;
}

interface Bloco {
  chave: string;
  valor?: unknown;
  erro?: McpError;
}

async function suave(chave: string, ler: () => Promise<unknown>): Promise<Bloco> {
  try {
    return { chave, valor: await ler() };
  } catch (erro) {
    return {
      chave,
      erro:
        erro instanceof McpError
          ? erro
          : new McpError(ErrorCode.InternalError, mensagemDoErro(erro)),
    };
  }
}

/**
 * `orbyva://hoje` — o dia em um objeto só: o que vence hoje ou antes, o que tem hora marcada e os
 * check-ins de hábito.
 *
 * Falha por BLOCO, não no conjunto (mesma escolha de `query_upcoming`): um módulo quebrado não pode
 * apagar o dia inteiro, e o bloco que falhou aparece nomeado em `blocos_com_falha` — engolir a
 * falha faria "agenda vazia" e "não consegui ler a agenda" parecerem a mesma coisa. A exceção é
 * todos falharem: aí não há snapshot nenhum, e devolver três `null` com cara de "dia livre" seria
 * mentir. Sessão expirada cai exatamente nesse caso, porque derruba os três de uma vez.
 */
async function snapshotDeHoje(getCtx: OrbContextProvider): Promise<Record<string, unknown>> {
  const ctx = await contexto(getCtx);
  const blocos = await Promise.all([
    suave("tarefas", () =>
      lerTool(getCtx, "query_tasks", { due_to: ctx.today, limit: TAREFAS_DE_HOJE })
    ),
    suave("agenda", () => lerTool(getCtx, "query_agenda", { start_date: ctx.today, days: 1 })),
    suave("habitos", () => lerTool(getCtx, "query_habits", {})),
  ]);

  const falhas = blocos.filter((bloco) => bloco.erro !== undefined);
  const primeiraFalha = falhas[0]?.erro;
  if (falhas.length === blocos.length && primeiraFalha !== undefined) throw primeiraFalha;

  const snapshot: Record<string, unknown> = { today: ctx.today, timezone: ctx.timezone };
  for (const bloco of blocos) {
    if (bloco.erro === undefined) snapshot[bloco.chave] = bloco.valor;
  }
  if (falhas.length > 0) {
    snapshot.blocos_com_falha = falhas.map((bloco) => ({
      bloco: bloco.chave,
      erro: bloco.erro?.message,
    }));
  }
  return snapshot;
}

/**
 * Registra as 5 URIs fixas e os 4 templates no `McpServer`.
 *
 * TEM DE RODAR ANTES DO `connect`: `registerResource` declara a capability `resources` (e o
 * primeiro template com `complete` declara `completions`), e o SDK recusa registrar capability
 * depois que o transporte sobe.
 */
export function registerOrbResources(mcp: McpServer, getCtx: OrbContextProvider): void {
  /* ── URIs fixas ───────────────────────────────────────────────────────────────────────────── */

  mcp.registerResource(
    "categorias-financeiras",
    "orbyva://financas/categorias",
    {
      title: "Categorias financeiras",
      description:
        "Árvore de categorias do usuário (natureza → tipo → classe), com o id de cada classe. " +
        "Leia ANTES de falar de qualquer categoria: os nomes são do usuário, não os genéricos.",
      mimeType: MIME,
    },
    async (uri) => conteudoJson(uri, await lerTool(getCtx, "query_finance_categories", {}))
  );

  mcp.registerResource(
    "projetos",
    "orbyva://projetos",
    {
      title: "Projetos",
      description:
        "Projetos do usuário com status e contagem de tarefas abertas e concluídas. É onde está o " +
        "id de cada projeto.",
      mimeType: MIME,
    },
    async (uri) => conteudoJson(uri, await lerTool(getCtx, "query_projects", {}))
  );

  mcp.registerResource(
    "habitos",
    "orbyva://habitos",
    {
      title: "Hábitos",
      description:
        "Hábitos do usuário com o check-in de hoje e o progresso dos últimos 7 dias.",
      mimeType: MIME,
    },
    async (uri) => conteudoJson(uri, await lerTool(getCtx, "query_habits", {}))
  );

  mcp.registerResource(
    "metas",
    "orbyva://metas",
    {
      title: "Metas",
      description:
        "Metas pessoais ativas com valor atual, alvo, percentual concluído e prazo.",
      mimeType: MIME,
    },
    async (uri) => conteudoJson(uri, await lerTool(getCtx, "query_goals", {}))
  );

  mcp.registerResource(
    "hoje",
    "orbyva://hoje",
    {
      title: "Hoje",
      description:
        "Retrato do dia: tarefas que vencem hoje ou antes, compromissos com hora marcada e " +
        "check-ins de hábito. Leia para entrar no contexto do dia sem várias consultas.",
      mimeType: MIME,
    },
    async (uri) => conteudoJson(uri, await snapshotDeHoje(getCtx))
  );

  /* ── Completadores ────────────────────────────────────────────────────────────────────────── */

  /**
   * Meses derivados de `ctx.today` — zero consulta ao banco. Prefixo, não substring: quem digita
   * "2026" quer os meses de 2026, e "09" não é um começo de mês válido.
   */
  const completarMes = async (valor: string): Promise<string[]> => {
    try {
      const ctx = await contexto(getCtx);
      return mesesRecentes(ctx.today, MESES_LISTADOS).filter((mes) => mes.startsWith(valor));
    } catch {
      // Sugestão é conveniência: sem sessão, o certo é não sugerir nada — nunca derrubar o host.
      return [];
    }
  };

  const projetosEmCache = criarCacheDeProjetos(getCtx);

  /**
   * O valor completado é o `id` (é ele que entra na URI), mas o filtro casa TAMBÉM contra o nome:
   * ninguém digita uuid de cabeça, e quem escreve "orb" está procurando o id do projeto "Orbyva".
   */
  const completarProjeto = async (valor: string): Promise<string[]> => {
    try {
      const busca = valor.trim().toLowerCase();
      const projetos = await projetosEmCache();
      return projetos
        .filter(
          (projeto) =>
            busca === "" ||
            projeto.id.toLowerCase().startsWith(busca) ||
            projeto.name.toLowerCase().includes(busca)
        )
        .map((projeto) => projeto.id);
    } catch {
      return [];
    }
  };

  /* ── Templates ────────────────────────────────────────────────────────────────────────────── */

  mcp.registerResource(
    "orcamento-do-mes",
    new ResourceTemplate("orbyva://orcamento/{mes}", {
      list: async () =>
        listaSuave(async () => {
          const ctx = await contexto(getCtx);
          return mesesRecentes(ctx.today, MESES_LISTADOS).map((mes) => ({
            uri: `orbyva://orcamento/${mes}`,
            name: `orcamento-${mes}`,
            title: `Orçamento de ${mes}`,
            mimeType: MIME,
          }));
        }),
      complete: { mes: completarMes },
    }),
    {
      title: "Orçamento de um mês",
      description:
        "Planejado, gasto, saldo e status (OK/ATENÇÃO/ESTOUROU) por categoria num mês. " +
        "`{mes}` em YYYY-MM.",
      mimeType: MIME,
    },
    async (uri, variables) =>
      conteudoJson(
        uri,
        await lerTool(getCtx, "query_budget_status", { month: variavel(variables, "mes") })
      )
  );

  mcp.registerResource(
    "gastos-do-mes",
    new ResourceTemplate("orbyva://gastos/{mes}", {
      list: async () =>
        listaSuave(async () => {
          const ctx = await contexto(getCtx);
          return mesesRecentes(ctx.today, MESES_LISTADOS).map((mes) => ({
            uri: `orbyva://gastos/${mes}`,
            name: `gastos-${mes}`,
            title: `Gastos de ${mes}`,
            mimeType: MIME,
          }));
        }),
      complete: { mes: completarMes },
    }),
    {
      title: "Gastos de um mês",
      description:
        "Receita e despesa do mês somadas por categoria e subcategoria, com o total de " +
        "lançamentos. `{mes}` em YYYY-MM.",
      mimeType: MIME,
    },
    async (uri, variables) =>
      conteudoJson(
        uri,
        await lerTool(getCtx, "query_spend_by_category", { month: variavel(variables, "mes") })
      )
  );

  mcp.registerResource(
    "agenda-do-dia",
    new ResourceTemplate("orbyva://agenda/{data}", {
      list: async () =>
        listaSuave(async () => {
          const ctx = await contexto(getCtx);
          return diasSeguintes(ctx.today, DIAS_LISTADOS).map((data) => ({
            uri: `orbyva://agenda/${data}`,
            name: `agenda-${data}`,
            title: `Agenda de ${data}`,
            mimeType: MIME,
          }));
        }),
      /**
       * Sem `complete` de propósito: qualquer data é válida (o passado inclusive), então o domínio
       * é infinito e uma lista de sugestões só esconderia as outras. A semana útil, que é o que
       * alguém escolhe do menu, já sai concreta no `list` acima.
       */
    }),
    {
      title: "Agenda de um dia",
      description:
        "Compromissos com hora marcada e tarefas com prazo naquele dia. `{data}` em YYYY-MM-DD.",
      mimeType: MIME,
    },
    async (uri, variables) =>
      conteudoJson(
        uri,
        await lerTool(getCtx, "query_agenda", {
          start_date: variavel(variables, "data"),
          days: 1,
        })
      )
  );

  mcp.registerResource(
    "tarefas-do-projeto",
    new ResourceTemplate("orbyva://projeto/{id}/tarefas", {
      list: async () =>
        listaSuave(async () => {
          const projetos = await projetosEmCache();
          return projetos.map((projeto) => ({
            uri: `orbyva://projeto/${encodeURIComponent(projeto.id)}/tarefas`,
            // `name` é o nome do projeto porque é o que um host que não mostra `title` exibe — e
            // "projeto-9f3c…" na lista obrigaria o usuário a abrir cada um para saber qual é.
            name: projeto.name,
            title: `Tarefas de ${projeto.name}`,
            description:
              projeto.tasks_open === undefined
                ? undefined
                : `${projeto.tasks_open} tarefa(s) em aberto.`,
            mimeType: MIME,
          }));
        }),
      complete: { id: completarProjeto },
    }),
    {
      title: "Tarefas de um projeto",
      description:
        "Tarefas não concluídas de um projeto, das mais próximas do prazo para as mais distantes. " +
        "`{id}` é o id do projeto (está em orbyva://projetos).",
      mimeType: MIME,
    },
    async (uri, variables) =>
      conteudoJson(
        uri,
        await lerTool(getCtx, "query_tasks", {
          project_id: variavel(variables, "id"),
          limit: TAREFAS_POR_PROJETO,
        })
      )
  );
}

/**
 * Lista de projetos memoizada por alguns segundos, compartilhada pelo `list` e pelo `complete` do
 * template de tarefas. O cache é por servidor (fecha sobre esta chamada), não de módulo: dois
 * servidores no mesmo processo — o caso dos testes — são duas sessões diferentes, e um cache global
 * faria um enxergar os projetos do outro.
 *
 * Projetos arquivados ficam de fora da LISTAGEM (são histórico e empurrariam os ativos para fora do
 * teto), mas continuam legíveis: a URI monta com qualquer id.
 */
function criarCacheDeProjetos(getCtx: OrbContextProvider): () => Promise<ProjetoResumo[]> {
  let cache: { expiraEm: number; projetos: ProjetoResumo[] } | null = null;

  return async () => {
    const agora = Date.now();
    if (cache !== null && cache.expiraEm > agora) return cache.projetos;

    const resultado = (await lerTool(getCtx, "query_projects", {})) as {
      projects?: ProjetoResumo[];
    };
    const projetos = (resultado.projects ?? [])
      .filter(
        (projeto) =>
          typeof projeto?.id === "string" &&
          projeto.id !== "" &&
          typeof projeto.name === "string" &&
          projeto.status !== "archived"
      )
      .slice(0, MAX_PROJETOS_LISTADOS);

    cache = { expiraEm: agora + CACHE_DE_PROJETOS_MS, projetos };
    return projetos;
  };
}
