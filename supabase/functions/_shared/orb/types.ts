/**
 * Contratos das tools da Orb.
 *
 * REGRA DESTE DIRETÓRIO: nada aqui pode importar um módulo externo nem tocar em API de runtime
 * (`Deno.*`, `process.*`, `fetch` de host). O mesmo código roda em dois lugares —
 * `supabase/functions/orb-agent` (Deno) e `mcp/server.ts` (Node) — e a única forma de manter uma
 * fonte de verdade só para as tools é o client Supabase entrar **injetado**, nunca construído aqui.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * REGRA DE ESCOPO POR TABELA — leia antes de escrever qualquer query nova.
 *
 * (a) Tabelas COM coluna `user_id` e RLS própria (`user_id = auth.uid()`): `.eq("user_id",
 *     ctx.userId)` é OBRIGATÓRIO, mesmo com o RLS ligado — defesa em profundidade, para uma tool
 *     que um dia rode com service role não passar a varrer o banco inteiro.
 *     São elas (confirmadas em `20240101000050_baseline_core_schema.sql`,
 *     `20240101000100_tenancy_rls.sql` e nas migrations que criaram cada módulo):
 *       album, book, book_note, class, content_link, habit, health_metric, medication,
 *       monthly_budget, movie, movie_episode, note, note_link, personal_goal, place_visit,
 *       place_visit_occurrence, project, project_event, recurring_transaction, shopping_category,
 *       shopping_item, tag, task, task_dependency, task_external_link, task_time_entry,
 *       transaction, trip, trip_member, trip_place_opinion, type, vehicle.
 *     Exceção de leitura: `nature` NÃO tem `user_id` — é dimensão global compartilhada; filtre por
 *     ela sempre pelo join (`class → type → nature`), nunca por `user_id`.
 *
 * (b) Tabelas SEM coluna `user_id`, com RLS herdada do pai
 *     (`20240101000100_tenancy_rls.sql:191-210`, `20260806130500_trip_stops.sql:48-49`):
 *       trip_stop, trip_checklist_item, trip_expense, trip_itinerary_day,
 *       trip_itinerary_activity, trip_milestone, vehicle_maintenance, vehicle_fuel_log,
 *       vehicle_document, habit_log.
 *     Escope SEMPRE por `.in("<pai>_id", await ownedIds(ctx, "trip" | "vehicle" | "habit"))`.
 *     A coluna do pai não é sempre `trip_id`: `trip_itinerary_activity` pende de `day_id`
 *     (→ `trip_itinerary_day`), e `habit_log` de `habit_id`.
 *     `.eq("user_id", …)` numa dessas dá **42703 (column does not exist) em runtime** — o erro é
 *     engolido pelo `catch` de `registry.ts` e chega ao modelo como "não consegui consultar", uma
 *     falha silenciosa que parece dado ausente. O teste de `registry.test.ts` guarda essa regra.
 *     `trip_expense` ainda exige, ALÉM do escopo por viagem, o filtro de visibilidade replicado de
 *     `src/api/travel.ts` (manter só `visibility === "shared"` ou `created_by_user_id ===
 *     ctx.userId`): o RLS libera a linha para qualquer membro da viagem.
 *     `trip_expense_split` NÃO pertence a este grupo — ela tem `user_id` próprio
 *     (`20240101000900_shared_trips.sql:62-71`), mas ele é o participante que deve a cota, não o
 *     dono do dado; escope por `expense_id` e use `user_id` como filtro de negócio, nunca de posse.
 *
 * (c) Views (todas `security_invoker`, então o RLS das tabelas-base já filtra):
 *       `vw_monthly_budget_summary` TEM `user_id` (ver `src/types/finance.ts` e
 *       `src/api/finance/budget.ts`) — mantenha o `.eq("user_id", ctx.userId)`.
 *       `vw_value_by_nature_year_month` NÃO TEM: ela agrega por ano/mês
 *       (`20260804150000_spend_month_sql.sql:11-12, group by 1,2`), e `.eq("user_id", …)` nela
 *       quebra com 42703 igual ao grupo (b).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** JSON Schema (subconjunto) do input de uma tool — é o que o LLM e o host MCP enxergam. */
export interface OrbJsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

/**
 * Subconjunto estrutural do client `@supabase/supabase-js` que as tools usam. Tipado de forma
 * frouxa de propósito: tipar o `PostgrestFilterBuilder` genérico aqui exigiria importar o SDK,
 * o que quebraria a portabilidade Deno/Node deste diretório.
 */
// deno-lint-ignore no-explicit-any
export type OrbDb = { from: (table: string) => any };

export interface OrbToolContext {
  db: OrbDb;
  /** `auth.uid()` do usuário dono da sessão. As queries filtram por ele além do RLS. */
  userId: string;
  /** Hoje em `YYYY-MM-DD`, no fuso do usuário (o servidor não tem esse contexto). */
  today: string;
  timezone: string;
}

/**
 * Espelha as `annotations` do MCP (`tools/list`): dicas de comportamento que o host usa para
 * decidir se pede confirmação. São dicas, não garantias — o host não deve confiar nelas para
 * segurança. O default de toda tool sem `annotations` é aplicado por `orbToolAnnotations`.
 */
export interface OrbToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface OrbTool {
  name: string;
  description: string;
  /** Rótulo curto em PT-BR para humano ("Gastos por categoria"); `name` continua sendo o id. */
  title?: string;
  inputSchema: OrbJsonSchema;
  annotations?: OrbToolAnnotations;
  run: (input: Record<string, unknown>, ctx: OrbToolContext) => Promise<unknown>;
}

/**
 * Causa de uma falha de tool, em union fechado. É o que os hosts consomem para DECIDIR o que fazer
 * (reautenticar, pedir outro filtro, avisar o usuário) — antes disto a única pista era o texto da
 * mensagem, e `mcp/server.ts` reconhecia sessão expirada por regex nele. Texto é apresentação e
 * muda; `code` é contrato e não muda.
 */
export type OrbToolErrorCode =
  | "input_invalido"
  | "auth_expirada"
  | "erro_de_banco"
  | "timeout"
  | "nao_encontrado";

/**
 * Forma (parcial) do erro cru que o PostgREST/GoTrue devolve em `{ data, error, status }`.
 *
 * Existe para `unwrap` conseguir CLASSIFICAR o erro antes de descartá-lo: `message`, `details` e
 * `hint` carregam nome de coluna, nome de constraint e às vezes trecho de SQL — nada disso pode
 * chegar ao modelo, mas a causa (sessão expirada vs. erro de banco) precisa sobreviver.
 */
export interface OrbToolErrorDetail {
  message?: string;
  details?: string;
  hint?: string;
  /** Código do PostgREST (`PGRST301`) ou do Postgres (`42703`). */
  code?: string;
  /** HTTP da resposta — vem no envelope, não dentro de `error`. */
  status?: number;
}

/**
 * Erro de tool que deve virar resposta pro modelo, não exceção que derruba o processo.
 *
 * `message` é o que o modelo lê: escreva sempre em PT-BR, estável e sem detalhe técnico.
 * `detail` é o que o operador lê no log: pode conter o texto cru do banco e NUNCA vai para o
 * modelo nem para a UI.
 */
export class OrbToolError extends Error {
  readonly code: OrbToolErrorCode;
  readonly detail?: string;

  /** `code` tem padrão para quem já lançava `new OrbToolError(msg)` continuar valendo. */
  constructor(message: string, code: OrbToolErrorCode = "input_invalido", detail?: string) {
    super(message);
    this.name = "OrbToolError";
    this.code = code;
    this.detail = detail;
  }
}
