-- Vínculo Tarefa → Item da Lista de Compras (feature 051): a partir de um item da lista o
-- usuário cria uma tarefa "me comprometo a comprar isto". O vínculo é unidirecional — uma
-- única coluna em `task`, como `linked_recurring_id` (20260806120050_task_recurring_link.sql) —
-- e `on delete set null` garante que apagar o item não apaga a tarefa, só desfaz o vínculo.

alter table public.task
  add column if not exists linked_shopping_item_id uuid
    references public.shopping_item(id) on delete set null;

create index if not exists task_linked_shopping_item_idx
  on public.task (linked_shopping_item_id);

comment on column public.task.linked_shopping_item_id is
  'Vincula a tarefa ao item da Lista de Compras que a originou (relação 1:1). '
  'Concluir a tarefa marca o item como comprado e vice-versa. Excluir o item '
  'apenas zera esta coluna (on delete set null) — a tarefa continua existindo.';
