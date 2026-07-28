-- Status Lendo / Abandonei + comentários durante a leitura.

-- Amplia check de status (nome default do Postgres: book_status_check).
alter table public.book drop constraint if exists book_status_check;
alter table public.book
  add constraint book_status_check
  check (status in ('to_read', 'reading', 'read', 'abandoned'));

-- Quem já tinha marca-página em "para ler" passa a "lendo".
update public.book
set status = 'reading'
where status = 'to_read'
  and current_page is not null
  and current_page > 0;

-- Comentários de leitura (página opcional + texto).
create table if not exists public.book_note (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_id text not null,
  page integer check (page is null or page >= 0),
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  foreign key (user_id, google_id)
    references public.book (user_id, google_id)
    on delete cascade
);

create index if not exists book_note_book_idx
  on public.book_note (user_id, google_id, created_at desc);

comment on table public.book_note is
  'Comentários durante a leitura (página opcional).';

alter table public.book_note enable row level security;

drop policy if exists book_note_select_own on public.book_note;
create policy book_note_select_own on public.book_note
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists book_note_insert_own on public.book_note;
create policy book_note_insert_own on public.book_note
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists book_note_update_own on public.book_note;
create policy book_note_update_own on public.book_note
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists book_note_delete_own on public.book_note;
create policy book_note_delete_own on public.book_note
  for delete to authenticated
  using (user_id = auth.uid());

-- Wipe de conta inclui book_note.
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

-- Gate Pro
do $$
begin
  if to_regclass('public.book_note') is null then
    return;
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'enforce_app_access'
  ) then
    raise notice 'enforce_app_access ausente — skip trigger book_note';
    return;
  end if;

  execute 'drop trigger if exists trg_enforce_app_access on public.book_note';
  execute $trig$
    create trigger trg_enforce_app_access
      before insert or update or delete on public.book_note
      for each row execute function public.enforce_app_access()
  $trig$;
end;
$$;
