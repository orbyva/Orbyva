-- Lista de Compras — categoria deixa de ser obrigatória no item (feature 066).
-- Anotar "pilha AA" não pode exigir inventar uma categoria antes: a captura rápida é o fluxo mais
-- frequente da lista. `null` passa a significar "item solto, ainda sem categoria" — ausência de
-- categoria é escrita como ausência, não como uma categoria-fantasma no banco.
--
-- O `on delete cascade` da FK continua como está (decisão da 050): excluir a categoria segue
-- apagando os itens dela, com aviso de quantos no diálogo de confirmação.

alter table public.shopping_item
  alter column shopping_category_id drop not null;

comment on column public.shopping_item.shopping_category_id is
  'Categoria do item — nulo = item solto, ainda sem categoria (feature 066). Item solto aparece '
  'no pseudo-grupo "Sem categoria" da lista e, por não ter categoria, não pertence a projeto '
  'nenhum (o vínculo com projeto é da categoria — feature 052).';
