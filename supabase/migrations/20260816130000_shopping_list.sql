-- Módulo Lista de Compras — núcleo (feature 050): categorias criadas pelo usuário agrupando
-- itens a comprar. RLS estritamente por user_id, sem soft-delete.

create table if not exists public.shopping_category (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_category_user_idx
  on public.shopping_category (user_id);

comment on table public.shopping_category is
  'Categorias da Lista de Compras — agrupam os itens a serem comprados; excluir a categoria '
  'apaga seus itens em cascata.';

alter table public.shopping_category enable row level security;

drop policy if exists shopping_category_select_own on public.shopping_category;
create policy shopping_category_select_own on public.shopping_category
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists shopping_category_insert_own on public.shopping_category;
create policy shopping_category_insert_own on public.shopping_category
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists shopping_category_update_own on public.shopping_category;
create policy shopping_category_update_own on public.shopping_category
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists shopping_category_delete_own on public.shopping_category;
create policy shopping_category_delete_own on public.shopping_category
  for delete to authenticated
  using (user_id = auth.uid());

create table if not exists public.shopping_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  shopping_category_id uuid not null
    references public.shopping_category(id) on delete cascade,
  title text not null,
  description text,
  quantity numeric,
  unit text,
  provider_link text,
  status text not null default 'pending'
    check (status in ('pending', 'purchased')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_item_user_status_idx
  on public.shopping_item (user_id, status);
create index if not exists shopping_item_category_idx
  on public.shopping_item (shopping_category_id);

comment on table public.shopping_item is
  'Itens da Lista de Compras — sempre dentro de uma categoria; status pending|purchased '
  '(item comprado continua na lista, riscado); provider_link guarda a URL do produto no fornecedor.';

alter table public.shopping_item enable row level security;

drop policy if exists shopping_item_select_own on public.shopping_item;
create policy shopping_item_select_own on public.shopping_item
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists shopping_item_insert_own on public.shopping_item;
create policy shopping_item_insert_own on public.shopping_item
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists shopping_item_update_own on public.shopping_item;
create policy shopping_item_update_own on public.shopping_item
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists shopping_item_delete_own on public.shopping_item;
create policy shopping_item_delete_own on public.shopping_item
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui as novas tabelas no wipe de conta (lista mais recente de wipe_own_data,
-- copiada de 20260809200000_content_link.sql + lista de compras).
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
    'project_event',
    'project',
    'tag',
    'content_link',
    'shopping_item',
    'shopping_category'
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
    raise notice 'enforce_app_access ausente — skip triggers shopping list';
    return;
  end if;

  foreach t in array array['shopping_category', 'shopping_item']
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
