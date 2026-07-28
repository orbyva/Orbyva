-- Módulo Livros — catálogo pessoal (espelho do Cinema).

create table if not exists public.book (
  user_id uuid not null references auth.users(id) on delete cascade,
  google_id text not null,
  title text not null,
  authors text[] not null default '{}',
  published_year integer,
  cover_url text,
  categories text[] not null default '{}',
  description text,
  page_count integer,
  publisher text,
  isbn13 text,
  status text not null default 'to_read'
    check (status in ('to_read', 'read')),
  rating numeric(3, 1),
  notes text,
  would_recommend boolean not null default true,
  read_dates date[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, google_id)
);

create index if not exists book_user_status_idx
  on public.book (user_id, status);

comment on table public.book is
  'Livros do usuário — Para ler / Lidos (Google Books volume id).';

alter table public.book enable row level security;

drop policy if exists book_select_own on public.book;
create policy book_select_own on public.book
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists book_insert_own on public.book;
create policy book_insert_own on public.book
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists book_update_own on public.book;
create policy book_update_own on public.book
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists book_delete_own on public.book;
create policy book_delete_own on public.book
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui book no wipe de conta (lista mais recente de wipe_own_data).
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
    'book',
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

-- Gate de acesso Pro (mesmo padrão das demais tabelas do app).
do $$
begin
  if to_regclass('public.book') is null then
    return;
  end if;
  if to_regclass('public.enforce_app_access') is null
     and not exists (
       select 1 from pg_proc where proname = 'enforce_app_access'
     ) then
    raise notice 'enforce_app_access ausente — skip trigger book';
    return;
  end if;

  execute 'drop trigger if exists trg_enforce_app_access on public.book';
  execute $trig$
    create trigger trg_enforce_app_access
      before insert or update or delete on public.book
      for each row execute function public.enforce_app_access()
  $trig$;
end;
$$;
