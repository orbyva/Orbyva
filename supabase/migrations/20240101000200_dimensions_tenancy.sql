-- =============================================================================
-- Orbyva — Dimensões por usuário (type / class)
-- Corrige vazamento: tipos e classes eram catálogo compartilhado.
-- Nature (Receita/Despesa) continua global.
-- =============================================================================

alter table public.type
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.class
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- Backfill: classes usadas em transações herdam o dono da 1ª tx
update public.class c
set user_id = sub.user_id
from (
  select distinct on (class_id) class_id, user_id
  from public.transaction
  where user_id is not null
  order by class_id, id
) sub
where c.id = sub.class_id
  and c.user_id is null;

-- Tipos herdam de suas classes
update public.type t
set user_id = sub.user_id
from (
  select distinct on (type_id) type_id, user_id
  from public.class
  where user_id is not null
  order by type_id, id
) sub
where t.id = sub.type_id
  and t.user_id is null;

-- Restante órfão → usuário mais antigo (dono histórico do app)
update public.type
set user_id = (select id from auth.users order by created_at asc limit 1)
where user_id is null
  and exists (select 1 from auth.users);

update public.class
set user_id = (select id from auth.users order by created_at asc limit 1)
where user_id is null
  and exists (select 1 from auth.users);

alter table public.type alter column user_id set not null;
alter table public.class alter column user_id set not null;

create index if not exists type_user_id_idx on public.type (user_id);
create index if not exists class_user_id_idx on public.class (user_id);

-- RLS: troca política aberta por dono (+ leitura se já usou em tx própria)
alter table public.type enable row level security;
alter table public.class enable row level security;

drop policy if exists type_auth_all on public.type;
drop policy if exists class_auth_all on public.class;
drop policy if exists type_select_own on public.type;
drop policy if exists type_insert_own on public.type;
drop policy if exists type_update_own on public.type;
drop policy if exists type_delete_own on public.type;
drop policy if exists class_select_own on public.class;
drop policy if exists class_insert_own on public.class;
drop policy if exists class_update_own on public.class;
drop policy if exists class_delete_own on public.class;

create policy type_select_own on public.type
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.class c
      join public.transaction t on t.class_id = c.id
      where c.type_id = type.id
        and t.user_id = auth.uid()
    )
  );

create policy type_insert_own on public.type
  for insert to authenticated
  with check (user_id = auth.uid());

create policy type_update_own on public.type
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy type_delete_own on public.type
  for delete to authenticated
  using (user_id = auth.uid());

create policy class_select_own on public.class
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.transaction t
      where t.class_id = class.id
        and t.user_id = auth.uid()
    )
  );

create policy class_insert_own on public.class
  for insert to authenticated
  with check (user_id = auth.uid());

create policy class_update_own on public.class
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy class_delete_own on public.class
  for delete to authenticated
  using (user_id = auth.uid());

-- Nature: só leitura para autenticados (Receita/Despesa compartilhadas)
alter table public.nature enable row level security;
drop policy if exists nature_auth_all on public.nature;
drop policy if exists nature_select_auth on public.nature;
create policy nature_select_auth on public.nature
  for select to authenticated
  using (true);

-- Atualiza wipe para apagar dimensões do usuário
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
    'personal_goal',
    'habit',
    'place_visit',
    'trip',
    'vehicle',
    'class',
    'type'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;

-- =============================================================================
-- Depois de rodar: Conta → Refazer tour para semear tipos/classes se a lista
-- ficar vazia.
-- =============================================================================
