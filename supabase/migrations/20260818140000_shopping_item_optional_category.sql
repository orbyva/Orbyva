-- Lista de Compras (feature 050, reabertura 2026-08-18): item de compras passa a existir sem
-- categoria. A categoria é uma classificação que só faz sentido depois que a lista existe —
-- obrigá-la antes de anotar "pilha AA" transforma um gesto de 3 segundos num cadastro de duas
-- telas.
--
-- O FK e o `on delete cascade` ficam exatamente como estão: apagar uma categoria segue apagando
-- os itens dela (é decisão da própria 050 e o pedido não a toca). "Sem categoria" é um grupo
-- sintético na renderização (`groupItemsByCategory`), nunca uma linha em `shopping_category`.

alter table public.shopping_item
  alter column shopping_category_id drop not null;

comment on column public.shopping_item.shopping_category_id is
  'Categoria do item. Nulo = "sem categoria": item legítimo, anotado antes de o usuário criar '
  'qualquer categoria, renderizado num grupo sintético no fim da lista. Quando preenchido, o '
  'on delete cascade continua valendo — apagar a categoria apaga os itens dela.';
