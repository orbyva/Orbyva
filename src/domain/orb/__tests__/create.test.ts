import { describe, expect, it } from "vitest";

import {
  isOrbProposal,
  orbProposalIdentity,
  sanitizeOrbProposalPayload,
  type OrbCreateKind,
  type OrbProposal,
} from "../../../../supabase/functions/_shared/orb/actions.ts";
import { runOrbTool } from "../../../../supabase/functions/_shared/orb/registry.ts";
import { fakeDb, type Recorded } from "./fakeDb";

const ctx = (db: ReturnType<typeof fakeDb>) => ({
  db,
  userId: "user-1",
  today: "2026-09-10",
  timezone: "America/Sao_Paulo",
});

const CATEGORIA = {
  id: 42,
  name: "Mercado",
  type: { id: 7, name: "Alimentação", nature: { name: "Despesa" } },
};

describe("sanitizeOrbProposalPayload", () => {
  it("deixa passar só o que a whitelist do tipo declara", () => {
    const limpo = sanitizeOrbProposalPayload("task", {
      title: "Pintar",
      due_date: "2026-09-12",
      user_id: "outro-usuario",
      status: "todo",
    });
    expect(limpo).toEqual({ title: "Pintar", due_date: "2026-09-12", status: "todo" });
    // O campo que não é da entidade some antes de chegar perto de um insert.
    expect(limpo).not.toHaveProperty("user_id");
  });

  it("recusa payload sem campo obrigatório ou com tipo errado", () => {
    expect(sanitizeOrbProposalPayload("task", { due_date: "2026-09-12" })).toBeNull();
    expect(sanitizeOrbProposalPayload("transaction", { description: "x", value: "80" })).toBeNull();
    expect(sanitizeOrbProposalPayload("note", null)).toBeNull();
  });
});

describe("propose_create", () => {
  it("monta a tarefa com prazo e projeto resolvido pelo nome", async () => {
    const log: Recorded[] = [];
    const db = fakeDb({ project: [{ id: "p-1", name: "Sacada" }] }, log);
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "task",
        title: "Comprar cimento",
        date: "2026-09-12",
        time: "09:30",
        priority: "high",
        project: "Sacada",
      },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(isOrbProposal(result)).toBe(true);
    expect(result).toMatchObject({
      kind: "task",
      label: "Nova tarefa",
      payload: {
        title: "Comprar cimento",
        due_date: "2026-09-12",
        due_time: "09:30:00",
        priority: "high",
        project_id: "p-1",
        status: "todo",
      },
    });
    // Nada foi gravado: a única ida ao banco foi a leitura do projeto.
    expect(log.every((entry) => entry.table === "project")).toBe(true);
  });

  it("resolve a categoria financeira e usa hoje quando não vem data", async () => {
    const db = fakeDb({ class: [CATEGORIA] });
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "transaction", title: "Feira", value: 82.5, category: "Mercado" },
      ctx(db)
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "transaction",
      payload: { description: "Feira", value: 82.5, class_id: 42 },
    });
    const proposta = result as { payload: { transaction_at: string }; fields: { value: string }[] };
    expect(proposta.payload.transaction_at.startsWith("2026-09-10")).toBe(true);
    expect(proposta.fields.map((campo) => campo.value)).toContain("Mercado (Despesa)");
  });

  it("recusa lançamento sem valor, pedindo o dado em vez de inventar", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "transaction", title: "Feira", category: "Mercado" },
      ctx(fakeDb({ class: [CATEGORIA] }))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("value");
  });

  it("recusa categoria que não existe", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "transaction", title: "Feira", value: 10, category: "Padaria" },
      ctx(fakeDb({ class: [] }))
    );
    expect(ok).toBe(false);
    expect((result as { code: string }).code).toBe("nao_encontrado");
  });

  it("pede desempate quando o nome do projeto casa com vários", async () => {
    const db = fakeDb({
      project: [
        { id: "p-1", name: "Casa de praia" },
        { id: "p-2", name: "Casa da serra" },
      ],
    });
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "task", title: "Pintar", project: "Casa" },
      ctx(db)
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("Pergunte qual");
  });

  it("grava o evento no fuso do usuário, não em UTC", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "event", title: "Dentista", date: "2026-09-20", time: "14:00", end_time: "15:00" },
      ctx(fakeDb({}))
    );

    expect(ok).toBe(true);
    // O cartão diz 14:00 e o banco tem que concordar: `starts_at` é `timestamptz`, e sem o offset o
    // Postgres casta "14:00" como UTC — a agenda mostraria 11:00 para quem confirmou 14:00.
    expect(result).toMatchObject({
      kind: "event",
      payload: {
        starts_at: "2026-09-20T17:00:00.000Z",
        ends_at: "2026-09-20T18:00:00.000Z",
      },
    });
    const proposta = result as { fields: { label: string; value: string }[] };
    expect(proposta.fields.find((campo) => campo.label === "Quando")?.value).toContain("14:00");
  });

  it("evento sem horário falha pedindo a hora — não inventa 09:00", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "event", title: "Jogo do Flamengo", date: "2026-09-27" },
      ctx(fakeDb({}))
    );

    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toMatch(/time|hora|Pergunte/i);
  });

  it("evento ainda exige a data", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "event", title: "Dentista" },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toMatch(/date/i);
  });

  it("recusa data fora do formato", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "task", title: "Pintar", date: "12/09/2026" },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toContain("YYYY-MM-DD");
  });

  it("diz explicitamente que nada foi gravado", async () => {
    const { result } = await runOrbTool(
      "propose_create",
      { kind: "note", title: "Ideias", description: "texto" },
      ctx(fakeDb({}))
    );
    expect(result).toMatchObject({ status: "aguardando_confirmacao" });
    expect(String((result as { note: string }).note)).toContain("Nada foi gravado");
  });

  it("monta compra parcelada dividindo o total", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "recurring",
        title: "iPhone",
        value: 2000,
        installment_count: 12,
        category: "Mercado",
        date: "2026-09-10",
      },
      ctx(fakeDb({ class: [CATEGORIA] }))
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "recurring",
      label: "Nova recorrência",
      payload: {
        description: "iPhone",
        value: 166.67,
        class_id: 42,
        frequency: "Mensal",
        installment_count: 12,
        payment_start_date: "2026-09-10",
        due_day: 10,
        status: true,
      },
    });
    expect((result as { payload: Record<string, unknown> }).payload).not.toHaveProperty(
      "validity"
    );
  });

  it("monta conta fixa mensal até dezembro do ano", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "recurring",
        title: "Aluguel",
        value: 1500,
        category: "Mercado",
        date: "2026-09-10",
        frequency: "Mensal",
      },
      ctx(fakeDb({ class: [CATEGORIA] }))
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "recurring",
      payload: {
        description: "Aluguel",
        value: 1500,
        frequency: "Mensal",
        validity: "2026-12-31",
        installment_count: 4,
        payment_start_date: "2026-09-10",
      },
    });
  });

  it("monta orçamento do mês pela categoria", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "budget",
        category: "Mercado",
        value: 800,
        date: "2026-09",
      },
      ctx(fakeDb({ class: [CATEGORIA] }))
    );

    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "budget",
      label: "Novo orçamento",
      payload: {
        type_id: 7,
        class_id: 42,
        budget_month: "2026-09-01",
        planned_value: 800,
      },
    });
  });

  it("monta tipo financeiro com natureza resolvida", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "finance_type", title: "Transporte", nature: "Despesa" },
      ctx(fakeDb({ nature: [{ id: 1, name: "Despesa" }] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "finance_type",
      payload: { name: "Transporte", nature_id: 1 },
    });
  });

  it("monta subcategoria sob o tipo pai", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "finance_class", title: "Uber", category: "Transporte" },
      ctx(fakeDb({ type: [{ id: 9, name: "Transporte" }] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "finance_class",
      payload: { name: "Uber", type_id: 9 },
    });
  });

  it("propõe excluir orçamento existente", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "budget_delete", category: "Mercado", date: "2026-09" },
      ctx(
        fakeDb({
          class: [CATEGORIA],
          monthly_budget: [{ id: 55, class_id: 42, budget_month: "2026-09-01", planned_value: 800 }],
        })
      )
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "budget_delete",
      payload: { id: 55 },
    });
  });

  it("pede until antes de replicar orçamento", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "budget_replicate", date: "2026-09" },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toMatch(/until|ask_user/i);
  });

  it("monta check-in de hábito pelo nome", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "habit_checkin", title: "Meditar" },
      ctx(fakeDb({ habit: [{ id: "h-1", name: "Meditar" }] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "habit_checkin",
      payload: { habit_id: "h-1", date: "2026-09-10", completed: true },
    });
  });

  it("marca filme existente como watched", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "movie_mark", title: "Duna", rating: 9 },
      ctx(fakeDb({ movie: [{ imdb_id: "tt1160419", title: "Duna", status: "to_watch" }] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "movie_mark",
      payload: {
        imdb_id: "tt1160419",
        title: "Duna",
        status: "watched",
        rating: 9,
        is_new: false,
      },
    });
  });

  it("propõe adicionar filme novo quando ainda não está na lista", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "movie_mark", title: "Interestelar" },
      ctx(fakeDb({ movie: [] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "movie_mark",
      payload: {
        title: "Interestelar",
        status: "to_watch",
        is_new: true,
      },
    });
    expect((result as { payload: Record<string, unknown> }).payload.imdb_id).toBeUndefined();
    const fields = (result as { fields: { label: string; value: string }[] }).fields;
    expect(fields.some((f) => f.label === "Ação" && /adicionar/i.test(f.value))).toBe(true);
    expect(fields.some((f) => f.label === "Status" && f.value === "Quero ver")).toBe(true);
  });

  it("pede desempate quando o título do filme é ambíguo", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "movie_mark", title: "Duna" },
      ctx(
        fakeDb({
          movie: [
            { imdb_id: "tt1", title: "Duna" },
            { imdb_id: "tt2", title: "Duna: Parte Dois" },
          ],
        })
      )
    );
    // "Duna" casa exato com o primeiro; se só ilike sem exato e 2 resultados → ask.
    // Com exato "Duna" presente, desempata sozinho.
    expect(ok).toBe(true);
    expect((result as { payload: { imdb_id: string } }).payload.imdb_id).toBe("tt1");
  });

  it("atualiza página do livro", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "book_progress", title: "1984", page: 120 },
      ctx(fakeDb({ book: [{ google_id: "g-1", title: "1984", status: "reading" }] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "book_progress",
      payload: {
        google_id: "g-1",
        title: "1984",
        current_page: 120,
        status: "reading",
        is_new: false,
      },
    });
  });

  it("adiciona livro novo quando não está na estante", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "book_progress", title: "Neuromancer", content_status: "quero ler" },
      ctx(fakeDb({ book: [] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "book_progress",
      payload: { title: "Neuromancer", status: "to_read", is_new: true },
    });
    expect((result as { payload: { google_id?: string } }).payload.google_id).toBeUndefined();
  });

  it("cria hábito diário de saúde", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "habit_create", title: "Beber água", frequency: "daily", content_status: "saude" },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "habit_create",
      payload: {
        name: "Beber água",
        frequency: "daily",
        target_per_week: 7,
        is_health: true,
      },
    });
  });

  it("cria veículo a partir do nome", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "vehicle_create", title: "Fiat Uno", km: 45000, content_status: "car" },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "vehicle_create",
      payload: { brand: "Fiat", model: "Uno", kind: "car", current_km: 45000 },
    });
  });

  it("marca episódio de série existente", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "series_episode", title: "Breaking Bad", season: 2, episode: 5 },
      ctx(fakeDb({ movie: [{ imdb_id: "tt0903747", title: "Breaking Bad", type: "series" }] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "series_episode",
      payload: {
        imdb_id: "tt0903747",
        season: 2,
        episode: 5,
        is_new: false,
      },
    });
  });

  it("propõe série nova + episódio quando não está na lista", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "series_episode", title: "The Bear", season: 1, episode: 1 },
      ctx(fakeDb({ movie: [] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "series_episode",
      payload: { title: "The Bear", season: 1, episode: 1, is_new: true },
    });
  });

  it("cria medicação com horários", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "medication_create",
        title: "Losartana",
        times: "08:00,20:00",
        quantity: 1,
        unit: "comprimido",
      },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "medication_create",
      payload: {
        name: "Losartana",
        times: "08:00,20:00",
        dose_amount: 1,
        dose_unit: "comprimido",
        started_on: "2026-09-10",
      },
    });
  });

  it("agenda consulta", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "consultation_create",
        title: "Clínico geral",
        date: "2026-09-20",
        time: "14:30",
      },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "consultation_create",
      payload: {
        title: "Clínico geral",
        due_date: "2026-09-20",
        due_time: "14:30:00",
      },
    });
  });

  it("adiciona álbum novo à wishlist", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "album_wishlist", title: "OK Computer", description: "Radiohead" },
      ctx(fakeDb({ album: [] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "album_wishlist",
      payload: { title: "OK Computer", status: "to_listen", is_new: true },
    });
    expect(String((result as { payload: { musicbrainz_id: string } }).payload.musicbrainz_id)).toMatch(
      /^manual-/
    );
  });

  it("registra visita a lugar novo", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "place_visit", title: "Café Central", category: "cafe", rating: 8 },
      ctx(fakeDb({ place_visit: [] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "place_visit",
      payload: {
        name: "Café Central",
        type: "cafe",
        status: "visited",
        visited_date: "2026-09-10",
        rating: 8,
      },
    });
  });

  it("atualiza meta com aporte", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      { kind: "goal_update", title: "Viagem", value: 200, content_status: "aporte" },
      ctx(fakeDb({ personal_goal: [{ id: "g-1", title: "Viagem", current_value: 1000 }] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "goal_update",
      payload: { goal_id: "g-1", add_value: 200 },
    });
  });

  it("monta abastecimento pelo apelido do veículo", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "fuel_log",
        category: "Goleta",
        liters: 40,
        value: 280,
        km: 45200,
        date: "2026-09-10",
      },
      ctx(
        fakeDb({
          vehicle: [{ id: "v-1", brand: "VW", model: "Goleta", plate: "ABC1D23", notes: null }],
        })
      )
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "fuel_log",
      payload: {
        vehicle_id: "v-1",
        liters: 40,
        total_cost: 280,
        km: 45200,
        date: "2026-09-10",
      },
    });
  });

  it("monta viagem com destino e intervalo", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "trip",
        title: "Férias RJ",
        date: "2026-10-01",
        until: "2026-10-07",
        category: "Rio de Janeiro",
        value: 5000,
      },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "trip",
      payload: {
        title: "Férias RJ",
        start_date: "2026-10-01",
        end_date: "2026-10-07",
        destination: "Rio de Janeiro",
        budget: 5000,
        status: "planning",
        stop1_name: "Rio de Janeiro",
        stop1_start: "2026-10-01",
        stop1_end: "2026-10-07",
      },
    });
  });

  it("recusa destino colado como parágrafo do pedido", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "trip",
        title: "Teresina",
        date: "2026-10-01",
        until: "2026-10-15",
        category:
          "Saída de Valparaíso às 03:30. De 10/10 a 15/10, estadia em Elesbão Veloso.",
      },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toMatch(/nome da cidade/i);
  });

  it("pede meio de deslocamento quando há origem/horário sem transport_mode", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "trip",
        title: "Teresina",
        date: "2026-10-01",
        until: "2026-10-15",
        category: "Teresina",
        origin: "Valparaíso",
        time: "03:30",
        stop2: "Elesbão Veloso",
        stop2_start: "2026-10-10",
      },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(false);
    expect(String((result as { error: string }).error)).toMatch(/ask_user/i);
    expect(String((result as { error: string }).error)).toMatch(/meio de deslocamento|Carro/i);
  });

  it("monta viagem multi-parada com origem, horário e modo", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "trip",
        title: "Teresina",
        date: "2026-10-01",
        until: "2026-10-15",
        category: "Teresina",
        origin: "Valparaíso",
        time: "03:30",
        transport_mode: "bus",
        stop2: "Elesbão Veloso",
        stop2_start: "2026-10-10",
      },
      ctx(fakeDb({}))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "trip",
      payload: {
        title: "Teresina",
        start_date: "2026-10-01",
        end_date: "2026-10-15",
        destination: "Teresina → Elesbão Veloso",
        origin_label: "Valparaíso",
        outbound_depart: "03:30",
        transport_mode: "bus",
        stop1_name: "Teresina",
        stop1_start: "2026-10-01",
        stop1_end: "2026-10-09",
        stop2_name: "Elesbão Veloso",
        stop2_start: "2026-10-10",
        stop2_end: "2026-10-15",
      },
    });
    const fields = (result as { fields: { label: string; value: string }[] }).fields;
    expect(fields.some((f) => f.label === "Origem" && f.value === "Valparaíso")).toBe(true);
    expect(fields.some((f) => f.label === "Ida — saída" && f.value === "03:30")).toBe(true);
    expect(fields.some((f) => f.label === "Modo" && f.value === "Ônibus")).toBe(true);
  });

  it("monta atividade de roteiro no dia da viagem", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "trip_activity",
        project: "Férias RJ",
        title: "Cristo Redentor",
        date: "2026-10-02",
        time: "10:00",
        category: "attraction",
      },
      ctx(
        fakeDb({
          trip: [{ id: "t-1", title: "Férias RJ" }],
          trip_itinerary_day: [{ id: "d-1", trip_id: "t-1", date: "2026-10-02", day_number: 2 }],
        })
      )
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "trip_activity",
      payload: {
        day_id: "d-1",
        trip_id: "t-1",
        title: "Cristo Redentor",
        activity_time: "10:00:00",
        category: "attraction",
      },
    });
  });

  it("monta roteiro do dia com várias atividades e horários", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "trip_day_plan",
        project: "Teresina",
        date: "2026-10-07",
        description:
          "09:00|Parque Zoobotânico|park\n12:30-14:00|Almoço no Mercado Central|restaurant\n15:00|Palácio de Karnak|attraction",
      },
      ctx(
        fakeDb({
          trip: [{ id: "t-2", title: "Teresina" }],
          trip_itinerary_day: [
            { id: "d-7", trip_id: "t-2", date: "2026-10-07", day_number: 7 },
          ],
        })
      )
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "trip_day_plan",
      payload: {
        trip_id: "t-2",
        day_id: "d-7",
        plan_date: "2026-10-07",
      },
    });
    const payload = (result as { payload: { activities_json: string } }).payload;
    const acts = JSON.parse(payload.activities_json) as {
      title: string;
      activity_time: string;
      arrival_time: string | null;
      category: string;
    }[];
    expect(acts).toHaveLength(3);
    expect(acts[0]).toMatchObject({
      title: "Parque Zoobotânico",
      activity_time: "09:00:00",
      category: "park",
    });
    expect(acts[1]).toMatchObject({
      title: "Almoço no Mercado Central",
      activity_time: "12:30:00",
      arrival_time: "14:00:00",
      category: "restaurant",
    });
    const fields = (result as { fields: { label: string; value: string }[] }).fields;
    expect(fields.some((f) => f.label === "09:00" && f.value.includes("Parque Zoobotânico · Parque"))).toBe(
      true
    );
  });

  it("aceita categorias do roteiro em português e mostra no cartão em PT", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "trip_day_plan",
        project: "Teresina",
        date: "2026-10-07",
        description:
          "09:00|Parque Zoobotânico|parque\n11:30|Museu do Piauí|museu\n13:00|Almoço no Centro|restaurante",
      },
      ctx(
        fakeDb({
          trip: [{ id: "t-2", title: "Teresina" }],
          trip_itinerary_day: [
            { id: "d-7", trip_id: "t-2", date: "2026-10-07", day_number: 7 },
          ],
        })
      )
    );
    expect(ok).toBe(true);
    const payload = (result as { payload: { activities_json: string } }).payload;
    const acts = JSON.parse(payload.activities_json) as { category: string }[];
    expect(acts.map((a) => a.category)).toEqual(["park", "museum", "restaurant"]);
    const fields = (result as { fields: { label: string; value: string }[] }).fields;
    expect(fields.some((f) => f.value === "Parque Zoobotânico · Parque")).toBe(true);
    expect(fields.some((f) => f.value === "Museu do Piauí · Museu")).toBe(true);
    expect(fields.some((f) => f.value === "Almoço no Centro · Restaurante")).toBe(true);
  });

  it("adia roteiro do dia quando a viagem ainda não existe (mesmo turno)", async () => {
    const { ok, result } = await runOrbTool(
      "propose_create",
      {
        kind: "trip_day_plan",
        project: "Viagem para Piauí",
        date: "2026-10-07",
        description: "09:00|Parque da Cidadania|park\n11:00|Museu do Piauí|museum",
      },
      ctx(fakeDb({ trip: [] }))
    );
    expect(ok).toBe(true);
    expect(result).toMatchObject({
      kind: "trip_day_plan",
      payload: {
        pending_trip_title: "Viagem para Piauí",
        plan_date: "2026-10-07",
      },
    });
    expect((result as { payload: Record<string, unknown> }).payload.trip_id).toBeUndefined();
    const fields = (result as { fields: { label: string; value: string }[] }).fields;
    expect(
      fields.some(
        (f) => f.label === "Status" && /aguardando criar a viagem/i.test(f.value)
      )
    ).toBe(true);
  });
});

describe("orbProposalIdentity", () => {
  const proposta = (kind: OrbCreateKind, payload: Record<string, unknown>): OrbProposal => ({
    kind,
    label: "x",
    fields: [],
    payload,
  });

  it("casa a mesma coisa reproposta com mais campos", () => {
    // É o caso de "com prazo para sexta": a tool não edita, o modelo manda a tarefa inteira de novo.
    expect(orbProposalIdentity(proposta("task", { title: "Comprar cigarro" }))).toBe(
      orbProposalIdentity(
        proposta("task", { title: "Comprar cigarro", due_date: "2026-09-18", project_id: "p-1" })
      )
    );
  });

  it("ignora acento, caixa e espaço sobrando", () => {
    expect(orbProposalIdentity(proposta("note", { title: "  Ideias  de   Férias " }))).toBe(
      orbProposalIdentity(proposta("note", { title: "ideias de ferias" }))
    );
  });

  it("separa coisas diferentes, inclusive de tipos diferentes com o mesmo nome", () => {
    expect(orbProposalIdentity(proposta("task", { title: "Sacada" }))).not.toBe(
      orbProposalIdentity(proposta("project", { name: "Sacada" }))
    );
    expect(orbProposalIdentity(proposta("task", { title: "Pintar" }))).not.toBe(
      orbProposalIdentity(proposta("task", { title: "Pintar a parede" }))
    );
  });

  it("usa a descrição no lançamento, que é o texto que a pessoa reconhece", () => {
    expect(orbProposalIdentity(proposta("transaction", { description: "Feira", value: 80 }))).toBe(
      orbProposalIdentity(proposta("transaction", { description: "feira", value: 82.5 }))
    );
  });
});
