# Vínculo Tarefa ↔ Recorrência Financeira — Design

**Origem:** `docs/coworking.md` (linha "quero pode começar a dedicar..." — trecho de recorrência de pagamentos) e pedido direto do usuário: lembrar em Tarefas de pagamentos recorrentes (ex.: psicóloga toda terça, DAS mensal), idealmente ligados às Recorrências Financeiras existentes.

**Escopo desta rodada:** só o vínculo Tarefa ↔ Recorrência Financeira. A visão de Calendário (mencionada no mesmo pedido) é um sub-projeto independente, com spec própria em rodada separada — decisão tomada no brainstorm para não misturar dois subsistemas numa spec só.

## Problema

Hoje Tarefas e Recorrências Financeiras são dois sistemas de recorrência completamente independentes:
- `Task.recurrence_rule`: `daily | weekly | monthly` + `interval`, materializado lazy no fetch (`computeMissingOccurrences`).
- `recurring_transaction`: `Mensal | Anual` com `installment_count`/`due_day`/`validity`, parcelas computadas via `calculateInstallments` (pura, não persistida) e pagamento rastreado em `paid_parcels`.

Para obrigações como DAS (mensal, já cabe hoje em Recorrências Financeiras) o usuário quer que completar a tarefa "pagar DAS" também marque a parcela como paga em Finanças — hoje isso exige repetir a ação duas vezes em dois lugares.

Para obrigações semanais como a psicóloga, Recorrências Financeiras não suporta frequência semanal (só Mensal/Anual) — decisão do brainstorm: **não estender o motor financeiro para semanal nesta rodada**. Esses casos continuam como tarefa recorrente comum (`recurrence_rule: weekly`), sem vínculo, com uma ação opcional de "lançar transação" ao concluir.

## Decisões-chave (validadas no brainstorm)

1. **Cadência do vínculo:** quando uma tarefa está vinculada a uma Recorrência Financeira, é a Recorrência que dita as datas — a tarefa não usa mais `recurrence_rule` própria. Evita duas engines de recorrência independentes precisando bater por data (Approach A vs. Approach B discutidas; A escolhida por eliminar o matching por proximidade de data).
2. **Sincronização é bidirecional:** concluir a tarefa marca a parcela paga em Finanças (via `updateRecurringParcelPayment`, já existente); marcar a parcela paga em Finanças também conclui a tarefa vinculada. Desfazer em qualquer lado desfaz no outro.
3. **Ponto de entrada:** o vínculo é configurado no formulário de Tarefa (campo opcional "Vincular a uma Recorrência Financeira"), não no formulário de Recorrência.
4. **Exclusão da Recorrência:** `on delete set null` — a tarefa vinculada (e instâncias já geradas) viram tarefas soltas, nada é apagado em cascata (mesmo princípio do fix de `task.project_id` já aplicado).

## Modelo de dados

Duas colunas novas em `public.task` (migration nova, não altera `20260803121500_tasks_projects.sql` já aplicada):

```sql
alter table public.task
  add column linked_recurring_id uuid references public.recurring_transaction(id) on delete set null,
  add column linked_installment_number int;

create index task_linked_recurring_idx on public.task (linked_recurring_id, linked_installment_number);
```

- **Tarefa-template** (ex.: título "Pagar DAS"): `linked_recurring_id` setado, `linked_installment_number` nulo, `due_date`/`recurrence_rule` nulos. Nunca aparece nas listas/Kanban/Live — é só a definição do vínculo.
- **Instância gerada**: `linked_recurring_id` copiado do template, `linked_installment_number` = número da parcela, `due_date` = vencimento daquela parcela, `recurrence_origin_id` apontando para o template (reaproveita o mesmo campo já usado pela recorrência simples).

Filtro de visibilidade nas páginas (Tarefas/Kanban/Live): excluir linhas onde `linked_recurring_id is not null and linked_installment_number is null` (é o template, não uma ocorrência real).

## Fluxo de materialização (lazy, no fetch — mesmo padrão da recorrência simples)

Em `fetchTasks`, ao lado de `materializeRecurringInstances` (que trata `recurrence_rule`), nova função `materializeLinkedInstallments`:

1. Encontrar templates (`linked_recurring_id` setado, `linked_installment_number` nulo).
2. Para cada template, buscar a Recorrência Financeira vinculada e computar suas parcelas em aberto (`calculateInstallments` + filtrar por `paid_parcels`) — mesma função pura que Finanças já usa.
3. Para parcelas em aberto sem instância de tarefa correspondente (`linked_installment_number` ainda não materializado), inserir uma linha de tarefa nova.
4. Parcelas que já viraram pagas não geram/mantêm instância pendente — se a instância existir e a parcela virou paga por fora (ver sync reverso abaixo), ela já foi marcada `done`, não precisa rematerializar.

Novo helper puro testável em `domain/tasks` (nome sugerido: `computeMissingLinkedInstallments`), espelhando `computeMissingOccurrences`: recebe a lista de parcelas em aberto e os números já materializados, devolve os que faltam.

## Sincronização

**Tarefa → Finanças** (em `updateTask`, `api/tasks/tasks.ts`): se a linha tem `linked_recurring_id` e `linked_installment_number` e o `status` está indo para `"done"`, chamar `updateRecurringParcelPayment(linked_recurring_id, linked_installment_number, paidParcelsAtuais)` (função já existente em `api/recurring.ts` — cria a transação e atualiza `paid_parcels`). Reabrir a tarefa (`done` → outro status) chama a mesma função (ela já suporta undo via toggle).

**Finanças → Tarefa** (em `updateRecurringParcelPayment`, `api/recurring.ts`): após atualizar `paid_parcels`, buscar `task` com `linked_recurring_id` + `linked_installment_number` correspondentes e setar `status: "done"` (pagamento) ou `status: "todo"` + `completed_at: null` (undo).

Ambos os lados chamam a mesma função de origem — sem duplicar a lógica de criar/remover a transação, só adicionar a ponta que falta em cada uma.

## UI

**Formulário de Tarefa** (`TaskList.tsx` e `ProjectKanban.tsx`, mesmo dialog): campo opcional "Vincular a uma Recorrência Financeira" — `Select` populado por `fetchRecurringTransactions()` filtrado a `status: true` (Recorrências ativas). Ao selecionar uma, os controles de prazo/repetição do formulário somem (a cadência agora vem da Recorrência).

**Renderização**: instâncias vinculadas aparecem como qualquer outra tarefa (título, prazo, status); um ícone/tooltip discreto ("Vinculada à Recorrência: DAS") sinaliza a origem, já que a data não é editável livremente ali.

**Tarefas não vinculadas com pagamento (ex.: psicóloga)**: sem mudança de dado — continuam `recurrence_rule: weekly` comum. Ação nova, genérica, disponível em qualquer card de tarefa ao marcar como concluída: botão opcional "Lançar transação", que abre o formulário de nova transação já existente em Finanças (sem pré-preenchimento especial). Não há detecção automática de "isso parece um pagamento" — fica a critério do usuário clicar ou não.

## Casos de borda

- **Recorrência excluída**: `on delete set null` — tarefa e instâncias já geradas viram tarefas soltas (comportamento igual ao fix de `project_id`).
- **Recorrência sem parcelas em aberto** (tudo pago, ou plano fixo vencido sem renovação): materialização não gera nada — sem lembrete pendurado, espelha o comportamento de `canRenewFixedPlan` que Finanças já tem.
- **Excluir uma instância de tarefa vinculada** (delete, não conclusão): não mexe em Finanças — a parcela continua em aberto e a instância é remonstrada no próximo fetch (mesmo comportamento hoje da recorrência simples: apagar uma ocorrência não impede que ela seja recriada, já que `computeMissingOccurrences`/o novo helper equivalente não sabem que ela foi apagada de propósito).
- **Corrida de materialização dupla**: checar `linked_installment_number` já materializado antes de inserir, mesmo padrão de guarda que a recorrência simples usa para datas.
- **Desfazer pagamento de uma instância já apagada**: sync reverso não encontra tarefa correspondente — no-op, seguro.

## Testes

- Novo domínio puro `computeMissingLinkedInstallments` (ou nome equivalente) — testado com Vitest no mesmo estilo de `computeMissingOccurrences` (`src/domain/tasks/__tests__/`).
- Nenhuma mudança em `calculateInstallments`/`updateRecurringParcelPayment` — reaproveitados como estão.
- Verificação manual fim a fim no navegador (mesmo processo usado no núcleo de Tarefas/Projetos): criar Recorrência → vincular tarefa → conferir instância materializada com a data certa → concluir tarefa → conferir parcela paga em Finanças → desfazer em Finanças → conferir que a tarefa reabre.

## Fora de escopo nesta rodada

- Visão de Calendário (spec separada).
- Frequência semanal em Recorrências Financeiras.
- Detecção automática de "isso parece um pagamento" em tarefas não vinculadas.
- Vincular subtarefas (só tarefas de topo).
