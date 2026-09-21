import { describe, expect, it, vi } from "vitest";

import {
  orbTools,
  runOrbTool,
} from "../../../../supabase/functions/_shared/orb/registry.ts";
import type { OrbDb } from "../../../../supabase/functions/_shared/orb/types.ts";
import { fakeDb, filtro, leituraDe, leiturasDe, temFiltro } from "./fakeDb.ts";
import type { Recorded } from "./fakeDb.ts";

/**
 * Regras de negócio das tools da Onda 2.
 *
 * Um teste por tool que só confere "voltou alguma coisa" não vale o que custa — ele passa igual
 * depois de a regra ser apagada. Cada bloco daqui prova UMA regra que, se sumir, produz uma
 * resposta errada com cara de certa: dado de outro membro da viagem no total, tempo de um timer que
 * ainda está correndo somado como se fosse passado, item de compras sem categoria desaparecendo da
 * lista, `.eq("user_id")` numa view que não tem a coluna.
 *
 * O `fakeDb` NÃO executa filtro: onde a prova é sobre o que o Postgres devolveria, ela é feita
 * sobre o log de filtros; onde é sobre o recorte em memória, as linhas entram todas de propósito —
 * é justamente assim que se vê se a tool filtra ou só confia no banco.
 */

const USER = "user-1";
const OUTRO = "user-2";
const TRIP = "11111111-1111-4111-8111-111111111111";

const ctx = (db: OrbDb) => ({
  db,
  userId: USER,
  today: "2026-09-08",
  timezone: "America/Sao_Paulo",
});

/** Roda a tool e devolve o `result`, falhando com o erro dela em vez de um `undefined` mudo. */
async function rodar(
  nome: string,
  input: Record<string, unknown>,
  db: OrbDb
): Promise<Record<string, unknown>> {
  const saida = await runOrbTool(nome, input, ctx(db));
  if (!saida.ok) {
    throw new Error(`${nome} falhou: ${JSON.stringify(saida.result)}`);
  }
  return saida.result as Record<string, unknown>;
}

/* ── Contrato do catálogo ─────────────────────────────────────────────────────────────────────── */

describe("contrato do catálogo de tools", () => {
  /**
   * `title` deixou de ser opcional na prática quando `stream.ts` trocou o mapa de rótulos escrito à
   * mão por `orbToolTitle`: tool sem `title` volta a aparecer na UI como `query_x`. O teste antigo
   * (`orbToolTitle(name) === tool.title ?? tool.name`) passa mesmo com o campo vazio — este não.
   */
  it("toda tool declara um title humano, diferente do name", () => {
    for (const tool of orbTools) {
      expect(typeof tool.title, `${tool.name} sem title`).toBe("string");
      expect((tool.title ?? "").trim(), `${tool.name} com title vazio`).not.toBe("");
      expect(tool.title, `${tool.name} usa o próprio name como title`).not.toBe(tool.name);
      expect(tool.title, `${tool.name} com title em snake_case`).not.toMatch(/_/);
    }
  });
});

/* ── Viagens ──────────────────────────────────────────────────────────────────────────────────── */

const VIAGEM = {
  id: TRIP,
  title: "Portugal",
  destination: "Lisboa",
  start_date: "2026-09-01",
  end_date: "2026-09-10",
  status: "ongoing",
  budget: 1000,
  notes: null,
};

function gasto(over: Record<string, unknown>) {
  return {
    id: "e0",
    trip_id: TRIP,
    description: "Gasto",
    amount: 10,
    category: "food",
    expense_date: "2026-09-02",
    visibility: "shared",
    created_by_user_id: USER,
    paid_by_user_id: USER,
    place_visit_id: null,
    ...over,
  };
}

describe("query_trip_expenses: visibilidade de gasto alheio", () => {
  /**
   * A ÚNICA tool que lê linha que o RLS libera para outra pessoa: `trip_expense` é visível para
   * qualquer membro da viagem (`is_trip_member`), então quem impede o gasto PESSOAL de outro
   * participante de entrar é o `podeVer` em memória — não o banco. O fake devolve as quatro linhas
   * de propósito: se o filtro em memória for removido "porque o `.or()` já resolve", este teste cai.
   */
  it("soma o gasto compartilhado e o próprio, e ignora o pessoal de outro membro", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        trip: [VIAGEM],
        trip_expense: [
          gasto({ id: "e1", description: "Jantar do grupo", amount: 100, visibility: "shared", created_by_user_id: OUTRO, paid_by_user_id: OUTRO }),
          gasto({ id: "e2", description: "Lembrancinha secreta", amount: 250, category: "shopping", visibility: "personal", created_by_user_id: OUTRO, paid_by_user_id: OUTRO }),
          gasto({ id: "e3", description: "Meu café", amount: 20, visibility: "personal", created_by_user_id: USER }),
          // Linha legada, sem visibilidade e sem autor: o default é `personal`, e sem autor não há
          // como afirmar que é do usuário — fica de fora.
          gasto({ id: "e4", description: "Gasto órfão", amount: 999, visibility: null, created_by_user_id: null, paid_by_user_id: null }),
        ],
      },
      log
    );

    const resultado = await rodar("query_trip_expenses", { trip_id: TRIP }, db);
    const despesas = resultado.expenses as { id: string }[];

    expect(despesas.map((linha) => linha.id).sort()).toEqual(["e1", "e3"]);
    expect(resultado.count).toBe(2);
    expect(resultado.total).toBe(120);
    expect(resultado.shared_total).toBe(100);
    expect(resultado.personal_total).toBe(20);

    // Nem o valor nem a descrição do gasto alheio podem sobrar em canto nenhum do retorno.
    const serializado = JSON.stringify(resultado);
    expect(serializado).not.toContain("Lembrancinha secreta");
    expect(serializado).not.toContain("Gasto órfão");
    expect(serializado).not.toContain("250");
    expect(serializado).not.toContain("999");
  });

  it("escopa trip_expense pelos ids das viagens do dono e repete o filtro de visibilidade no banco", async () => {
    const log: Recorded[] = [];
    const db = fakeDb({ trip: [VIAGEM], trip_expense: [gasto({ id: "e1" })] }, log);

    await rodar("query_trip_expenses", {}, db);

    // `trip` é do grupo (a): filtra por dono. `trip_expense` é do grupo (b): NÃO tem `user_id`.
    expect(filtro(leituraDe(log, "trip"), "eq:user_id")).toBe(USER);
    const despesas = leituraDe(log, "trip_expense");
    expect(temFiltro(despesas, "eq:user_id")).toBe(false);
    expect(filtro(despesas, "in:trip_id")).toEqual([TRIP]);

    // Defesa em profundidade: o mesmo recorte de `podeVer` também vai para o PostgREST, para o
    // total continuar honesto quando a leitura pagina.
    const ou = despesas.filters.find(([chave]) => chave.startsWith("or:"))?.[0] ?? "";
    expect(ou).toContain("visibility.eq.shared");
    expect(ou).toContain(`created_by_user_id.eq.${USER}`);
  });
});

describe("query_trip_day_plan: escopo trip → day → activity", () => {
  /**
   * `trip_itinerary_activity` pende de `day_id`, não de `trip_id` — e nenhuma das duas tem
   * `user_id`. Um `.eq("user_id", …)` aqui dá 42703 em runtime, que o registry engole e vira um
   * "não consegui consultar" sem causa aparente.
   */
  it("filtra os dias por trip_id e as atividades por day_id, nunca por user_id", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        trip: [VIAGEM],
        trip_itinerary_day: [
          { id: "day-5", trip_id: TRIP, day_number: 5, date: "2026-09-05", title: "Dia 5", notes: null },
          { id: "day-6", trip_id: TRIP, day_number: 6, date: "2026-09-06", title: "Dia 6", notes: null },
        ],
        trip_itinerary_activity: [
          { id: "a1", day_id: "day-5", title: "Museu do Azulejo", activity_time: "10:00", arrival_time: null, category: "sightseeing", transport_mode: null, origin_label: null, destination_label: null, notes: null, link_url: null, is_reserved: true, visit_status: null, sort_order: 1 },
          { id: "a2", day_id: "day-6", title: "Praia de Carcavelos", activity_time: "09:00", arrival_time: null, category: "sightseeing", transport_mode: null, origin_label: null, destination_label: null, notes: null, link_url: null, is_reserved: false, visit_status: null, sort_order: 1 },
        ],
      },
      log
    );

    const resultado = await rodar("query_trip_day_plan", { date: "2026-09-05" }, db);

    const dias = leituraDe(log, "trip_itinerary_day");
    expect(temFiltro(dias, "eq:user_id")).toBe(false);
    expect(filtro(dias, "in:trip_id")).toEqual([TRIP]);

    const atividades = leituraDe(log, "trip_itinerary_activity");
    expect(temFiltro(atividades, "eq:user_id")).toBe(false);
    expect(temFiltro(atividades, "in:trip_id")).toBe(false);
    // Só o dia que casa com a data entra no escopo — não os dois dias da viagem.
    expect(filtro(atividades, "in:day_id")).toEqual(["day-5"]);

    // E o recorte em memória confere: a atividade do dia 6 veio do fake e não pode vazar para o
    // dia 5 (é o `atividade.day_id === dia.id` que segura isso).
    const days = resultado.days as { day_id: string; activities: { title: string }[] }[];
    expect(days).toHaveLength(1);
    expect(days[0].day_id).toBe("day-5");
    expect(days[0].activities.map((item) => item.title)).toEqual(["Museu do Azulejo"]);
    expect(JSON.stringify(resultado)).not.toContain("Carcavelos");
  });
});

/* ── Notas ────────────────────────────────────────────────────────────────────────────────────── */

describe("query_notes: teto de corpo e nota de desenho", () => {
  it("corta o corpo em 2.000 caracteres com a flag, e não devolve corpo de nota canvas", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        note: [
          { id: "n1", title: "Reforma", content: "a".repeat(2500), kind: "markdown", project_id: null, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-07T10:00:00Z" },
          { id: "n2", title: "Diagrama do fluxo", content: "", kind: "canvas", project_id: null, created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-06T10:00:00Z" },
        ],
      },
      log
    );

    const resultado = await rodar("query_notes", {}, db);
    const notas = resultado.notes as {
      id: string;
      content: string | null;
      content_truncated: boolean;
      is_canvas: boolean;
    }[];

    const longa = notas.find((nota) => nota.id === "n1")!;
    expect(longa.content_truncated).toBe(true);
    expect(longa.content).toHaveLength(2000);
    expect(resultado.content_truncated_warning).toContain("2000");

    // Nota-canvas é desenho: `content` nulo é diferente de nota vazia, e o aviso existe para o
    // modelo não dizer "essa nota está em branco".
    const canvas = notas.find((nota) => nota.id === "n2")!;
    expect(canvas.is_canvas).toBe(true);
    expect(canvas.content).toBeNull();
    expect(canvas.content_truncated).toBe(false);
    expect(resultado.canvas_warning).toBeTruthy();

    // `canvas_data` (o jsonb do Excalidraw) nunca pode entrar no select: é o desenho inteiro em
    // coordenadas, ilegível para o modelo e caro em token — uma nota-canvas sozinha passa de 100 KB.
    const leitura = leituraDe(log, "note");
    const select = leitura.filters.find(([chave]) => chave.startsWith("select:"))?.[0] ?? "";
    expect(select).not.toBe("");
    expect(select).not.toContain("canvas_data");
    expect(filtro(leitura, "eq:user_id")).toBe(USER);
  });
});

/* ── Tempo registrado ─────────────────────────────────────────────────────────────────────────── */

describe("query_time_tracking: sessão em andamento não entra no total", () => {
  /**
   * Somar uma sessão aberta faria o total mudar a cada chamada dentro da MESMA conversa — a Orb se
   * contradiria sozinha ("você trabalhou 60 min" e, três turnos depois, "72 min", sem nada ter
   * mudado). A sessão aberta sai em `running`, fora de `total_minutes`.
   */
  it("soma só as sessões fechadas e devolve a aberta em running", async () => {
    const log: Recorded[] = [];
    const aberta = {
      id: "t2",
      task_id: "task-1",
      started_at: "2026-09-08T13:00:00Z",
      ended_at: null,
    };
    const db = fakeDb(
      {
        // A tool lê `task_time_entry` DUAS vezes com filtros diferentes: o período (paginado) e o
        // timer aberto (`.is("ended_at", null)`). O fake não filtra, então quem separa é o teste.
        task_time_entry: (entry) =>
          temFiltro(entry, "is:ended_at")
            ? [aberta]
            : [
                { id: "t1", task_id: "task-1", started_at: "2026-09-08T10:00:00Z", ended_at: "2026-09-08T11:00:00Z" },
                aberta,
              ],
        task: [{ id: "task-1", title: "Escrever o relatório", project_id: "proj-1" }],
        project: [{ id: "proj-1", name: "Orbyva" }],
      },
      log
    );

    const resultado = await rodar("query_time_tracking", {}, db);

    expect(resultado.total_minutes).toBe(60);
    expect(resultado.entries_counted).toBe(1);
    expect(resultado.by_task).toEqual([
      { task_id: "task-1", title: "Escrever o relatório", project_id: "proj-1", minutes: 60 },
    ]);
    expect(resultado.by_project).toEqual([
      { project_id: "proj-1", name: "Orbyva", minutes: 60 },
    ]);

    const rodando = resultado.running as { id: string; task_id: string }[];
    expect(rodando).toHaveLength(1);
    expect(rodando[0].id).toBe("t2");

    // A leitura do timer aberto é deliberadamente FORA da janela de datas: "estou com um timer
    // rodando?" é pergunta sobre agora, e um timer aberto ontem não apareceria numa busca de hoje.
    const leituraDoTimer = leiturasDe(log, "task_time_entry").find((entry) =>
      temFiltro(entry, "is:ended_at")
    )!;
    expect(temFiltro(leituraDoTimer, "gte:started_at")).toBe(false);
    expect(filtro(leituraDoTimer, "eq:user_id")).toBe(USER);
  });
});

/* ── Leitura ──────────────────────────────────────────────────────────────────────────────────── */

function livro(over: Record<string, unknown>) {
  return {
    google_id: "b0",
    title: "Livro",
    authors: ["Autor"],
    page_count: 300,
    status: "read",
    current_page: null,
    read_dates: ["2026-03-01"],
    created_at: "2026-01-02T12:00:00Z",
    ...over,
  };
}

describe("query_reading_progress: livro sem número de páginas", () => {
  /**
   * `page_count` é nullable e o `book` é a única fonte de páginas do app. Tratar o nulo como zero
   * daria uma soma menor com cara de exata — a Orb responderia "faltam 300 páginas para a meta"
   * quando faltam 800. O livro sai da soma e entra num contador que obriga a narrar a incerteza.
   */
  it("não soma zero: separa o livro em books_without_page_count e avisa que a soma é parcial", async () => {
    const db = fakeDb({
      book: [
        livro({ google_id: "b1", title: "Com páginas", page_count: 300 }),
        livro({ google_id: "b2", title: "Sem páginas", page_count: null, read_dates: ["2026-04-01"] }),
      ],
    });

    const resultado = await rodar("query_reading_progress", { goal_pages: 1000 }, db);
    const semPaginas = resultado.books_without_page_count as {
      count: number;
      read_events: number;
      titles: string[];
      warning?: string;
    };

    expect(resultado.pages_read).toBe(300);
    expect(resultado.books_finished).toBe(2);
    expect(resultado.read_events).toBe(2);
    expect(semPaginas.count).toBe(1);
    expect(semPaginas.read_events).toBe(1);
    expect(semPaginas.titles).toEqual(["Sem páginas"]);
    expect(semPaginas.warning).toBeTruthy();
    // A meta é calculada sobre a soma incompleta — daí o aviso ser obrigatório.
    expect(resultado.pages_remaining).toBe(700);
  });

  it("não inventa o aviso quando todos os livros têm páginas", async () => {
    const db = fakeDb({
      book: [
        livro({ google_id: "b1", title: "Com páginas", page_count: 300 }),
        livro({ google_id: "b3", title: "Também com páginas", page_count: 200, read_dates: ["2026-05-01"] }),
      ],
    });

    const resultado = await rodar("query_reading_progress", {}, db);
    const semPaginas = resultado.books_without_page_count as { count: number; warning?: string };

    expect(resultado.pages_read).toBe(500);
    expect(semPaginas.count).toBe(0);
    expect(semPaginas.warning).toBeUndefined();
  });

  it("o marca-página de um livro em leitura fica fora de pages_read", async () => {
    const db = fakeDb({
      book: [
        livro({ google_id: "b1", page_count: 300 }),
        livro({ google_id: "b4", title: "Lendo agora", status: "reading", current_page: 120, read_dates: [] }),
      ],
    });

    const resultado = await rodar("query_reading_progress", {}, db);

    expect(resultado.pages_read).toBe(300);
    expect(resultado.in_progress).toEqual({ books: 1, bookmarked_pages: 120 });
  });
});

/* ── Compras ──────────────────────────────────────────────────────────────────────────────────── */

describe("query_shopping_list: item sem categoria", () => {
  /**
   * `shopping_item.shopping_category_id` é nulo desde a feature 066 — item solto é a captura
   * rápida ("pilha AA"), não uma anomalia. Agrupar só pelas categorias existentes faria a Orb
   * responder "não falta nada" com a lista cheia.
   */
  it("agrupa o item sem categoria em 'Sem categoria', por último, sem perdê-lo da contagem", async () => {
    const db = fakeDb({
      shopping_category: [
        { id: "cat-2", name: "Mercado", project_id: null },
        { id: "cat-1", name: "Casa", project_id: null },
      ],
      shopping_item: [
        { id: "i1", shopping_category_id: "cat-2", title: "Arroz", description: null, quantity: 2, unit: "kg", provider_link: null, status: "pending" },
        { id: "i2", shopping_category_id: null, title: "Pilha AA", description: null, quantity: "1", unit: null, provider_link: null, status: "pending" },
        { id: "i3", shopping_category_id: "cat-1", title: "Vassoura", description: null, quantity: null, unit: null, provider_link: null, status: "purchased" },
      ],
    });

    const resultado = await rodar("query_shopping_list", {}, db);
    const grupos = resultado.groups as {
      category_id: string | null;
      category_name: string;
      pending: number;
      purchased: number;
      items: { title: string; quantity: number | null }[];
    }[];

    expect(resultado.total_items).toBe(3);
    expect(resultado.pending_items).toBe(2);
    expect(resultado.purchased_items).toBe(1);

    // Categorias em ordem alfabética e o pseudo-grupo sempre no fim — mesma ordem da tela.
    expect(grupos.map((grupo) => grupo.category_name)).toEqual(["Casa", "Mercado", "Sem categoria"]);
    const solto = grupos[grupos.length - 1];
    expect(solto.category_id).toBeNull();
    expect(solto.pending).toBe(1);
    expect(solto.items.map((item) => item.title)).toEqual(["Pilha AA"]);
    // `quantity` é `numeric`: o PostgREST pode devolver texto, e o modelo não pode receber "1".
    expect(solto.items[0].quantity).toBe(1);
  });
});

/* ── Álbuns ───────────────────────────────────────────────────────────────────────────────────── */

function album(over: Record<string, unknown>) {
  return {
    musicbrainz_id: "mb0",
    title: "Álbum",
    artists: ["Artista"],
    release_year: 2007,
    album_type: "album",
    status: "listened",
    rating: null,
    is_favorite: false,
    would_recommend: true,
    source: "musicbrainz",
    listened_dates: [],
    ...over,
  };
}

describe("query_albums: filtro por artista", () => {
  /**
   * `artists` é `text[]`: `ilike` não existe para array e `contains` exigiria o nome exato, que o
   * usuário nunca digita. O casamento roda em memória — e, por isso, a leitura NÃO pode usar
   * `.limit()` no banco: cortar antes de filtrar esconderia justamente os álbuns que casam.
   */
  it("casa parte do nome em qualquer artista creditado, sem diferenciar caixa", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        album: [
          album({ musicbrainz_id: "mb1", title: "In Rainbows", artists: ["Radiohead"] }),
          album({ musicbrainz_id: "mb2", title: "Currents", artists: ["Tame Impala"] }),
          album({ musicbrainz_id: "mb3", title: "Amnesiac", artists: ["Thom Yorke", "RADIOHEAD"] }),
        ],
      },
      log
    );

    const resultado = await rodar("query_albums", { artist: "radio" }, db);
    const albums = resultado.albums as { id: string; title: string }[];

    expect(albums.map((linha) => linha.id)).toEqual(["mb1", "mb3"]);
    expect(resultado.total_matching).toBe(2);
    expect(resultado.count).toBe(2);
    expect(JSON.stringify(resultado)).not.toContain("Currents");

    // A leitura pagina por `.range()` e não corta com `.limit()` — é o que garante que o filtro em
    // memória enxergue a coleção inteira.
    const leitura = leituraDe(log, "album");
    expect(filtro(leitura, "eq:user_id")).toBe(USER);
    expect(temFiltro(leitura, "limit")).toBe(false);
    expect(filtro(leitura, "range")).toEqual([0, 999]);
  });
});

/* ── Histórico mensal ─────────────────────────────────────────────────────────────────────────── */

describe("query_monthly_history: a view não tem user_id", () => {
  /**
   * `vw_value_by_nature_year_month` agrega por ano/mês (grupo (c) do cabeçalho de `types.ts`): um
   * `.eq("user_id", …)` nela dá 42703 em runtime, o `catch` do registry engole e o usuário recebe
   * "não consegui consultar" sem causa. É o mesmo modo de falha do grupo (b), e o guard geral de
   * escopo não cobre views — este teste é o único lugar que segura essa linha.
   */
  it("não filtra por user_id e monta a janela pelo calendário", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        vw_value_by_nature_year_month: [
          { year: 2026, month: 9, receita_total: 1000, despesa_total: 500 },
          { year: 2026, month: 8, receita_total: 900, despesa_total: 400 },
          // Julho não tem linha nenhuma: mês sem lançamento simplesmente não existe na view.
        ],
      },
      log
    );

    const resultado = await rodar("query_monthly_history", { months: 3 }, db);

    const leitura = leituraDe(log, "vw_value_by_nature_year_month");
    expect(temFiltro(leitura, "eq:user_id")).toBe(false);

    const series = resultado.series as {
      ym: string;
      has_data: boolean;
      partial: boolean;
      total_expense: number;
      expense_change_percent: number | null;
    }[];
    // A janela vem do calendário, não das linhas: julho entra vazio em vez de a série pular dele.
    expect(series.map((ponto) => ponto.ym)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(series[0].has_data).toBe(false);
    expect(series[0].partial).toBe(false);
    // Sem base no mês anterior (julho não existe), a variação de agosto é `null` em vez de -100%.
    expect(series[1].expense_change_percent).toBeNull();
    // Setembro tem base: (500 - 400) / 400 = +25%.
    expect(series[2].expense_change_percent).toBe(25);
    expect(series[2].partial).toBe(true);
    expect(resultado.closed_months).toBe(2);
    expect(resultado.closed_months_with_data).toBe(1);
  });
});

/* ── Painel transversal ───────────────────────────────────────────────────────────────────────── */

function meta(dia: string, titulo: string) {
  return {
    id: `meta-${dia}`,
    title: titulo,
    deadline: dia,
    target_value: 10,
    current_value: 4,
    unit: "livros",
  };
}

describe("query_upcoming: falha parcial e teto por módulo", () => {
  /**
   * Seis módulos num retorno só: se a falha de um derrubasse a tool, um veículo sem documento
   * esconderia as tarefas da semana. O erro vira dado (`modules_failed`) e o resto continua válido.
   */
  it("um módulo que falha não derruba os outros e sai nomeado em modules_failed", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      { personal_goal: [meta("2026-09-09", "Ler 10 livros")] },
      log,
      [],
      // Erro genérico de banco (não de sessão): é o caso em que a resposta parcial ainda serve.
      { task: { code: "42P01", message: 'relation "task" does not exist' } }
    );

    const logDoConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const resultado = await rodar("query_upcoming", {}, db);
      const falhos = resultado.modules_failed as { module: string; error: string }[];

      expect(falhos).toEqual([{ module: "tarefas", error: "Não consegui ler as tarefas agora." }]);
      expect(resultado.failed_warning).toBeTruthy();
      // O módulo que falhou não pode aparecer com zero itens — "não sei" é diferente de "não há".
      expect(Object.keys(resultado.count_by_module as Record<string, number>)).not.toContain(
        "tarefas"
      );
      expect((resultado.count_by_module as Record<string, number>).metas).toBe(1);
      expect((resultado.items as unknown[]).length).toBe(1);
      // O texto cru do Postgres fica no log, nunca no retorno.
      expect(JSON.stringify(resultado)).not.toContain("does not exist");
      expect(String(logDoConsole.mock.calls[0]?.[0] ?? "")).toContain("does not exist");
    } finally {
      logDoConsole.mockRestore();
    }
  });

  it("corta no teto por módulo e sinaliza em modules_truncated", async () => {
    const db = fakeDb({
      personal_goal: [
        meta("2026-09-09", "Meta A"),
        meta("2026-09-10", "Meta B"),
        meta("2026-09-11", "Meta C"),
      ],
    });

    const resultado = await rodar("query_upcoming", { limit_per_module: 2 }, db);

    expect((resultado.items as { title: string }[]).map((item) => item.title)).toEqual([
      "Meta A",
      "Meta B",
    ]);
    expect(resultado.modules_truncated).toEqual(["metas"]);
    expect(resultado.truncated_warning).toBeTruthy();
    expect((resultado.count_by_module as Record<string, number>).metas).toBe(2);
  });

  it("sessão expirada num módulo derruba a tool inteira, para o host poder reautenticar", async () => {
    // Um JWT morto derruba os SEIS módulos: engolir isso como falha parcial tiraria do MCP a
    // chance de renovar a sessão e repetir a chamada (ele decide por `code`, não pelo texto).
    const db = fakeDb({}, [], [], {
      personal_goal: { code: "PGRST301", message: "JWT expired", status: 401 },
    });

    const logDoConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const saida = await runOrbTool("query_upcoming", {}, ctx(db));

      expect(saida.ok).toBe(false);
      expect((saida.result as { code: string }).code).toBe("auth_expirada");
      expect((saida.result as { error: string }).error).not.toContain("JWT");
    } finally {
      logDoConsole.mockRestore();
    }
  });
});

/* ── Lugares ──────────────────────────────────────────────────────────────────────────────────── */

/** Linha de `place_visit` com os campos que `PLACE_SELECT` traz. */
function lugar(over: Record<string, unknown>) {
  return {
    id: "p0",
    trip_id: null,
    name: "Lugar",
    type: "restaurant",
    status: "visited",
    rating: null,
    notes: null,
    visited_date: null,
    amount: null,
    address: null,
    would_recommend: null,
    created_at: "2026-01-01T00:00:00Z",
    trip: null,
    ...over,
  };
}

describe("query_places: status legado normalizado em memória", () => {
  /**
   * `place_visit.status` só existe desde `20260727210000_place_trip_wishlist.sql`. Linha gravada
   * antes chega com `status` nulo e a única pista é `visited_date`. Se a normalização sumir — ou se
   * alguém "otimizar" mandando o filtro para o banco — a Orb responde "você nunca foi lá" sobre um
   * lugar que está cadastrado. O fake devolve as três linhas de propósito: o recorte sob teste é o
   * de memória, não o do Postgres.
   */
  it("trata a linha antiga com visited_date como visitada, e a sem data como a visitar", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        place_visit: [
          lugar({ id: "p1", name: "Bar do Marcão", status: null, visited_date: "2026-08-10", rating: "4.5" }),
          lugar({ id: "p2", name: "Cafeteria nova", status: null, visited_date: null }),
          lugar({ id: "p3", name: "Museu do Ipiranga", status: "to_visit", visited_date: null }),
        ],
      },
      log
    );

    const visitados = await rodar("query_places", { status: "visited" }, db);
    const lista = visitados.places as { id: string; status: string; rating: number | null }[];

    expect(lista.map((linha) => linha.id)).toEqual(["p1"]);
    expect(lista[0]).toMatchObject({ status: "visited", rating: 4.5 });
    // As contagens valem para o que CASOU o filtro, não para a base inteira: com status=visited o
    // matched_to_visit é 0 por construção. Ver o teste seguinte para a base sem filtro.
    expect(visitados.matched_visited).toBe(1);
    expect(visitados.matched_to_visit).toBe(0);
    expect(visitados.matched).toBe(1);

    // A prova de que o recorte é em memória: nenhum `.eq("status", …)` foi para o banco. Com ele,
    // p1 (status nulo) sumiria da resposta mesmo tendo sido visitado.
    const leitura = leituraDe(log, "place_visit");
    expect(temFiltro(leitura, "eq:status")).toBe(false);
    expect(filtro(leitura, "eq:user_id")).toBe(USER);
  });

  it("sem filtro de status devolve os dois, cada um com o status já resolvido", async () => {
    const db = fakeDb({
      place_visit: [
        lugar({ id: "p1", status: null, visited_date: "2026-08-10" }),
        lugar({ id: "p2", status: null, visited_date: null }),
      ],
    });

    const resultado = await rodar("query_places", {}, db);

    expect((resultado.places as { id: string; status: string }[]).map((l) => [l.id, l.status])).toEqual([
      ["p1", "visited"],
      ["p2", "to_visit"],
    ]);
    expect(resultado.matched_visited).toBe(1);
    expect(resultado.matched_to_visit).toBe(1);
  });

  it("escopa place_visit e place_visit_occurrence pelo dono, e conta as idas", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        place_visit: [lugar({ id: "p1", status: "visited", visited_date: "2026-08-10" })],
        place_visit_occurrence: [
          { id: "o1", place_visit_id: "p1", visited_date: "2026-08-10", rating: "5", notes: null, amount: "80", would_recommend: null, created_at: null },
          { id: "o2", place_visit_id: "p1", visited_date: "2026-05-02", rating: "4", notes: null, amount: null, would_recommend: false, created_at: null },
        ],
      },
      log
    );

    const resultado = await rodar("query_places", { include_occurrences: true }, db);
    const primeiro = (resultado.places as { visit_count: number; occurrences: unknown[] }[])[0];

    expect(primeiro.visit_count).toBe(2);
    expect(primeiro.occurrences).toHaveLength(2);
    // As duas tabelas são do grupo (a): têm `user_id` próprio e o filtro é obrigatório nas duas.
    expect(filtro(leituraDe(log, "place_visit"), "eq:user_id")).toBe(USER);
    expect(filtro(leituraDe(log, "place_visit_occurrence"), "eq:user_id")).toBe(USER);
    expect(filtro(leituraDe(log, "place_visit_occurrence"), "in:place_visit_id")).toEqual(["p1"]);
  });
});

/* ── Veículos ─────────────────────────────────────────────────────────────────────────────────── */

/** Linha de `vehicle` com os campos que `VEHICLE_SELECT` traz. */
function veiculo(over: Record<string, unknown>) {
  return {
    id: "v0",
    kind: "car",
    brand: "Fiat",
    model: "Argo",
    year: 2020,
    plate: "ABC1D23",
    color: "prata",
    current_km: 50_000,
    fuel_type: "flex",
    purchase_date: null,
    notes: null,
    ...over,
  };
}

describe("query_vehicles: busca por apelido", () => {
  /**
   * O apelido do carro ("o Goleta") não tem coluna no banco — o usuário escreve isso em `model` ou
   * em `notes`. Se a busca voltar a olhar só marca e placa, a pergunta mais natural que existe
   * ("quanto tá o km do Goleta?") passa a não achar nada.
   */
  it("procura o termo em marca, modelo, placa E observações", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      { vehicle: [veiculo({ id: "v1", model: "Gol G4", notes: "o Goleta" })] },
      log
    );

    const resultado = await rodar("query_vehicles", { search: "Goleta" }, db);

    expect(resultado.search_matched).toBe(true);
    expect((resultado.vehicles as { id: string }[]).map((v) => v.id)).toEqual(["v1"]);

    const ou = String(leituraDe(log, "vehicle").filters.find(([c]) => c.startsWith("or:"))?.[0] ?? "");
    for (const coluna of ["brand", "model", "plate", "notes"]) {
      expect(ou, `busca sem a coluna ${coluna}`).toContain(`${coluna}.ilike.`);
    }
    // O termo vai escapado e aspado — é o mesmo `ilikeOr` das outras tools, não uma cópia crua.
    expect(ou).toContain('"%Goleta%"');
  });

  it("busca que não casa nada devolve a garagem inteira, não uma lista vazia", async () => {
    const log: Recorded[] = [];
    const garagem = [veiculo({ id: "v1", model: "Gol G4" }), veiculo({ id: "v2", brand: "Honda", model: "CG 160", kind: "motorcycle" })];
    const db = fakeDb(
      {
        // A primeira leitura leva o `.or(…)` da busca e não casa nada; a segunda, sem `or`, é o
        // fallback. É a única forma de simular no fake um filtro que o Postgres executaria.
        vehicle: (entry) => (entry.filters.some(([c]) => c.startsWith("or:")) ? [] : garagem),
      },
      log
    );

    const resultado = await rodar("query_vehicles", { search: "Goleta" }, db);

    expect(resultado.search_matched).toBe(false);
    expect(resultado.no_match_hint).toContain("Goleta");
    // Um "não existe" aqui seria mentira: o apelido só não bate com o que foi digitado no cadastro.
    expect((resultado.vehicles as { id: string }[]).map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(leiturasDe(log, "vehicle")).toHaveLength(2);
  });
});

describe("query_vehicles / query_vehicle_alerts: escopo das tabelas-filhas", () => {
  /**
   * `vehicle_fuel_log`, `vehicle_maintenance` e `vehicle_document` NÃO têm `user_id` (o RLS delas
   * vai pelo pai). O guard de `registry.test.ts` prova a metade negativa ("nenhuma tool filtra por
   * user_id onde a coluna não existe"); aqui está a positiva: o único escopo possível é
   * `.in("vehicle_id", <ids do dono>)`, e os ids têm que sair da leitura de `vehicle` já filtrada.
   */
  it("filtra as filhas por vehicle_id, com os ids vindos de vehicle escopada pelo dono", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        vehicle: [veiculo({ id: "v1" }), veiculo({ id: "v2", brand: "Honda", model: "Civic" })],
        vehicle_fuel_log: [
          { id: "f1", vehicle_id: "v1", date: "2026-09-01", liters: "40", total_cost: "240", km: 50_000, station: null },
          { id: "f2", vehicle_id: "v1", date: "2026-08-01", liters: "38", total_cost: "228", km: 49_500, station: null },
        ],
        vehicle_maintenance: [],
      },
      log
    );

    await rodar("query_vehicles", {}, db);

    expect(filtro(leituraDe(log, "vehicle"), "eq:user_id")).toBe(USER);
    for (const tabela of ["vehicle_fuel_log", "vehicle_maintenance"]) {
      const leitura = leituraDe(log, tabela);
      expect(temFiltro(leitura, "eq:user_id"), `${tabela} filtrada por user_id`).toBe(false);
      expect(filtro(leitura, "in:vehicle_id"), `${tabela} sem escopo por vehicle_id`).toEqual([
        "v1",
        "v2",
      ]);
    }
  });

  it("query_vehicle_alerts escopa documento e manutenção do mesmo jeito", async () => {
    const log: Recorded[] = [];
    const db = fakeDb(
      {
        vehicle: [veiculo({ id: "v1" })],
        vehicle_document: [
          { id: "d1", vehicle_id: "v1", type: "ipva", custom_type: null, due_date: "2026-09-20", cost: "1200", paid: false },
        ],
        vehicle_maintenance: [],
      },
      log
    );

    const resultado = await rodar("query_vehicle_alerts", {}, db);

    for (const tabela of ["vehicle_document", "vehicle_maintenance"]) {
      const leitura = leituraDe(log, tabela);
      expect(temFiltro(leitura, "eq:user_id"), `${tabela} filtrada por user_id`).toBe(false);
      expect(filtro(leitura, "in:vehicle_id")).toEqual(["v1"]);
    }
    // `ctx.today` é 08/09/2026: o IPVA de 20/09 cai dentro dos 30 dias padrão.
    expect((resultado.alerts as { title: string; status: string }[])).toContainEqual(
      expect.objectContaining({ title: "IPVA", status: "upcoming" })
    );
  });
});

/* ── Truncagem por página cheia ───────────────────────────────────────────────────────────────── */

describe("query_transactions: página cheia vira truncated", () => {
  /**
   * `prompts.ts` manda o modelo avisar quando vem `truncated: true` — e com essa instrução no ar a
   * AUSÊNCIA do campo passa a ser lida como "veio tudo". Uma lista cortada em silêncio vira "essas
   * são todas as suas transações do mês".
   */
  const lancamento = (i: number) => ({
    id: i,
    value: -10,
    description: `Compra ${i}`,
    transaction_at: "2026-09-05T12:00:00Z",
    installment_number: null,
    class: null,
  });

  it("avisa quando vieram exatamente `limit` linhas", async () => {
    const db = fakeDb({ transaction: Array.from({ length: 60 }, (_, i) => lancamento(i)) });

    const resultado = await rodar("query_transactions", { limit: 5 }, db);

    expect(resultado.count).toBe(5);
    expect(resultado.limit).toBe(5);
    expect(resultado.truncated).toBe(true);
    expect(String(resultado.truncated_warning)).toContain("5 lançamentos");
  });

  it("não avisa quando a página veio curta", async () => {
    const db = fakeDb({ transaction: Array.from({ length: 3 }, (_, i) => lancamento(i)) });

    const resultado = await rodar("query_transactions", { limit: 5 }, db);

    expect(resultado.count).toBe(3);
    expect(resultado).not.toHaveProperty("truncated");
  });
});
