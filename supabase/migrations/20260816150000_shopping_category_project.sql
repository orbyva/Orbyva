-- Categoria da Lista de Compras vinculada a um Projeto (feature 052): o usuário marca uma
-- categoria como pertencente a um projeto ("obra da casa") e passa a ver os itens daquele
-- projeto, ainda agrupados por categoria. O vínculo é da categoria, nunca do item — o item
-- herda o projeto pela categoria em que está.
--
-- `on delete set null` (e não cascade, como em 20260805130000_task_project_delete_set_null.sql):
-- apagar o projeto não pode apagar a lista de compras dele; a categoria só deixa de estar
-- vinculada e volta a aparecer entre as categorias sem projeto.

alter table public.shopping_category
  add column if not exists project_id uuid
    references public.project(id) on delete set null;

create index if not exists shopping_category_project_idx
  on public.shopping_category (project_id);

comment on column public.shopping_category.project_id is
  'Projeto ao qual a categoria pertence (opcional). Nulo = categoria comum da casa, que não '
  'aparece em filtro de projeto nenhum. Excluir o projeto apenas zera esta coluna '
  '(on delete set null) — a categoria e seus itens continuam existindo.';
