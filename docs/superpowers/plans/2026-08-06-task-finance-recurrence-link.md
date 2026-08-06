# Vínculo Tarefa ↔ Recorrência Financeira Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que uma tarefa se vincule a uma Recorrência Financeira existente (Mensal/Anual) para que concluir a tarefa marque a parcela como paga em Finanças e vice-versa, com as datas das instâncias geradas vindas das parcelas em aberto da Recorrência.

**Architecture:** Duas colunas novas em `task` (`linked_recurring_id`, `linked_installment_number`). Materialização lazy no fetch (mesmo padrão de `computeMissingOccurrences`/`recurrence_rule`, mas a origem das datas passa a ser `calculateInstallments` do domínio `recurring`). Sync bidirecional: `updateTask` (api/tasks) chama `updateRecurringParcelPayment` (api/recurring) já existente; `updateRecurringParcelPayment` grava direto na tabela `task` (sem chamar `updateTask`) para evitar recursão entre os dois módulos.

**Tech Stack:** React 19 + TypeScript strict, Vite, Supabase JS, Tailwind + shadcn/ui (Radix), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-06-task-finance-recurrence-link-design.md`

## Global Constraints

- Vínculo só em tarefas de topo (o dialog de subtarefa não tem esse campo).
- Tarefa vinculada não usa `recurrence_rule` própria — datas vêm inteiramente das parcelas em aberto da Recorrência (decisão do brainstorm: Approach A).
- `linked_recurring_id` com `on delete set null` — excluir a Recorrência solta a tarefa, nunca apaga em cascata (mesmo princípio do fix já aplicado a `task.project_id`).
- O lado Finanças→Tarefa da sincronização grava direto na tabela `task` via Supabase (nunca chama `updateTask` de `@/api/tasks`) para não criar recursão entre `api/tasks` e `api/recurring`.
- Nenhuma mudança em `calculateInstallments` nem em `updateRecurringParcelPayment` além de uma chamada adicional no fim — reaproveitados como já existem.
- "Lançar transação" para tarefas não vinculadas reaproveita o fluxo já existente de `Transactions.tsx` via query params (`?new=1&nature=despesa&desc=...`) — nenhum componente novo.

---

## Task 1: Migration — colunas de vínculo em `task`

**Files:**
- Create: `supabase/migrations/20260806120000_task_recurring_link.sql`

**Interfaces:**
- Produces: colunas `public.task.linked_recurring_id` (uuid, nullable) e `public.task.linked_installment_number` (int, nullable), usadas por todas as tasks seguintes.

- [ ] **Step 1: Escrever a migration**

```sql
-- Vínculo Tarefa ↔ Recorrência Financeira: uma tarefa-template (linked_installment_number
-- nulo) gera instâncias a partir das parcelas em aberto de uma Recorrência Financeira;
-- cada instância grava o número da parcela correspondente para sincronizar conclusão/pagamento.

alter table public.task
  add column if not exists linked_recurring_id uuid
    references public.recurring_transaction(id) on delete set null,
  add column if not exists linked_installment_number int;

create index if not exists task_linked_recurring_idx
  on public.task (linked_recurring_id, linked_installment_number);

comment on column public.task.linked_recurring_id is
  'Vincula a tarefa a uma Recorrência Financeira. Na tarefa-template '
  '(linked_installment_number nulo) define a origem; nas instâncias geradas, '
  'copiado do template.';
comment on column public.task.linked_installment_number is
  'Nulo na tarefa-template. Nas instâncias geradas, número da parcela da '
  'Recorrência Financeira vinculada correspondente a essa ocorrência.';
```

- [ ] **Step 2: Revisar contra o padrão existente**

Comparar com `supabase/migrations/20260805130000_task_project_delete_set_null.sql`: mesmo padrão de `alter table` incremental sobre `task`, mesma escolha de `on delete set null`. Confirmar que `add column if not exists` é idempotente (permite reexecução sem erro).

- [ ] **Step 3: Aplicar a migration**

Run: `supabase db push`
Expected: migration aplicada sem erro; `select linked_recurring_id, linked_installment_number from public.task limit 1;` não retorna erro de coluna inexistente.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260806120000_task_recurring_link.sql
git commit -m "feat: adiciona colunas de vinculo task-recorrencia financeira"
```

---

## Task 2: Types — `linked_recurring_id`/`linked_installment_number` em `Task`

**Files:**
- Modify: `src/types/tasks.ts`

**Interfaces:**
- Consumes: nenhuma (types puros).
- Produces: `Task.linked_recurring_id`, `Task.linked_installment_number` — usados por todas as tasks seguintes. `TaskCreateRequest` passa a incluir `linked_recurring_id` (settable na criação) mas continua excluindo `linked_installment_number` (só a materialização define).

- [ ] **Step 1: Editar a interface `Task` e `TaskCreateRequest`**

Em `src/types/tasks.ts`, no bloco da interface `Task` (logo após `recurrence_rule: RecurrenceRule | null;`), adicionar:

```ts
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
  linked_recurring_id: string | null;
  linked_installment_number: number | null;
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
  | "linked_installment_number"
>;
```

- [ ] **Step 2: Checar compilação**

Run: `npx tsc -b`
Expected: erros novos apontando todo lugar que constrói um `TaskCreateRequest`/`Task` sem os campos novos (`Projects.tsx`/`TaskList.tsx`/`ProjectKanban.tsx` — serão corrigidos nas Tasks 6 e 7 deste plano; `Projects.tsx` não constrói `Task`, só `Project`, não deve ser afetado). Confirmar que os únicos erros são `emptyTask()` em `TaskList.tsx` e `ProjectKanban.tsx` faltando `linked_recurring_id`.

- [ ] **Step 3: Commit**

```bash
git add src/types/tasks.ts
git commit -m "feat: adiciona linked_recurring_id/linked_installment_number ao tipo Task"
```

---

## Task 3: Domain — `linkedInstallments.ts` (diff de parcelas materializadas)

**Files:**
- Create: `src/domain/tasks/linkedInstallments.ts`
- Test: `src/domain/tasks/__tests__/linkedInstallments.test.ts`
- Modify: `src/domain/tasks/index.ts`

**Interfaces:**
- Consumes: nenhuma (tipo local `OpenInstallment`).
- Produces: `computeMissingLinkedInstallments(openInstallments: OpenInstallment[], materializedNumbers: number[]): OpenInstallment[]` — usada pela Task 5 (`api/tasks/tasks.ts`).

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { computeMissingLinkedInstallments } from "@/domain/tasks/linkedInstallments";

describe("computeMissingLinkedInstallments", () => {
  it("retorna todas as parcelas em aberto quando nenhuma foi materializada", () => {
    const result = computeMissingLinkedInstallments(
      [
        { number: 1, dueDate: "2026-09-10" },
        { number: 2, dueDate: "2026-10-10" },
      ],
      []
    );
    expect(result).toEqual([
      { number: 1, dueDate: "2026-09-10" },
      { number: 2, dueDate: "2026-10-10" },
    ]);
  });

  it("pula parcelas já materializadas", () => {
    const result = computeMissingLinkedInstallments(
      [
        { number: 1, dueDate: "2026-09-10" },
        { number: 2, dueDate: "2026-10-10" },
      ],
      [1]
    );
    expect(result).toEqual([{ number: 2, dueDate: "2026-10-10" }]);
  });

  it("retorna vazio quando não há parcelas em aberto", () => {
    expect(computeMissingLinkedInstallments([], [])).toEqual([]);
  });

  it("retorna vazio quando todas já foram materializadas", () => {
    const result = computeMissingLinkedInstallments(
      [{ number: 1, dueDate: "2026-09-10" }],
      [1]
    );
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx vitest run src/domain/tasks/__tests__/linkedInstallments.test.ts`
Expected: FAIL — `Cannot find module '@/domain/tasks/linkedInstallments'`.

- [ ] **Step 3: Implementar `linkedInstallments.ts`**

```ts
export interface OpenInstallment {
  number: number;
  dueDate: string;
}

/**
 * Diff puro: quais parcelas em aberto de uma Recorrência Financeira ainda não
 * têm uma instância de tarefa materializada. A materialização (insert no
 * banco) fica em `api/tasks/tasks.ts`.
 */
export function computeMissingLinkedInstallments(
  openInstallments: OpenInstallment[],
  materializedNumbers: number[]
): OpenInstallment[] {
  const materialized = new Set(materializedNumbers);
  return openInstallments.filter(
    (installment) => !materialized.has(installment.number)
  );
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx vitest run src/domain/tasks/__tests__/linkedInstallments.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Adicionar ao barrel**

Em `src/domain/tasks/index.ts`:

```ts
export * from "./recurrence";
export * from "./dependencies";
export * from "./timeTracking";
export * from "./filters";
export * from "./linkedInstallments";
```

- [ ] **Step 6: Rodar toda a suíte do domínio**

Run: `npx vitest run src/domain/tasks`
Expected: PASS (todos os testes existentes + 4 novos).

- [ ] **Step 7: Commit**

```bash
git add src/domain/tasks/linkedInstallments.ts src/domain/tasks/__tests__/linkedInstallments.test.ts src/domain/tasks/index.ts
git commit -m "feat: adiciona diff de parcelas vinculadas materializadas"
```

---

## Task 4: API — `api/recurring.ts` (fetch por ids + sync Finanças→Tarefa)

**Files:**
- Modify: `src/api/recurring.ts`

**Interfaces:**
- Consumes: `supabase`, `getCurrentUserId` (já importados no arquivo).
- Produces: `fetchRecurringTransactionsByIds(ids: string[]): Promise<RecurringScheduleFields[]>` — usada pela Task 5 (`api/tasks/tasks.ts`). `updateRecurringParcelPayment` passa a sincronizar a tarefa vinculada (se houver) ao fim de cada branch (pagamento e undo).

- [ ] **Step 1: Adicionar `fetchRecurringTransactionsByIds`**

No topo do arquivo, logo após `fetchLastPaidAtByRecurring` (antes de `updateRecurringParcelPayment`):

```ts
export interface RecurringScheduleFields {
  id: string;
  payment_start_date: string | null;
  due_day: number | null;
  installment_count: number | null;
  validity: string | null;
  frequency: string;
  paid_parcels: number[];
  created_at: string;
  status: boolean;
}

/** Campos mínimos para calcular parcelas — usado pela materialização de tarefas vinculadas. */
export async function fetchRecurringTransactionsByIds(
  ids: string[]
): Promise<RecurringScheduleFields[]> {
  if (ids.length === 0) return [];
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("recurring_transaction")
    .select(
      "id, payment_start_date, due_day, installment_count, validity, frequency, paid_parcels, created_at, status"
    )
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as RecurringScheduleFields[];
}
```

- [ ] **Step 2: Adicionar o helper de sync Finanças→Tarefa**

Logo antes de `export async function updateRecurringParcelPayment` (mesmo arquivo):

```ts
/**
 * Sincroniza a tarefa vinculada (se houver) com o pagamento/estorno de uma
 * parcela. Atualiza a tabela `task` diretamente (não chama `updateTask` de
 * `@/api/tasks`) para evitar recursão entre os dois lados do vínculo.
 */
async function syncLinkedTaskFromInstallment(
  recurringId: string,
  installmentNumber: number,
  paid: boolean
): Promise<void> {
  const userId = await getCurrentUserId();
  const { data: task, error: fetchError } = await supabase
    .from("task")
    .select("id, status")
    .eq("user_id", userId)
    .eq("linked_recurring_id", recurringId)
    .eq("linked_installment_number", installmentNumber)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!task) return;

  const targetStatus = paid ? "done" : "todo";
  if (task.status === targetStatus) return;

  const { error } = await supabase
    .from("task")
    .update({
      status: targetStatus,
      completed_at: paid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .eq("user_id", userId);

  if (error) throw error;
}
```

- [ ] **Step 3: Chamar o sync nas duas branches de `updateRecurringParcelPayment`**

No branch `isUndo` (dentro do `if (isUndo) { ... }`), logo antes do `return rollback?.paid_parcels ?? updatedParcels;` final:

```ts
    await syncLinkedTaskFromInstallment(recurringId, installmentNumber, false);

    return rollback?.paid_parcels ?? updatedParcels;
```

No branch de pagamento (depois do bloco `try { ... syncGoalsFromAporteDescription ... } catch { }`), antes do `return updatedParcels;` final da função:

```ts
  await syncLinkedTaskFromInstallment(recurringId, installmentNumber, true);

  return updatedParcels;
```

- [ ] **Step 4: Checar compilação**

Run: `npx tsc -b`
Expected: sem erros novos em `src/api/recurring.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/api/recurring.ts
git commit -m "feat: sincroniza tarefa vinculada ao pagar/desfazer parcela em Financas"
```

---

## Task 5: API — `api/tasks/tasks.ts` (materialização + sync Tarefa→Finanças)

**Files:**
- Modify: `src/api/tasks/tasks.ts`

**Interfaces:**
- Consumes: `calculateInstallments`, `resolvePaymentStartDate` (`@/domain/recurring`), `computeMissingLinkedInstallments` (`@/domain/tasks`), `fetchRecurringTransactionsByIds`, `updateRecurringParcelPayment` (`@/api/recurring`).
- Produces: `fetchTasks()` passa a materializar também instâncias vinculadas a Recorrências Financeiras. `updateTask()` passa a sincronizar a Recorrência vinculada (se houver) ao concluir/reabrir a tarefa.

- [ ] **Step 1: Adicionar os imports novos**

No topo de `src/api/tasks/tasks.ts`, ajustar/adicionar:

```ts
import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { computeMissingLinkedInstallments, computeMissingOccurrences } from "@/domain/tasks";
import { calculateInstallments, resolvePaymentStartDate } from "@/domain/recurring";
import {
  fetchRecurringTransactionsByIds,
  updateRecurringParcelPayment,
} from "@/api/recurring";
import { formatLocalIsoDate } from "@/lib/dates";
import type { Task, TaskCreateRequest, TaskUpdateRequest } from "@/types/tasks";
```

- [ ] **Step 2: Adicionar `materializeLinkedInstances`**

Logo após a função `materializeRecurringInstances` existente:

```ts
async function materializeLinkedInstances(
  userId: string,
  tasks: Task[]
): Promise<Task[]> {
  const templates = tasks.filter(
    (task) => task.linked_recurring_id && task.linked_installment_number == null
  );
  if (templates.length === 0) return tasks;

  const recurringIds = Array.from(
    new Set(templates.map((task) => task.linked_recurring_id as string))
  );
  const recurringRows = await fetchRecurringTransactionsByIds(recurringIds);
  const recurringById = new Map(recurringRows.map((row) => [row.id, row]));

  const newRows: Array<Record<string, unknown>> = [];

  for (const template of templates) {
    const recurring = recurringById.get(template.linked_recurring_id as string);
    if (!recurring || !recurring.status) continue;

    const installments = calculateInstallments(
      resolvePaymentStartDate(recurring),
      recurring.due_day,
      recurring.installment_count,
      recurring.validity,
      recurring.frequency
    );
    if (!Array.isArray(installments)) continue;

    const paidParcels = recurring.paid_parcels ?? [];
    const openInstallments = installments.filter(
      (installment) => !paidParcels.includes(installment.number)
    );

    const materializedNumbers = tasks
      .filter(
        (task) =>
          task.linked_recurring_id === template.linked_recurring_id &&
          task.linked_installment_number != null
      )
      .map((task) => task.linked_installment_number as number);

    const missing = computeMissingLinkedInstallments(
      openInstallments,
      materializedNumbers
    );

    for (const installment of missing) {
      newRows.push({
        user_id: userId,
        project_id: template.project_id,
        parent_task_id: null,
        title: template.title,
        description: template.description ?? null,
        status: "todo",
        tags: template.tags,
        due_date: installment.dueDate,
        recurrence_rule: null,
        recurrence_origin_id: template.id,
        linked_recurring_id: template.linked_recurring_id,
        linked_installment_number: installment.number,
      });
    }
  }

  if (newRows.length === 0) return tasks;

  const { data, error } = await supabase.from("task").insert(newRows).select();
  if (error) throw new Error(error.message);
  return [...tasks, ...(data ?? [])];
}
```

- [ ] **Step 3: Encadear a nova materialização em `fetchTasks`**

Substituir o corpo de `fetchTasks`:

```ts
export async function fetchTasks(): Promise<Task[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("task")
    .select("*")
    .eq("user_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const withRecurring = await materializeRecurringInstances(userId, data ?? []);
  return materializeLinkedInstances(userId, withRecurring);
}
```

- [ ] **Step 4: Adicionar o sync Tarefa→Finanças em `updateTask`**

Substituir `updateTask` por:

```ts
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

  if (fields.status) {
    await syncLinkedInstallmentFromTask(id, userId, fields.status === "done");
  }
}

/**
 * Sincroniza a Recorrência Financeira vinculada (se houver) com a conclusão/
 * reabertura da tarefa. Reaproveita `updateRecurringParcelPayment`, que já
 * cria/remove a transação e atualiza `paid_parcels`.
 */
async function syncLinkedInstallmentFromTask(
  taskId: string,
  userId: string,
  becomingDone: boolean
): Promise<void> {
  const { data: task, error } = await supabase
    .from("task")
    .select("linked_recurring_id, linked_installment_number")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!task?.linked_recurring_id || task.linked_installment_number == null) return;

  const [recurring] = await fetchRecurringTransactionsByIds([
    task.linked_recurring_id,
  ]);
  if (!recurring) return;

  const paidParcels = recurring.paid_parcels ?? [];
  const isPaid = paidParcels.includes(task.linked_installment_number);
  if (becomingDone === isPaid) return;

  await updateRecurringParcelPayment(
    task.linked_recurring_id,
    task.linked_installment_number,
    paidParcels
  );
}
```

- [ ] **Step 5: Checar compilação**

Run: `npx tsc -b`
Expected: sem erros novos em `src/api/tasks/tasks.ts` (erros restantes de `emptyTask()` nas Tasks 6/7 ainda pendentes até lá).

- [ ] **Step 6: Rodar a suíte de domínio/api existente (regressão)**

Run: `npx vitest run`
Expected: todos os testes continuam passando (nenhum teste existente cobre `api/tasks`/`api/recurring` diretamente — são só integração manual — mas a suíte de domínio não pode quebrar).

- [ ] **Step 7: Commit**

```bash
git add src/api/tasks/tasks.ts
git commit -m "feat: materializa instancias vinculadas e sincroniza conclusao com Financas"
```

---

## Task 6: UI — `TaskList.tsx` (campo de vínculo + ação "Lançar transação")

**Files:**
- Modify: `src/pages/admin/tasks/TaskList.tsx`

**Interfaces:**
- Consumes: `fetchRecurringTransactions` (`@/api/recurring`), `Recurring` (`@/types/recurring`).
- Produces: formulário de tarefa com campo opcional de vínculo; card de tarefa concluída e não vinculada ganha ação "Lançar transação".

- [ ] **Step 1: Importar `fetchRecurringTransactions` e o tipo `Recurring`**

No topo do arquivo, ajustar os imports:

```ts
import {
  createTask,
  deleteTask,
  fetchProjects,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import { filterTasks, sortTasksByDueDate } from "@/domain/tasks";
import type {
  Project,
  RecurrenceFrequency,
  Task,
  TaskCreateRequest,
} from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
```

- [ ] **Step 2: Adicionar estado e carregar as Recorrências junto com tasks/projects**

Substituir a declaração de estados e `load`:

```ts
export default function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
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
      const [taskList, projectList, recurringList] = await Promise.all([
        fetchTasks(),
        fetchProjects(),
        fetchRecurringTransactions(),
      ]);
      setTasks(taskList);
      setProjects(projectList);
      setRecurrings(recurringList);
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
```

- [ ] **Step 3: Adicionar `linked_recurring_id` a `emptyTask()` e ao `openEdit`**

```ts
const emptyTask = (): TaskCreateRequest => ({
  project_id: null,
  parent_task_id: null,
  title: "",
  description: "",
  status: "todo",
  tags: [],
  due_date: null,
  recurrence_rule: null,
  linked_recurring_id: null,
});
```

Em `openEdit`, dentro do `setForm({...})`, adicionar `linked_recurring_id: task.linked_recurring_id,` (logo após `recurrence_rule: task.recurrence_rule,`).

- [ ] **Step 4: Excluir tarefas-template das listas visíveis**

Uma tarefa-template (`linked_recurring_id` setado, `linked_installment_number` nulo) nunca deve aparecer como card — só as instâncias geradas. Substituir `visibleTasks`:

```ts
  const visibleTasks = useMemo(() => {
    const projectId =
      projectFilter === "all" ? undefined : projectFilter === "null" ? null : projectFilter;
    const filtered = filterTasks(tasks, {
      tag: tagFilter || undefined,
      projectId,
    });
    return sortTasksByDueDate(
      filtered.filter(
        (t) =>
          !t.parent_task_id &&
          !(t.linked_recurring_id && t.linked_installment_number == null)
      )
    );
  }, [tasks, tagFilter, projectFilter]);
```

- [ ] **Step 5: Limpar prazo/recorrência ao vincular, no `handleSave`**

Substituir o início de `handleSave`:

```ts
  async function handleSave() {
    if (!form.title.trim()) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const isLinked = !!form.linked_recurring_id;
    const payload: TaskCreateRequest = {
      ...form,
      tags,
      due_date: isLinked ? null : form.due_date,
      recurrence_rule:
        !isLinked && repeats && form.due_date ? { frequency, interval: 1 } : null,
    };
```

(o restante da função, `try { if (editing) ... }`, continua igual.)

- [ ] **Step 6: Adicionar o campo no dialog e esconder prazo/repetição quando vinculado**

No JSX do dialog, logo após o bloco do campo "Projeto" e antes do campo "Tags":

```tsx
            <div>
              <FormLabel optional>Vincular a uma Recorrência Financeira</FormLabel>
              <Select
                value={form.linked_recurring_id ?? "none"}
                onValueChange={(v) =>
                  setForm({ ...form, linked_recurring_id: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {recurrings.map((rec) => (
                    <SelectItem key={rec.id} value={rec.id}>
                      {rec.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
```

Envolver o bloco existente de "Prazo" + "Repetir" (do `<div><FormLabel optional>Prazo</FormLabel>...` até o fechamento do `{form.due_date && (...)}`) numa condicional `{!form.linked_recurring_id && (...)}`:

```tsx
            {!form.linked_recurring_id && (
              <>
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
              </>
            )}
```

- [ ] **Step 7: Sinalizar tarefa vinculada e adicionar "Lançar transação" na lista**

No `<div className="mt-1 flex flex-wrap items-center gap-1.5 ...">` de cada card (onde já mostra status/prazo/tags), adicionar logo após o badge de status:

```tsx
                  {task.linked_recurring_id && (
                    <Badge variant="outline" className="text-[10px]">
                      Vinculada a Recorrência
                    </Badge>
                  )}
```

E, no bloco de ações do card (`<div className="flex shrink-0 gap-1">`), antes do botão de editar, adicionar (só quando concluída e não vinculada):

```tsx
                {task.status === "done" && !task.linked_recurring_id && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                    <Link
                      to={`/finance/transactions?new=1&nature=despesa&desc=${encodeURIComponent(task.title)}`}
                    >
                      Lançar transação
                    </Link>
                  </Button>
                )}
```

Isso exige importar `Link` de `react-router-dom` no topo do arquivo:

```ts
import { Link } from "react-router-dom";
```

- [ ] **Step 8: Checar compilação e lint**

Run: `npx tsc -b && npx eslint src/pages/admin/tasks/TaskList.tsx`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/pages/admin/tasks/TaskList.tsx
git commit -m "feat: adiciona vinculo a Recorrencia Financeira na tela de tarefas"
```

---

## Task 7: UI — `ProjectKanban.tsx` (campo de vínculo + ação "Lançar transação")

**Files:**
- Modify: `src/pages/admin/tasks/ProjectKanban.tsx`

**Interfaces:**
- Consumes: `fetchRecurringTransactions` (`@/api/recurring`), `Recurring` (`@/types/recurring`).
- Produces: mesmo campo de vínculo do Task 6, aplicado ao dialog de tarefa do Kanban (sem os controles de repetição, que esse dialog não tem).

- [ ] **Step 1: Importar `fetchRecurringTransactions` e o tipo `Recurring`**

```ts
import {
  createTask,
  deleteTask,
  fetchProjectById,
  fetchTasks,
  updateTask,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import type { Project, Task, TaskCreateRequest, TaskStatus } from "@/types/tasks";
import type { Recurring } from "@/types/recurring";
```

- [ ] **Step 2: Adicionar estado e carregar junto com projeto/tarefas**

```ts
export default function ProjectKanban() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recurrings, setRecurrings] = useState<Recurring[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState(emptyTask(id ?? ""));
  const [tagsInput, setTagsInput] = useState("");
  const [subtaskDrafts, setSubtaskDrafts] = useState<Record<string, string>>({});
  const { toast } = useToast();

  useBreadcrumbTitle(project?.name);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [projectData, taskList, recurringList] = await Promise.all([
        fetchProjectById(id),
        fetchTasks(),
        fetchRecurringTransactions(),
      ]);
      setProject(projectData);
      setTasks(taskList.filter((t) => t.project_id === id));
      setRecurrings(recurringList);
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
```

- [ ] **Step 3: Adicionar `linked_recurring_id` a `emptyTask()` e ao `openEdit`**

```ts
const emptyTask = (projectId: string): TaskCreateRequest => ({
  project_id: projectId,
  parent_task_id: null,
  title: "",
  description: "",
  status: "todo",
  tags: [],
  due_date: null,
  recurrence_rule: null,
  linked_recurring_id: null,
});
```

Em `openEdit`, no `setForm({...})`, adicionar `linked_recurring_id: task.linked_recurring_id,` (logo após `recurrence_rule: task.recurrence_rule,`).

- [ ] **Step 4: Excluir tarefas-template das colunas do Kanban**

Uma tarefa-template nunca deve virar card. Substituir `topLevelByStatus`:

```ts
  const topLevelByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
    for (const task of tasks) {
      if (
        !task.parent_task_id &&
        !(task.linked_recurring_id && task.linked_installment_number == null)
      ) {
        map[task.status].push(task);
      }
    }
    return map;
  }, [tasks]);
```

- [ ] **Step 5: Limpar prazo ao vincular, em `handleSave`**

```ts
  async function handleSave() {
    if (!form.title.trim()) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const isLinked = !!form.linked_recurring_id;
    const payload = { ...form, tags, due_date: isLinked ? null : form.due_date };
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
```

- [ ] **Step 6: Adicionar o campo no dialog e esconder o Prazo quando vinculado**

No JSX do dialog, logo após o campo "Tags" e antes do campo "Prazo":

```tsx
            <div>
              <FormLabel optional>Vincular a uma Recorrência Financeira</FormLabel>
              <Select
                value={form.linked_recurring_id ?? "none"}
                onValueChange={(v) =>
                  setForm({ ...form, linked_recurring_id: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {recurrings.map((rec) => (
                    <SelectItem key={rec.id} value={rec.id}>
                      {rec.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
```

Isso exige importar `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` de `@/components/ui/select` no topo do arquivo (ainda não importados nesse arquivo).

Envolver o bloco existente do campo "Prazo" numa condicional:

```tsx
            {!form.linked_recurring_id && (
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
            )}
```

- [ ] **Step 7: Sinalizar tarefa vinculada e adicionar "Lançar transação" no card do Kanban**

No bloco `<div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">` de cada card, adicionar após a checagem de `task.due_date`:

```tsx
                          {task.linked_recurring_id && (
                            <Badge variant="outline" className="text-[10px]">
                              Vinculada a Recorrência
                            </Badge>
                          )}
```

E no rodapé do card (ao lado dos botões de mover status), quando concluída e não vinculada:

```tsx
                        {task.status === "done" && !task.linked_recurring_id && (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" asChild>
                            <Link
                              to={`/finance/transactions?new=1&nature=despesa&desc=${encodeURIComponent(task.title)}`}
                            >
                              Lançar transação
                            </Link>
                          </Button>
                        )}
```

(`Link` já está importado nesse arquivo, de `react-router-dom`.)

- [ ] **Step 8: Checar compilação e lint**

Run: `npx tsc -b && npx eslint src/pages/admin/tasks/ProjectKanban.tsx`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add src/pages/admin/tasks/ProjectKanban.tsx
git commit -m "feat: adiciona vinculo a Recorrencia Financeira no Kanban do projeto"
```

---

## Task 8: UI — `Live.tsx` (excluir tarefas-template do seletor)

**Files:**
- Modify: `src/pages/admin/tasks/Live.tsx`

**Interfaces:**
- Consumes: nenhuma nova.
- Produces: `availableTasks` deixa de incluir tarefas-template vinculadas (que não têm prazo/ação própria).

- [ ] **Step 1: Excluir tarefas-template de `availableTasks`**

Substituir:

```ts
  const availableTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== "done" &&
          !(t.linked_recurring_id && t.linked_installment_number == null)
      ),
    [tasks]
  );
```

- [ ] **Step 2: Checar compilação e lint**

Run: `npx tsc -b && npx eslint src/pages/admin/tasks/Live.tsx`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/tasks/Live.tsx
git commit -m "fix: exclui tarefas-template vinculadas do seletor da secao Live"
```

---

## Task 9: Verificação manual fim a fim

**Files:** nenhum (só verificação).

- [ ] **Step 1: Rodar toda a suíte automatizada**

Run: `npx tsc -b && npx eslint . && npx vitest run`
Expected: 0 erros de tipo, 0 erros de lint (warnings pré-existentes são aceitáveis), todos os testes passando.

- [ ] **Step 2: Verificação no navegador — vínculo mensal (ida)**

1. Criar uma Recorrência Financeira em `/finance/recurring` (Mensal, ex. "DAS", com dia de vencimento e quantidade de parcelas).
2. Em `/tasks`, criar uma tarefa "Pagar DAS" e vinculá-la a essa Recorrência.
3. Recarregar `/tasks` — confirmar que uma instância aparece com o prazo igual ao vencimento da 1ª parcela em aberto (a tarefa-template não aparece na lista).
4. Marcar a instância como concluída.
5. Ir a `/finance/recurring` e confirmar que a parcela correspondente está marcada como paga.

- [ ] **Step 3: Verificação no navegador — vínculo mensal (volta)**

1. Em `/finance/recurring`, desfazer o pagamento da parcela marcada no Step 2.
2. Voltar a `/tasks` e confirmar que a instância reabriu (status volta a "A fazer").

- [ ] **Step 4: Verificação no navegador — exclusão da Recorrência**

1. Excluir a Recorrência Financeira vinculada.
2. Confirmar em `/tasks` que a tarefa (template e/ou instâncias já geradas) continua existindo, agora sem vínculo.

- [ ] **Step 5: Verificação no navegador — "Lançar transação"**

1. Criar uma tarefa recorrente semanal comum (sem vínculo), ex. "Pagar psicóloga".
2. Marcar como concluída.
3. Confirmar que aparece a ação "Lançar transação" e que ela abre `/finance/transactions` com o formulário de nova despesa pré-preenchido com a descrição da tarefa.

- [ ] **Step 6: Atualizar `docs/planning-features.md`**

Marcar com `[x]` cada item da seção "Tarefas de implementação — Vínculo Tarefa ↔ Recorrência Financeira", registrando o hash do commit de cada task deste plano.

```bash
git add docs/planning-features.md
git commit -m "docs: marca vinculo tarefa-recorrencia financeira como concluido"
```
