-- Ordem manual dentro da faixa de prioridade (feature 082) — mesma forma das flags ortogonais que
-- as features 049/061/070 acrescentaram a `public.task`: uma coluna a mais na linha, sem tabela
-- nova e sem RLS nova (`public.task` já é escopada por `user_id = auth.uid()` desde
-- 20260803121500, e uma coluna inteira não muda isso; sem tabela nova, `wipe_own_data` também fica
-- como está).
--
-- Inteiro, não índice fracionário: a faixa que é reordenada é uma faixa de prioridade **dentro de um
-- projeto**, pequena o bastante para ser renumerada inteira de 0..n-1 numa escrita em lote
-- (`updateTasksSortOrder`) a cada solta — sem rebalanceamento e sem tipo numérico novo.
--
-- O default `0` é o que garante que nenhuma tarefa existente muda de lugar: com todas em `0`, a
-- ordem visível continua sendo a do comparador da tela (feature 079), que entra como desempate.
-- Fora do painel "Por prioridade" (Lista em caixas, Kanban, painel "Por prazo") esta coluna é
-- ignorada de propósito — ordem manual global seria pedido novo.

alter table public.task
  add column if not exists sort_order integer not null default 0;

comment on column public.task.sort_order is
  'Ordem manual dentro da faixa de prioridade do quadrante de projeto (feature 082): asc, com o comparador da tela (079) como desempate. Toda tarefa nasce em 0; só o arraste no painel "Por prioridade" escreve aqui. Ignorada pela Lista, pelo Kanban e pelo painel "Por prazo".';
