# Núcleo de Tarefas/Projetos (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar ao Orbyva um módulo novo e independente de Tarefas/Projetos — criação de projetos, tarefas com tags/prazo/subtarefas/dependências, visão Lista + Kanban, timer "Live" (start/pause/stop) e recorrência simples — sem depender de Metas/Hábitos e sem Supabase Realtime.

**Architecture:** Segue exatamente o padrão de camadas já usado em `goals`/`habits`: `supabase/migrations` (schema + RLS por `user_id`) → `src/types/tasks.ts` (contratos) → `src/domain/tasks/*` (regras puras testáveis com Vitest) → `src/api/tasks/*` (I/O Supabase, chama `domain/tasks` para materializar recorrência) → `src/pages/admin/tasks/*` (UI, PageShell/EmptyState/ConfirmDeleteDialog como em Goals.tsx) → registro em `routes.tsx` e novo grupo "Produtividade" em `app-sidebar.tsx`.

**Tech Stack:** React 19 + TypeScript strict, Vite, Supabase JS, Tailwind + shadcn/ui (Radix), Vitest.

## Global Constraints

- RLS estritamente por `user_id` — sem convites/colaboração (igual Finanças/Hábitos/Metas), confirmado no brainstorm.
- Sem Supabase Realtime no v1 — fetch tradicional (`useEffect` + reload após mutação), igual ao resto do app.
- v1 cobre só Lista + Kanban. Calendário e Gantt/cronograma ficam para v2 — não implementar nesta rodada.
- Kanban sem drag-and-drop: mudança de status via botões (evita nova dependência de DnD library — YAGNI).
- Dependências entre tarefas são **soft-block**: mostrar aviso visual, nunca impedir a ação do usuário.
- Recorrência: apenas `daily | weekly | monthly` + `interval` (sem múltiplos dias da semana) — "recorrência simples" confirmada no brainstorm.
- Geração de instâncias recorrentes é **lazy**, no momento do `fetchTasks` — sem cron/Edge Function nova.
- Tabelas em `snake_case` singular (`project`, `task`, `task_dependency`, `task_time_entry`), mesmo padrão de `book`, `movie`, `personal_goal`.
- `ModuleGuide`/`ModuleGuideButton` (onboarding tooltip) fica fora do escopo do v1 — exigiria estender a união de tipos `ModuleGuideId` em `src/lib/moduleGuides.ts`; não é requisito do design.
- Toda mutação usa `useToast` (`@/hooks/use-toast`) + `getErrorMessage` (`@/lib/errors`) para erros amigáveis, igual `Goals.tsx`.

---

## Task 1: Migration — schema `project`, `task`, `task_dependency`, `task_time_entry`

**Files:**
- Create: `supabase/migrations/20260803120000_tasks_projects.sql`

**Interfaces:**
- Produces: tabelas Postgres `public.project`, `public.task`, `public.task_dependency`, `public.task_time_entry` com RLS, usadas por todas as tasks seguintes via Supabase client.

- [ ] **Step 1: Escrever a migration**

```sql
-- Módulo Tarefas/Projetos — núcleo v1 (independente de Metas/Hábitos, RLS por user_id).

create table if not exists public.project (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text,
  goal_id uuid references public.personal_goal(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_user_status_idx
  on public.project (user_id, status);

comment on table public.project is
  'Projetos do usuário — agrupam tarefas; goal_id linka opcionalmente a uma Meta existente.';

alter table public.project enable row level security;

drop policy if exists project_select_own on public.project;
create policy project_select_own on public.project
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists project_insert_own on public.project;
create policy project_insert_own on public.project
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists project_update_own on public.project;
create policy project_update_own on public.project
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists project_delete_own on public.project;
create policy project_delete_own on public.project
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.task (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.project(id) on delete cascade,
  parent_task_id uuid references public.task(id) on delete cascade,
  recurrence_origin_id uuid references public.task(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'doing', 'done')),
  tags text[] not null default '{}',
  due_date date,
  recurrence_rule jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_user_status_idx
  on public.task (user_id, status);
create index if not exists task_project_idx
  on public.task (project_id);
create index if not exists task_recurrence_origin_idx
  on public.task (recurrence_origin_id);

comment on table public.task is
  'Tarefas — avulsas (project_id nulo) ou de um projeto; subtarefas via parent_task_id; '
  'recorrência: a tarefa-origem guarda recurrence_rule, instâncias geradas apontam '
  'recurrence_origin_id para ela.';

alter table public.task enable row level security;

drop policy if exists task_select_own on public.task;
create policy task_select_own on public.task
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists task_insert_own on public.task;
create policy task_insert_own on public.task
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists task_update_own on public.task;
create policy task_update_own on public.task
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists task_delete_own on public.task;
create policy task_delete_own on public.task
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.task_dependency (
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.task(id) on delete cascade,
  depends_on_task_id uuid not null references public.task(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

comment on table public.task_dependency is
  'task_id só pode avançar sem aviso quando depends_on_task_id estiver "done" (soft-block na UI).';

alter table public.task_dependency enable row level security;

drop policy if exists task_dependency_select_own on public.task_dependency;
create policy task_dependency_select_own on public.task_dependency
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists task_dependency_insert_own on public.task_dependency;
create policy task_dependency_insert_own on public.task_dependency
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists task_dependency_delete_own on public.task_dependency;
create policy task_dependency_delete_own on public.task_dependency
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.task_time_entry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.task(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists task_time_entry_task_idx
  on public.task_time_entry (task_id);

-- Garante um único timer rodando por usuário (seção "Live").
create unique index if not exists task_time_entry_one_running_idx
  on public.task_time_entry (user_id)
  where (ended_at is null);

comment on table public.task_time_entry is
  'Timer da seção Live — ended_at nulo = timer em andamento.';

alter table public.task_time_entry enable row level security;

drop policy if exists task_time_entry_select_own on public.task_time_entry;
create policy task_time_entry_select_own on public.task_time_entry
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists task_time_entry_insert_own on public.task_time_entry;
create policy task_time_entry_insert_own on public.task_time_entry
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists task_time_entry_update_own on public.task_time_entry;
create policy task_time_entry_update_own on public.task_time_entry
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists task_time_entry_delete_own on public.task_time_entry;
create policy task_time_entry_delete_own on public.task_time_entry
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui as novas tabelas no wipe de conta (lista mais recente de wipe_own_data,
-- copiada de 20260728160000_albums.sql + tarefas/projetos).
create or replace function public.wipe_own_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  foreach t in array array[
    'transaction',
    'recurring_transaction',
    'monthly_budget',
    'movie',
    'movie_episode',
    'book_note',
    'book',
    'album',
    'personal_goal',
    'habit',
    'place_visit',
    'trip',
    'vehicle',
    'class',
    'type',
    'task_time_entry',
    'task_dependency',
    'task',
    'project'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;

-- Gate de acesso Pro (mesmo padrão das demais tabelas do app).
do $$
declare
  t text;
begin
  if to_regclass('public.enforce_app_access') is null
     and not exists (
       select 1 from pg_proc where proname = 'enforce_app_access'
     ) then
    raise notice 'enforce_app_access ausente — skip triggers tasks/projects';
    return;
  end if;

  foreach t in array array['project', 'task', 'task_dependency', 'task_time_entry']
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists trg_enforce_app_access on public.%I', t);
    execute format(
      'create trigger trg_enforce_app_access before insert or update or delete on public.%I for each row execute function public.enforce_app_access()',
      t
    );
  end loop;
end;
$$;
```

- [ ] **Step 2: Revisar contra o padrão existente**

Comparar lado a lado com `supabase/migrations/20260728120000_books.sql` e `20260728160000_albums.sql`: mesmas 4 policies por tabela (select/insert/update/delete `_own`), mesmo formato do gate `enforce_app_access`, `wipe_own_data` com o array completo (não só as tabelas novas). Confirmar que `to_regclass` guarda contra re-execução em ambiente sem `enforce_app_access` ainda criado.

- [ ] **Step 3: Aplicar a migration**

Run: `supabase db push`
Expected: migration aplicada sem erro; `select * from public.project limit 1;` e `select * from public.task limit 1;` retornam tabela vazia sem erro de permissão quando autenticado.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260803120000_tasks_projects.sql
git commit -m "feat: cria schema de tarefas/projetos (project, task, task_dependency, task_time_entry)"
```

---

## Task 2: Types — `src/types/tasks.ts`

**Files:**
- Create: `src/types/tasks.ts`

**Interfaces:**
- Consumes: nenhuma (types puros).
- Produces: `Project`, `ProjectCreateRequest`, `ProjectUpdateRequest`, `ProjectStatus`, `Task`, `TaskCreateRequest`, `TaskUpdateRequest`, `TaskStatus`, `RecurrenceRule`, `RecurrenceFrequency`, `TaskDependency`, `TaskTimeEntry` — usados por todas as tasks seguintes.

- [ ] **Step 1: Escrever os types**

```ts
export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  color?: string | null;
  goal_id?: string | null;
  status: ProjectStatus;
  created_at?: string;
  updated_at?: string;
}

export type ProjectCreateRequest = Omit<
  Project,
  "id" | "user_id" | "created_at" | "updated_at"
>;

export type ProjectUpdateRequest = Partial<ProjectCreateRequest> & {
  id: string;
};

export type TaskStatus = "todo" | "doing" | "done";
export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  until?: string | null;
}

export interface Task {
  id: string;
  user_id?: string;
  project_id: string | null;
  parent_task_id: string | null;
  recurrence_origin_id: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  tags: string[];
  due_date: string | null;
  recurrence_rule: RecurrenceRule | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type TaskCreateRequest = Omit<
  Task,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "recurrence_origin_id"
  | "completed_at"
>;

export type TaskUpdateRequest = Partial<TaskCreateRequest> & { id: string };

export interface TaskDependency {
  task_id: string;
  depends_on_task_id: string;
}

export interface TaskTimeEntry {
  id: string;
  user_id?: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  created_at?: string;
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos relacionados a `src/types/tasks.ts` (arquivo isolado, sem consumidores ainda).

- [ ] **Step 3: Commit**

```bash
git add src/types/tasks.ts
git commit -m "feat: adiciona types do módulo de tarefas/projetos"
```

---

## Task 3: Domain — `recurrence.ts` (geração lazy de ocorrências)

**Files:**
- Create: `src/domain/tasks/recurrence.ts`
- Test: `src/domain/tasks/__tests__/recurrence.test.ts`

**Interfaces:**
- Consumes: `RecurrenceRule` de `@/types/tasks`.
- Produces: `computeMissingOccurrences(originDueDate: string, rule: RecurrenceRule, existingDates: string[], today: string): string[]` — usada pela Task 8 (`api/tasks/tasks.ts`).

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { computeMissingOccurrences } from "@/domain/tasks/recurrence";

describe("computeMissingOccurrences", () => {
  it("gera ocorrências diárias faltantes até hoje", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      [],
      "2026-08-04"
    );
    expect(result).toEqual(["2026-08-02", "2026-08-03", "2026-08-04"]);
  });

  it("não gera ocorrências além de hoje", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      [],
      "2026-08-01"
    );
    expect(result).toEqual([]);
  });

  it("pula datas já existentes", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1 },
      ["2026-08-02"],
      "2026-08-03"
    );
    expect(result).toEqual(["2026-08-03"]);
  });

  it("respeita intervalo semanal", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "weekly", interval: 1 },
      [],
      "2026-08-20"
    );
    expect(result).toEqual(["2026-08-08", "2026-08-15"]);
  });

  it("respeita intervalo mensal", () => {
    const result = computeMissingOccurrences(
      "2026-01-31",
      { frequency: "monthly", interval: 1 },
      [],
      "2026-04-01"
    );
    expect(result).toEqual(["2026-03-03"]);
  });

  it("para no limite `until`", () => {
    const result = computeMissingOccurrences(
      "2026-08-01",
      { frequency: "daily", interval: 1, until: "2026-08-02" },
      [],
      "2026-08-10"
    );
    expect(result).toEqual(["2026-08-02"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/domain/tasks/__tests__/recurrence.test.ts`
Expected: FAIL — `Cannot find module '@/domain/tasks/recurrence'`.

- [ ] **Step 3: Implementar `recurrence.ts`**

```ts
import type { RecurrenceRule } from "@/types/tasks";

function addOccurrence(iso: string, rule: RecurrenceRule): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d, 12);
  if (rule.frequency === "daily") {
    next.setDate(next.getDate() + rule.interval);
  } else if (rule.frequency === "weekly") {
    next.setDate(next.getDate() + 7 * rule.interval);
  } else {
    next.setMonth(next.getMonth() + rule.interval);
  }
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Calcula quais ocorrências (datas ISO) de uma tarefa recorrente ainda faltam
 * gerar entre a origem e hoje. Puro — a materialização (insert no banco) fica
 * em `api/tasks/tasks.ts`.
 */
export function computeMissingOccurrences(
  originDueDate: string,
  rule: RecurrenceRule,
  existingDates: string[],
  today: string
): string[] {
  const existing = new Set(existingDates);
  const missing: string[] = [];
  let cursor = addOccurrence(originDueDate, rule);
  let guard = 0;

  while (cursor <= today && guard < 1000) {
    guard += 1;
    if (rule.until && cursor > rule.until) break;
    if (!existing.has(cursor)) missing.push(cursor);
    cursor = addOccurrence(cursor, rule);
  }

  return missing;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/domain/tasks/__tests__/recurrence.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/domain/tasks/recurrence.ts src/domain/tasks/__tests__/recurrence.test.ts
git commit -m "feat: adiciona geração lazy de ocorrências recorrentes de tarefas"
```

---

## Task 4: Domain — `dependencies.ts` (ciclo e soft-block)

**Files:**
- Create: `src/domain/tasks/dependencies.ts`
- Test: `src/domain/tasks/__tests__/dependencies.test.ts`

**Interfaces:**
- Consumes: nenhuma (tipos locais `DependencyEdge`).
- Produces: `wouldCreateCycle(edges, taskId, dependsOnTaskId): boolean`, `hasOpenDependencies(taskId, edges, doneTaskIds): boolean` — usadas pela Task 10 (`api/tasks/dependencies.ts`) e pela Task 17 (página Kanban).

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import {
  hasOpenDependencies,
  wouldCreateCycle,
  type DependencyEdge,
} from "@/domain/tasks/dependencies";

describe("wouldCreateCycle", () => {
  it("rejeita autodependência", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("permite dependência direta sem ciclo", () => {
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });

  it("detecta ciclo transitivo (a->b->c, tentando c->a)", () => {
    const edges: DependencyEdge[] = [
      { taskId: "a", dependsOnTaskId: "b" },
      { taskId: "b", dependsOnTaskId: "c" },
    ];
    expect(wouldCreateCycle(edges, "c", "a")).toBe(true);
  });

  it("não acusa ciclo em grafos independentes", () => {
    const edges: DependencyEdge[] = [{ taskId: "a", dependsOnTaskId: "b" }];
    expect(wouldCreateCycle(edges, "c", "d")).toBe(false);
  });
});

describe("hasOpenDependencies", () => {
  it("retorna false sem dependências", () => {
    expect(hasOpenDependencies("a", [], new Set())).toBe(false);
  });

  it("retorna true quando dependência não está done", () => {
    const edges: DependencyEdge[] = [{ taskId: "a", dependsOnTaskId: "b" }];
    expect(hasOpenDependencies("a", edges, new Set())).toBe(true);
  });

  it("retorna false quando toda dependência está done", () => {
    const edges: DependencyEdge[] = [{ taskId: "a", dependsOnTaskId: "b" }];
    expect(hasOpenDependencies("a", edges, new Set(["b"]))).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/domain/tasks/__tests__/dependencies.test.ts`
Expected: FAIL — `Cannot find module '@/domain/tasks/dependencies'`.

- [ ] **Step 3: Implementar `dependencies.ts`**

```ts
export interface DependencyEdge {
  taskId: string;
  dependsOnTaskId: string;
}

/** DFS: adicionar taskId->dependsOnTaskId cria ciclo se dependsOnTaskId já leva de volta a taskId. */
export function wouldCreateCycle(
  edges: DependencyEdge[],
  taskId: string,
  dependsOnTaskId: string
): boolean {
  if (taskId === dependsOnTaskId) return true;

  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    const list = graph.get(edge.taskId) ?? [];
    list.push(edge.dependsOnTaskId);
    graph.set(edge.taskId, list);
  }

  const visited = new Set<string>();
  const stack = [dependsOnTaskId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of graph.get(current) ?? []) stack.push(next);
  }

  return false;
}

/** Soft-block: verdadeiro se alguma dependência direta ainda não está concluída. */
export function hasOpenDependencies(
  taskId: string,
  edges: DependencyEdge[],
  doneTaskIds: Set<string>
): boolean {
  return edges
    .filter((edge) => edge.taskId === taskId)
    .some((edge) => !doneTaskIds.has(edge.dependsOnTaskId));
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/domain/tasks/__tests__/dependencies.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/domain/tasks/dependencies.ts src/domain/tasks/__tests__/dependencies.test.ts
git commit -m "feat: adiciona deteccao de ciclo e soft-block de dependencias entre tarefas"
```

---

## Task 5: Domain — `timeTracking.ts` (timer "Live")

**Files:**
- Create: `src/domain/tasks/timeTracking.ts`
- Test: `src/domain/tasks/__tests__/timeTracking.test.ts`

**Interfaces:**
- Consumes: nenhuma (tipo local `TimeEntry`).
- Produces: `elapsedSeconds(entry, now?)`, `totalSecondsForTask(taskId, entries, now?)`, `formatDuration(totalSeconds)` — usadas pela Task 18 (página Live).

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import {
  elapsedSeconds,
  formatDuration,
  totalSecondsForTask,
  type TimeEntry,
} from "@/domain/tasks/timeTracking";

describe("elapsedSeconds", () => {
  it("calcula duração de entrada finalizada", () => {
    const entry: TimeEntry = {
      taskId: "a",
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: "2026-08-01T10:05:00.000Z",
    };
    expect(elapsedSeconds(entry)).toBe(300);
  });

  it("usa `now` para entrada em andamento", () => {
    const entry: TimeEntry = {
      taskId: "a",
      startedAt: "2026-08-01T10:00:00.000Z",
      endedAt: null,
    };
    const now = new Date("2026-08-01T10:02:00.000Z");
    expect(elapsedSeconds(entry, now)).toBe(120);
  });
});

describe("totalSecondsForTask", () => {
  it("soma só as entradas da tarefa pedida", () => {
    const entries: TimeEntry[] = [
      {
        taskId: "a",
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:05:00.000Z",
      },
      {
        taskId: "b",
        startedAt: "2026-08-01T10:00:00.000Z",
        endedAt: "2026-08-01T10:10:00.000Z",
      },
      {
        taskId: "a",
        startedAt: "2026-08-01T11:00:00.000Z",
        endedAt: "2026-08-01T11:01:00.000Z",
      },
    ];
    expect(totalSecondsForTask("a", entries)).toBe(360);
  });
});

describe("formatDuration", () => {
  it("formata minutos quando < 1h", () => {
    expect(formatDuration(300)).toBe("5min");
  });

  it("formata horas e minutos", () => {
    expect(formatDuration(3660)).toBe("1h01");
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/domain/tasks/__tests__/timeTracking.test.ts`
Expected: FAIL — `Cannot find module '@/domain/tasks/timeTracking'`.

- [ ] **Step 3: Implementar `timeTracking.ts`**

```ts
export interface TimeEntry {
  taskId: string;
  startedAt: string;
  endedAt: string | null;
}

export function elapsedSeconds(entry: TimeEntry, now: Date = new Date()): number {
  const start = new Date(entry.startedAt).getTime();
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now.getTime();
  return Math.max(0, Math.round((end - start) / 1000));
}

export function totalSecondsForTask(
  taskId: string,
  entries: TimeEntry[],
  now: Date = new Date()
): number {
  return entries
    .filter((entry) => entry.taskId === taskId)
    .reduce((sum, entry) => sum + elapsedSeconds(entry, now), 0);
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}min`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/domain/tasks/__tests__/timeTracking.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/domain/tasks/timeTracking.ts src/domain/tasks/__tests__/timeTracking.test.ts
git commit -m "feat: adiciona calculo de tempo acumulado por tarefa (secao Live)"
```

---

## Task 6: Domain — `filters.ts` (Lista: filtro/ordenação)

**Files:**
- Create: `src/domain/tasks/filters.ts`
- Test: `src/domain/tasks/__tests__/filters.test.ts`

**Interfaces:**
- Consumes: nenhuma (genérico via constraint estrutural).
- Produces: `filterTasks(tasks, filter)`, `sortTasksByDueDate(tasks)` — usadas pela Task 16 (página Lista).

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { filterTasks, sortTasksByDueDate } from "@/domain/tasks/filters";

type Row = { id: string; project_id: string | null; tags: string[]; due_date: string | null };

const rows: Row[] = [
  { id: "1", project_id: "p1", tags: ["casa"], due_date: "2026-08-10" },
  { id: "2", project_id: "p2", tags: ["trabalho"], due_date: "2026-08-05" },
  { id: "3", project_id: null, tags: ["casa", "urgente"], due_date: null },
];

describe("filterTasks", () => {
  it("filtra por projeto", () => {
    expect(filterTasks(rows, { projectId: "p1" }).map((r) => r.id)).toEqual(["1"]);
  });

  it("filtra por tag", () => {
    expect(filterTasks(rows, { tag: "casa" }).map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("filtra por prazo até uma data", () => {
    expect(filterTasks(rows, { dueBefore: "2026-08-09" }).map((r) => r.id)).toEqual(["2"]);
  });

  it("sem filtro retorna tudo", () => {
    expect(filterTasks(rows, {})).toHaveLength(3);
  });
});

describe("sortTasksByDueDate", () => {
  it("ordena por prazo, sem prazo por último", () => {
    expect(sortTasksByDueDate(rows).map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/domain/tasks/__tests__/filters.test.ts`
Expected: FAIL — `Cannot find module '@/domain/tasks/filters'`.

- [ ] **Step 3: Implementar `filters.ts`**

```ts
export interface TaskFilter {
  projectId?: string | null;
  tag?: string;
  dueBefore?: string;
}

interface FilterableTask {
  project_id: string | null;
  tags: string[];
  due_date: string | null;
}

export function filterTasks<T extends FilterableTask>(
  tasks: T[],
  filter: TaskFilter
): T[] {
  return tasks.filter((task) => {
    if (filter.projectId !== undefined && task.project_id !== filter.projectId) {
      return false;
    }
    if (filter.tag && !task.tags.includes(filter.tag)) return false;
    if (filter.dueBefore && (!task.due_date || task.due_date > filter.dueBefore)) {
      return false;
    }
    return true;
  });
}

export function sortTasksByDueDate<T extends { due_date: string | null }>(
  tasks: T[]
): T[] {
  return [...tasks].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/domain/tasks/__tests__/filters.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/domain/tasks/filters.ts src/domain/tasks/__tests__/filters.test.ts
git commit -m "feat: adiciona filtro e ordenacao de tarefas por tag/prazo/projeto"
```

---

## Task 7: Domain — barrel `index.ts`

**Files:**
- Create: `src/domain/tasks/index.ts`

**Interfaces:**
- Consumes: tudo de `recurrence.ts`, `dependencies.ts`, `timeTracking.ts`, `filters.ts`.
- Produces: reexport único `@/domain/tasks`, mesmo padrão de `src/domain/recurring/index.ts` e `src/domain/habits`.

- [ ] **Step 1: Escrever o barrel**

```ts
export * from "./recurrence";
export * from "./dependencies";
export * from "./timeTracking";
export * from "./filters";
```

- [ ] **Step 2: Rodar toda a suíte do domínio**

Run: `npx vitest run src/domain/tasks`
Expected: PASS (23 testes: 6 + 7 + 5 + 5).

- [ ] **Step 3: Commit**

```bash
git add src/domain/tasks/index.ts
git commit -m "feat: cria barrel export do dominio tasks"
```

---

## Task 8: API — `src/api/tasks/projects.ts`

**Files:**
- Create: `src/api/tasks/projects.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`), `getCurrentUserId` (`@/lib/auth-user`), `Project`, `ProjectCreateRequest`, `ProjectUpdateRequest` (`@/types/tasks`).
- Produces: `fetchProjects()`, `fetchProjectById(id)`, `createProject(project)`, `updateProject(data)`, `deleteProject(id)` — usadas pelas Tasks 15, 17.

- [ ] **Step 1: Implementar `projects.ts`**

```ts
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type {
  Project,
  ProjectCreateRequest,
  ProjectUpdateRequest,
} from "@/types/tasks";

export async function fetchProjects(): Promise<Project[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchProjectById(id: string): Promise<Project | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createProject(
  project: ProjectCreateRequest
): Promise<Project> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("project")
    .insert([{ ...project, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateProject(data: ProjectUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const { error } = await supabase
    .from("project")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteProject(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("project")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/api/tasks/projects.ts
git commit -m "feat: adiciona CRUD de projetos (api/tasks)"
```

---

## Task 9: API — `src/api/tasks/tasks.ts` (com materialização de recorrência)

**Files:**
- Create: `src/api/tasks/tasks.ts`

**Interfaces:**
- Consumes: `supabase`, `getCurrentUserId`, `computeMissingOccurrences` (`@/domain/tasks`), `formatLocalIsoDate` (`@/lib/dates`), `Task`, `TaskCreateRequest`, `TaskUpdateRequest` (`@/types/tasks`).
- Produces: `fetchTasks()`, `createTask(task)`, `updateTask(data)`, `deleteTask(id)` — usadas pelas Tasks 16, 17, 18.

- [ ] **Step 1: Implementar `tasks.ts`**

```ts
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { computeMissingOccurrences } from "@/domain/tasks";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Task, TaskCreateRequest, TaskUpdateRequest } from "@/types/tasks";

async function materializeRecurringInstances(
  userId: string,
  tasks: Task[]
): Promise<Task[]> {
  const origins = tasks.filter(
    (task) => task.recurrence_rule && !task.recurrence_origin_id && task.due_date
  );
  if (origins.length === 0) return tasks;

  const today = formatLocalIsoDate(new Date());
  const newRows: Array<Record<string, unknown>> = [];

  for (const origin of origins) {
    const existingDates = tasks
      .filter((task) => task.recurrence_origin_id === origin.id && task.due_date)
      .map((task) => task.due_date as string);

    const missing = computeMissingOccurrences(
      origin.due_date as string,
      origin.recurrence_rule!,
      existingDates,
      today
    );

    for (const date of missing) {
      newRows.push({
        user_id: userId,
        project_id: origin.project_id,
        parent_task_id: null,
        title: origin.title,
        description: origin.description ?? null,
        status: "todo",
        tags: origin.tags,
        due_date: date,
        recurrence_rule: null,
        recurrence_origin_id: origin.id,
      });
    }
  }

  if (newRows.length === 0) return tasks;

  const { data, error } = await supabase.from("task").insert(newRows).select();
  if (error) throw new Error(error.message);
  return [...tasks, ...(data ?? [])];
}

export async function fetchTasks(): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return materializeRecurringInstances(userId, data ?? []);
}

export async function createTask(task: TaskCreateRequest): Promise<Task> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .insert([{ ...task, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateTask(data: TaskUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...fields } = data;
  const payload: Record<string, unknown> = {
    ...fields,
    updated_at: new Date().toISOString(),
  };
  if (fields.status === "done") payload.completed_at = new Date().toISOString();
  const { error } = await supabase
    .from("task")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteTask(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/api/tasks/tasks.ts
git commit -m "feat: adiciona CRUD de tarefas com materializacao lazy de recorrencia"
```

---

## Task 10: API — `src/api/tasks/dependencies.ts`

**Files:**
- Create: `src/api/tasks/dependencies.ts`

**Interfaces:**
- Consumes: `supabase`, `getCurrentUserId`, `TaskDependency` (`@/types/tasks`).
- Produces: `fetchDependencies()`, `createDependency(taskId, dependsOnTaskId)`, `deleteDependency(taskId, dependsOnTaskId)` — usadas pela Task 17.

- [ ] **Step 1: Implementar `dependencies.ts`**

```ts
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import type { TaskDependency } from "@/types/tasks";

export async function fetchDependencies(): Promise<TaskDependency[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_dependency")
    .select("task_id, depends_on_task_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createDependency(
  taskId: string,
  dependsOnTaskId: string
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase.from("task_dependency").insert([
    { user_id: userId, task_id: taskId, depends_on_task_id: dependsOnTaskId },
  ]);
  if (error) throw new Error(error.message);
}

export async function deleteDependency(
  taskId: string,
  dependsOnTaskId: string
): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task_dependency")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", taskId)
    .eq("depends_on_task_id", dependsOnTaskId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/api/tasks/dependencies.ts
git commit -m "feat: adiciona CRUD de dependencias entre tarefas"
```

---

## Task 11: API — `src/api/tasks/timeEntries.ts`

**Files:**
- Create: `src/api/tasks/timeEntries.ts`

**Interfaces:**
- Consumes: `supabase`, `getCurrentUserId`, `startOfLocalDay` (`@/lib/dates`), `TaskTimeEntry` (`@/types/tasks`).
- Produces: `fetchRunningEntry()`, `fetchTodayEntries()`, `startTimer(taskId)`, `stopTimer(entryId)` — usadas pela Task 18.

- [ ] **Step 1: Implementar `timeEntries.ts`**

```ts
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { startOfLocalDay } from "@/lib/dates";
import type { TaskTimeEntry } from "@/types/tasks";

export async function fetchRunningEntry(): Promise<TaskTimeEntry | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .select("*")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchTodayEntries(): Promise<TaskTimeEntry[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task_time_entry")
    .select("*")
    .eq("user_id", userId)
    .gte("started_at", startOfLocalDay().toISOString())
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Para o timer atual (se houver) antes de iniciar um novo — só um "Live" por vez. */
export async function startTimer(taskId: string): Promise<TaskTimeEntry> {
  const userId = await getCurrentUserId();
  const running = await fetchRunningEntry();
  if (running) await stopTimer(running.id);

  const { data, error } = await supabase
    .from("task_time_entry")
    .insert([
      { user_id: userId, task_id: taskId, started_at: new Date().toISOString() },
    ])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function stopTimer(entryId: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("task_time_entry")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/api/tasks/timeEntries.ts
git commit -m "feat: adiciona start/stop de timer para secao Live"
```

---

## Task 12: API — barrel `src/api/tasks/index.ts`

**Files:**
- Create: `src/api/tasks/index.ts`

**Interfaces:**
- Consumes: tudo de `projects.ts`, `tasks.ts`, `dependencies.ts`, `timeEntries.ts`.
- Produces: reexport único `@/api/tasks`, usado pelas páginas (Tasks 15–18).

- [ ] **Step 1: Escrever o barrel**

```ts
export * from "./projects";
export * from "./tasks";
export * from "./dependencies";
export * from "./timeEntries";
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/api/tasks/index.ts
git commit -m "feat: cria barrel export da api tasks"
```

---

## Task 13: Design tokens — cor do módulo "Produtividade"

**Files:**
- Modify: `src/index.css`
- Modify: `src/lib/design-tokens.ts`

**Interfaces:**
- Produces: `moduleColors.productivity` — usado pela Task 14 (sidebar).

- [ ] **Step 1: Adicionar variável de cor em `src/index.css` (tema claro)**

Localizar o bloco `:root` (perto de `--hub`, por volta da linha 56) e adicionar logo abaixo:

```css
    /* Produtividade (Tarefas/Projetos) = violeta, distinto de hub (indigo) e cinema (fuchsia) */
    --productivity: 266 78% 55%;
    --productivity-foreground: 0 0% 100%;
```

- [ ] **Step 2: Adicionar a mesma variável no bloco dark (perto da linha 121)**

```css
    --productivity: 266 78% 68%;
    --productivity-foreground: 0 0% 100%;
```

- [ ] **Step 3: Registrar em `moduleColors` (`src/lib/design-tokens.ts`)**

```ts
export const moduleColors = {
  hub: "hsl(var(--hub))",
  finance: "hsl(var(--primary))",
  entertainment: "hsl(var(--cinema))",
  life: "hsl(var(--life))",
  cinema: "hsl(var(--cinema))",
  travel: "hsl(var(--travel))",
  car: "hsl(var(--car))",
  productivity: "hsl(var(--productivity))",
} as const;
```

- [ ] **Step 4: Rodar o build para validar CSS/Tailwind**

Run: `npm run lint`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/lib/design-tokens.ts
git commit -m "feat: adiciona cor do modulo Produtividade (tarefas/projetos)"
```

---

## Task 14: Navegação — grupo "Produtividade" na sidebar

**Files:**
- Modify: `src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `moduleColors.productivity` (Task 13).
- Produces: grupo de nav "Produtividade" com Tarefas/Projetos/Live, roteado pela Task 20.

- [ ] **Step 1: Importar ícone e adicionar o grupo**

Em `src/components/app-sidebar.tsx`, trocar o import de ícones:

```ts
import {
  Clapperboard,
  LayoutDashboard,
  ListTodo,
  PiggyBank,
  Target,
  type LucideIcon,
} from "lucide-react"
```

Adicionar, logo após `NAV_VIDA` (linha ~81):

```ts
const NAV_PRODUTIVIDADE: NavItem = {
  title: "Produtividade",
  color: moduleColors.productivity,
  url: "#",
  icon: ListTodo,
  items: [
    { title: "Tarefas", url: "/tasks" },
    { title: "Projetos", url: "/tasks/projects" },
    { title: "Live", url: "/tasks/live" },
  ],
}
```

E incluir no `navItems`:

```ts
  const navItems = React.useMemo(
    () => [NAV_INICIO, NAV_FINANCE, NAV_ENTRETENIMENTO, NAV_VIDA, NAV_PRODUTIVIDADE],
    []
  )
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat: adiciona grupo Produtividade na sidebar (tarefas/projetos/live)"
```

---

## Task 15: Página — Projetos (`/tasks/projects`)

**Files:**
- Create: `src/pages/admin/tasks/Projects.tsx`

**Interfaces:**
- Consumes: `fetchProjects`, `createProject`, `updateProject`, `deleteProject` (`@/api/tasks`), `Project`, `ProjectCreateRequest` (`@/types/tasks`), `PageShell`, `EmptyState`, `ConfirmDeleteDialog`, `FormLabel`/`FORM_DIALOG_CONTENT_CLASS`/`FORM_FIELDS_CLASS`/`ICON_EDIT_BUTTON_CLASS`, `useToast`, `getErrorMessage`.
- Produces: rota `/tasks/projects`, links `Ver projeto` para `/tasks/projects/:id` (Task 17).

- [ ] **Step 1: Implementar `Projects.tsx`**

```tsx
import { Link } from "react-router-dom";
import { FolderKanban, Pen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  ICON_EDIT_BUTTON_CLASS,
} from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
} from "@/api/tasks";
import type { Project, ProjectCreateRequest, ProjectStatus } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useState } from "react";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

const emptyProject = (): ProjectCreateRequest => ({
  name: "",
  description: "",
  color: null,
  goal_id: null,
  status: "active",
});

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState(emptyProject());
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setProjects(await fetchProjects());
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar os projetos."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyProject());
    setOpen(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    setForm({
      name: project.name,
      description: project.description ?? "",
      color: project.color ?? null,
      goal_id: project.goal_id ?? null,
      status: project.status,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    try {
      if (editing) await updateProject({ id: editing.id, ...form });
      else await createProject(form);
      toast({ title: "Projeto salvo!", duration: 2000 });
      setOpen(false);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar o projeto."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      toast({ title: "Projeto excluído", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir o projeto."),
        variant: "destructive",
      });
    }
  }

  return (
    <PageShell
      title="Projetos"
      description="Agrupe tarefas por projeto e acompanhe o andamento em Kanban."
      actions={<Button onClick={openCreate}>Novo projeto</Button>}
    >
      {loading ? (
        <TableLoadingSkeleton rows={4} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Nenhum projeto ainda"
          description="Crie seu primeiro projeto para agrupar tarefas."
          action={<Button onClick={openCreate}>Novo projeto</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="rounded-xl border bg-card p-3.5 shadow-sm sm:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge variant="outline" className="mb-2 text-[10px]">
                    {STATUS_LABELS[project.status]}
                  </Badge>
                  <h3 className="font-semibold">{project.name}</h3>
                  {project.description && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                    onClick={() => openEdit(project)}
                  >
                    <Pen className="h-3.5 w-3.5" />
                  </Button>
                  <ConfirmDeleteDialog
                    title="Excluir este projeto?"
                    description="As tarefas do projeto continuam existindo, mas ficam sem projeto."
                    onConfirm={() => handleDelete(project.id)}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </ConfirmDeleteDialog>
                </div>
              </div>
              <Button variant="link" className="mt-3 h-auto p-0 text-xs" asChild>
                <Link to={`/tasks/projects/${project.id}`}>Ver Kanban do projeto</Link>
              </Button>
            </article>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Nome</FormLabel>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <FormLabel optional>Descrição</FormLabel>
              <Input
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <FormLabel required>Status</FormLabel>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} className="w-full">
              {editing ? "Salvar alterações" : "Criar projeto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/tasks/Projects.tsx
git commit -m "feat: adiciona pagina de listagem/CRUD de projetos"
```

---

## Task 16: Página — Lista de tarefas (`/tasks`)

**Files:**
- Create: `src/pages/admin/tasks/TaskList.tsx`

**Interfaces:**
- Consumes: `fetchTasks`, `createTask`, `updateTask`, `deleteTask`, `fetchProjects` (`@/api/tasks`), `filterTasks`, `sortTasksByDueDate` (`@/domain/tasks`), `Task`, `TaskCreateRequest`, `Project`, `RecurrenceFrequency` (`@/types/tasks`).
- Produces: rota `/tasks`.

- [ ] **Step 1: Implementar `TaskList.tsx`**

```tsx
import { ListTodo, Pen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/DatePicker";
import { formatLocalIsoDate } from "@/lib/dates";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  ICON_EDIT_BUTTON_CLASS,
} from "@/components/FormLabel";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createTask,
  deleteTask,
  fetchProjects,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { filterTasks, sortTasksByDueDate } from "@/domain/tasks";
import type {
  Project,
  RecurrenceFrequency,
  Task,
  TaskCreateRequest,
} from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

const emptyTask = (): TaskCreateRequest => ({
  project_id: null,
  parent_task_id: null,
  title: "",
  description: "",
  status: "todo",
  tags: [],
  due_date: null,
  recurrence_rule: null,
});

export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask());
  const [tagFilter, setTagFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [tagsInput, setTagsInput] = useState("");
  const [repeats, setRepeats] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("daily");
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [taskList, projectList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
      ]);
      setTasks(taskList);
      setProjects(projectList);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar as tarefas."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleTasks = useMemo(() => {
    const projectId =
      projectFilter === "all" ? undefined : projectFilter === "null" ? null : projectFilter;
    const filtered = filterTasks(tasks, {
      tag: tagFilter || undefined,
      projectId,
    });
    return sortTasksByDueDate(filtered.filter((t) => !t.parent_task_id));
  }, [tasks, tagFilter, projectFilter]);

  const allTags = useMemo(
    () => Array.from(new Set(tasks.flatMap((t) => t.tags))).sort(),
    [tasks]
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyTask());
    setTagsInput("");
    setRepeats(false);
    setFrequency("daily");
    setOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setForm({
      project_id: task.project_id,
      parent_task_id: task.parent_task_id,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      tags: task.tags,
      due_date: task.due_date,
      recurrence_rule: task.recurrence_rule,
    });
    setTagsInput(task.tags.join(", "));
    setRepeats(!!task.recurrence_rule);
    setFrequency(task.recurrence_rule?.frequency ?? "daily");
    setOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: TaskCreateRequest = {
      ...form,
      tags,
      recurrence_rule: repeats && form.due_date ? { frequency, interval: 1 } : null,
    };
    try {
      if (editing) await updateTask({ id: editing.id, ...payload });
      else await createTask(payload);
      toast({ title: "Tarefa salva!", duration: 2000 });
      setOpen(false);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a tarefa."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTask(id);
      toast({ title: "Tarefa excluída", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir a tarefa."),
        variant: "destructive",
      });
    }
  }

  return (
    <PageShell
      title="Tarefas"
      description="Todas as suas tarefas, com ou sem projeto."
      actions={<Button onClick={openCreate}>Nova tarefa</Button>}
    >
      <div className="flex flex-wrap gap-2">
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Projeto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os projetos</SelectItem>
            <SelectItem value="null">Sem projeto</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={tagFilter || "all"}
          onValueChange={(v) => setTagFilter(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tag" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tags</SelectItem>
            {allTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <TableLoadingSkeleton rows={6} />
      ) : visibleTasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Nenhuma tarefa"
          description="Crie sua primeira tarefa."
          action={<Button onClick={openCreate}>Nova tarefa</Button>}
        />
      ) : (
        <div className="space-y-2">
          {visibleTasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{task.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {task.status === "todo"
                      ? "A fazer"
                      : task.status === "doing"
                        ? "Fazendo"
                        : "Feito"}
                  </Badge>
                  {task.due_date && <span>Prazo: {task.due_date}</span>}
                  {task.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8", ICON_EDIT_BUTTON_CLASS)}
                  onClick={() => openEdit(task)}
                >
                  <Pen className="h-3.5 w-3.5" />
                </Button>
                <ConfirmDeleteDialog
                  title="Excluir esta tarefa?"
                  onConfirm={() => handleDelete(task.id)}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </ConfirmDeleteDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          </DialogHeader>
          <div className={FORM_FIELDS_CLASS}>
            <div>
              <FormLabel required>Título</FormLabel>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <FormLabel optional>Descrição</FormLabel>
              <Input
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <FormLabel optional>Projeto</FormLabel>
              <Select
                value={form.project_id ?? "none"}
                onValueChange={(v) =>
                  setForm({ ...form, project_id: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FormLabel optional>Tags (separadas por vírgula)</FormLabel>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="casa, urgente"
              />
            </div>
            <div>
              <FormLabel optional>Prazo</FormLabel>
              <DatePicker
                clearable
                date={form.due_date ? new Date(`${form.due_date}T12:00:00`) : undefined}
                onSelect={(d) =>
                  setForm({ ...form, due_date: d ? formatLocalIsoDate(d) : null })
                }
              />
            </div>
            {form.due_date && (
              <div className="flex items-center gap-2">
                <input
                  id="repeats"
                  type="checkbox"
                  checked={repeats}
                  onChange={(e) => setRepeats(e.target.checked)}
                />
                <FormLabel htmlFor="repeats">Repetir</FormLabel>
                {repeats && (
                  <Select
                    value={frequency}
                    onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diária</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <Button onClick={handleSave} className="w-full">
              {editing ? "Salvar alterações" : "Criar tarefa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/tasks/TaskList.tsx
git commit -m "feat: adiciona pagina Lista de tarefas com filtro e recorrencia"
```

---

## Task 17: Página — Kanban do projeto (`/tasks/projects/:id`)

**Files:**
- Create: `src/pages/admin/tasks/ProjectDetail.tsx`

**Interfaces:**
- Consumes: `fetchProjectById` (`@/api/tasks`), `fetchTasks`, `createTask`, `updateTask`, `deleteTask`, `fetchDependencies`, `createDependency`, `deleteDependency` (`@/api/tasks`), `hasOpenDependencies`, `wouldCreateCycle` (`@/domain/tasks`), `Task`, `TaskStatus`, `TaskDependency` (`@/types/tasks`).
- Produces: rota `/tasks/projects/:id`.

- [ ] **Step 1: Implementar `ProjectDetail.tsx`**

```tsx
import { useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import {
  createDependency,
  createTask,
  deleteDependency,
  deleteTask,
  fetchDependencies,
  fetchProjectById,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { hasOpenDependencies, wouldCreateCycle } from "@/domain/tasks";
import type { Project, Task, TaskDependency, TaskStatus } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useCallback, useEffect, useMemo, useState } from "react";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "A fazer" },
  { status: "doing", label: "Fazendo" },
  { status: "done", label: "Feito" },
];

function nextStatus(status: TaskStatus): TaskStatus | null {
  if (status === "todo") return "doing";
  if (status === "doing") return "done";
  return null;
}

function prevStatus(status: TaskStatus): TaskStatus | null {
  if (status === "done") return "doing";
  if (status === "doing") return "todo";
  return null;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [depTarget, setDepTarget] = useState<Task | null>(null);
  const [depSelection, setDepSelection] = useState<string>("");
  const [subtaskParent, setSubtaskParent] = useState<Task | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [proj, taskList, deps] = await Promise.all([
        fetchProjectById(id),
        fetchTasks(),
        fetchDependencies(),
      ]);
      setProject(proj);
      setTasks(taskList.filter((t) => t.project_id === id));
      setDependencies(deps);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar o projeto."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const topLevelTasks = useMemo(
    () => tasks.filter((t) => !t.parent_task_id),
    [tasks]
  );

  const doneIds = useMemo(
    () => new Set(tasks.filter((t) => t.status === "done").map((t) => t.id)),
    [tasks]
  );

  const edges = useMemo(
    () =>
      dependencies.map((d) => ({
        taskId: d.task_id,
        dependsOnTaskId: d.depends_on_task_id,
      })),
    [dependencies]
  );

  function subtasksOf(taskId: string): Task[] {
    return tasks.filter((t) => t.parent_task_id === taskId);
  }

  async function handleCreateTask() {
    if (!newTitle.trim() || !id) return;
    try {
      await createTask({
        project_id: id,
        parent_task_id: null,
        title: newTitle,
        description: "",
        status: "todo",
        tags: [],
        due_date: null,
        recurrence_rule: null,
      });
      setNewTitle("");
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a tarefa."),
        variant: "destructive",
      });
    }
  }

  async function handleMove(task: Task, status: TaskStatus | null) {
    if (!status) return;
    try {
      await updateTask({ id: task.id, status });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível mover a tarefa."),
        variant: "destructive",
      });
    }
  }

  async function handleDelete(taskId: string) {
    try {
      await deleteTask(taskId);
      toast({ title: "Tarefa excluída", duration: 2000 });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível excluir a tarefa."),
        variant: "destructive",
      });
    }
  }

  async function handleAddSubtask() {
    if (!subtaskParent || !subtaskTitle.trim() || !id) return;
    try {
      await createTask({
        project_id: id,
        parent_task_id: subtaskParent.id,
        title: subtaskTitle,
        description: "",
        status: "todo",
        tags: [],
        due_date: null,
        recurrence_rule: null,
      });
      setSubtaskTitle("");
      setSubtaskParent(null);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a subtarefa."),
        variant: "destructive",
      });
    }
  }

  async function handleToggleSubtask(subtask: Task) {
    try {
      await updateTask({
        id: subtask.id,
        status: subtask.status === "done" ? "todo" : "done",
      });
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível atualizar a subtarefa."),
        variant: "destructive",
      });
    }
  }

  async function handleAddDependency() {
    if (!depTarget || !depSelection) return;
    if (wouldCreateCycle(edges, depTarget.id, depSelection)) {
      toast({
        title: "Dependência inválida",
        description: "Isso criaria um ciclo entre tarefas.",
        variant: "destructive",
      });
      return;
    }
    try {
      await createDependency(depTarget.id, depSelection);
      setDepSelection("");
      setDepTarget(null);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível criar a dependência."),
        variant: "destructive",
      });
    }
  }

  async function handleRemoveDependency(taskId: string, dependsOnTaskId: string) {
    try {
      await deleteDependency(taskId, dependsOnTaskId);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível remover a dependência."),
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <PageShell title="Projeto">
        <TableLoadingSkeleton rows={6} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={project?.name ?? "Projeto"}
      description={project?.description ?? undefined}
    >
      <div className="flex gap-2">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Nova tarefa..."
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreateTask();
          }}
        />
        <Button onClick={handleCreateTask}>
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((column) => (
          <div key={column.status} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {column.label} (
              {topLevelTasks.filter((t) => t.status === column.status).length})
            </h3>
            {topLevelTasks
              .filter((t) => t.status === column.status)
              .map((task) => {
                const blocked = hasOpenDependencies(task.id, edges, doneIds);
                const subtasks = subtasksOf(task.id);
                const taskDeps = dependencies.filter((d) => d.task_id === task.id);

                return (
                  <div
                    key={task.id}
                    className="rounded-lg border bg-card p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{task.title}</p>
                      <ConfirmDeleteDialog
                        title="Excluir esta tarefa?"
                        onConfirm={() => handleDelete(task.id)}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </ConfirmDeleteDialog>
                    </div>

                    {blocked && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        Depende de tarefa(s) não concluída(s)
                      </p>
                    )}

                    {subtasks.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {subtasks.map((subtask) => (
                          <li
                            key={subtask.id}
                            className="flex items-center gap-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={subtask.status === "done"}
                              onChange={() => handleToggleSubtask(subtask)}
                            />
                            <span
                              className={
                                subtask.status === "done"
                                  ? "text-muted-foreground line-through"
                                  : ""
                              }
                            >
                              {subtask.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {taskDeps.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {taskDeps.map((dep) => {
                          const depTask = tasks.find(
                            (t) => t.id === dep.depends_on_task_id
                          );
                          return (
                            <Badge
                              key={dep.depends_on_task_id}
                              variant="outline"
                              className="cursor-pointer text-[10px]"
                              onClick={() =>
                                handleRemoveDependency(
                                  dep.task_id,
                                  dep.depends_on_task_id
                                )
                              }
                            >
                              depende: {depTask?.title ?? "?"} ×
                            </Badge>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {prevStatus(task.status) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleMove(task, prevStatus(task.status))}
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {nextStatus(task.status) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleMove(task, nextStatus(task.status))}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => setSubtaskParent(task)}
                      >
                        + subtarefa
                      </Button>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => setDepTarget(task)}
                      >
                        + dependência
                      </Button>
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
      </div>

      <Dialog
        open={!!subtaskParent}
        onOpenChange={(next) => {
          if (!next) setSubtaskParent(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova subtarefa em "{subtaskParent?.title}"</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={subtaskTitle}
              onChange={(e) => setSubtaskTitle(e.target.value)}
              placeholder="Título da subtarefa"
            />
            <Button onClick={handleAddSubtask}>Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!depTarget}
        onOpenChange={(next) => {
          if (!next) setDepTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              "{depTarget?.title}" depende de qual tarefa?
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Select value={depSelection} onValueChange={setDepSelection}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a tarefa" />
              </SelectTrigger>
              <SelectContent>
                {topLevelTasks
                  .filter((t) => t.id !== depTarget?.id)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddDependency}>Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/tasks/ProjectDetail.tsx
git commit -m "feat: adiciona kanban do projeto com subtarefas e dependencias (soft-block)"
```

---

## Task 18: Página — Live (`/tasks/live`)

**Files:**
- Create: `src/pages/admin/tasks/Live.tsx`

**Interfaces:**
- Consumes: `fetchTasks` (`@/api/tasks`), `fetchRunningEntry`, `fetchTodayEntries`, `startTimer`, `stopTimer` (`@/api/tasks`), `totalSecondsForTask`, `formatDuration` (`@/domain/tasks`), `Task`, `TaskTimeEntry` (`@/types/tasks`).
- Produces: rota `/tasks/live`.

- [ ] **Step 1: Implementar `Live.tsx`**

```tsx
import { Clock, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { PageShell } from "@/components/PageShell";
import { TableLoadingSkeleton } from "@/components/TableLoadingSkeleton";
import { fetchTasks, fetchRunningEntry, fetchTodayEntries, startTimer, stopTimer } from "@/api/tasks";
import { formatDuration, totalSecondsForTask } from "@/domain/tasks";
import type { Task, TaskTimeEntry } from "@/types/tasks";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { useCallback, useEffect, useMemo, useState } from "react";

export default function Live() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [running, setRunning] = useState<TaskTimeEntry | null>(null);
  const [todayEntries, setTodayEntries] = useState<TaskTimeEntry[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [taskList, runningEntry, entries] = await Promise.all([
        fetchTasks(),
        fetchRunningEntry(),
        fetchTodayEntries(),
      ]);
      setTasks(taskList.filter((t) => t.status !== "done"));
      setRunning(runningEntry);
      setTodayEntries(entries);
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível carregar a seção Live."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const runningTask = useMemo(
    () => tasks.find((t) => t.id === running?.task_id) ?? null,
    [tasks, running]
  );

  const runningElapsed = useMemo(() => {
    if (!running) return 0;
    return Math.max(
      0,
      Math.round((now.getTime() - new Date(running.started_at).getTime()) / 1000)
    );
  }, [running, now]);

  const totalsByTask = useMemo(() => {
    const entries = todayEntries.map((e) => ({
      taskId: e.task_id,
      startedAt: e.started_at,
      endedAt: e.ended_at,
    }));
    const ids = Array.from(new Set(entries.map((e) => e.taskId)));
    return ids.map((taskId) => ({
      taskId,
      task: tasks.find((t) => t.id === taskId),
      seconds: totalSecondsForTask(taskId, entries, now),
    }));
  }, [todayEntries, tasks, now]);

  async function handleStart() {
    if (!selectedTaskId) return;
    try {
      await startTimer(selectedTaskId);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível iniciar o timer."),
        variant: "destructive",
      });
    }
  }

  async function handleStop() {
    if (!running) return;
    try {
      await stopTimer(running.id);
      load();
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível parar o timer."),
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <PageShell title="Live">
        <TableLoadingSkeleton rows={4} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Live"
      description="Acompanhe o tempo dedicado a cada tarefa em andamento hoje."
    >
      {running && runningTask ? (
        <div className="flex items-center justify-between rounded-xl border bg-card p-4">
          <div>
            <p className="text-xs text-muted-foreground">Rodando agora</p>
            <p className="text-lg font-semibold">{runningTask.title}</p>
            <p className="font-mono text-2xl tabular-nums">
              {formatDuration(runningElapsed)}
            </p>
          </div>
          <Button variant="destructive" onClick={handleStop}>
            <Square className="mr-1 h-4 w-4" />
            Parar
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border bg-card p-4">
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Escolha uma tarefa" />
            </SelectTrigger>
            <SelectContent>
              {tasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleStart} disabled={!selectedTaskId}>
            <Play className="mr-1 h-4 w-4" />
            Iniciar
          </Button>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Tempo de hoje por tarefa
        </h3>
        {totalsByTask.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Nenhum tempo registrado hoje"
            description="Inicie um timer para começar a rastrear."
          />
        ) : (
          <div className="space-y-2">
            {totalsByTask.map(({ taskId, task, seconds }) => (
              <div
                key={taskId}
                className="flex items-center justify-between rounded-lg border bg-card p-3"
              >
                <span className="font-medium">{task?.title ?? "Tarefa removida"}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {formatDuration(seconds)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/tasks/Live.tsx
git commit -m "feat: adiciona pagina Live com timer start/stop e tempo do dia"
```

---

## Task 19: Rotas — registrar `/tasks`, `/tasks/projects`, `/tasks/projects/:id`, `/tasks/live`

**Files:**
- Modify: `src/routes.tsx`

**Interfaces:**
- Consumes: `TaskList`, `Projects`, `ProjectDetail`, `Live` (Tasks 15–18).
- Produces: rotas acessíveis via sidebar (Task 14).

- [ ] **Step 1: Adicionar os lazy imports**

Logo após `const Account = lazy(...)` (linha ~31):

```ts
const TaskList = lazy(() => import("./pages/admin/tasks/TaskList"));
const Projects = lazy(() => import("./pages/admin/tasks/Projects"));
const ProjectDetail = lazy(() => import("./pages/admin/tasks/ProjectDetail"));
const Live = lazy(() => import("./pages/admin/tasks/Live"));
```

- [ ] **Step 2: Adicionar as rotas dentro do `ProtectedRoute` (após o bloco `finance`, antes de `movies`)**

```tsx
          {
            path: "tasks",
            children: [
              { index: true, element: <TaskList /> },
              { path: "projects", element: <Projects /> },
              { path: "projects/:id", element: <ProjectDetail /> },
              { path: "live", element: <Live /> },
            ],
          },
```

- [ ] **Step 3: Checar compilação**

Run: `npx tsc -b --noEmit`
Expected: sem erros novos.

- [ ] **Step 4: Verificar manualmente**

Run: `npm run dev`
Expected: acessar `http://localhost:5173/tasks`, `/tasks/projects`, `/tasks/live` autenticado carrega cada página sem erro no console; sidebar mostra o grupo "Produtividade".

- [ ] **Step 5: Commit**

```bash
git add src/routes.tsx
git commit -m "feat: registra rotas do modulo de tarefas/projetos"
```

---

## Task 20: Verificação final

**Files:** nenhum (apenas validação).

- [ ] **Step 1: Rodar toda a suíte**

Run: `npm run lint && npm run test && npx tsc -b --noEmit`
Expected: tudo verde, incluindo os 23 testes novos de `src/domain/tasks`.

- [ ] **Step 2: Fluxo manual fim a fim**

Run: `npm run dev`
Expected, na ordem:
1. Criar um projeto em `/tasks/projects`.
2. Abrir o Kanban do projeto, criar 2 tarefas, mover uma para "Fazendo".
3. Adicionar uma subtarefa e marcar como concluída.
4. Criar uma dependência entre as duas tarefas e confirmar o aviso "Depende de tarefa(s) não concluída(s)" (sem bloquear o avanço de coluna).
5. Em `/tasks`, criar uma tarefa avulsa com prazo hoje e recorrência diária; conferir que ela aparece.
6. Recarregar a página (simulando um novo dia mudando a data do sistema, se possível, ou revisitar no dia seguinte) e confirmar que uma nova ocorrência é materializada.
7. Em `/tasks/live`, iniciar o timer numa tarefa, aguardar alguns segundos, parar, e conferir que "Tempo de hoje por tarefa" reflete a duração.

- [ ] **Step 3: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "fix: ajustes finais de verificacao do modulo tarefas/projetos"
```
