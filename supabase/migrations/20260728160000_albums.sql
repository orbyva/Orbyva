-- Módulo Música — álbuns/EPs (MusicBrainz release-group + cadastro manual).

create table if not exists public.album (
  user_id uuid not null references auth.users(id) on delete cascade,
  musicbrainz_id text not null,
  title text not null,
  artists text[] not null default '{}',
  release_year integer,
  album_type text not null default 'album'
    check (album_type in ('album', 'ep', 'single', 'compilation', 'other')),
  cover_url text,
  source text not null default 'musicbrainz'
    check (source in ('musicbrainz', 'manual')),
  status text not null default 'to_listen'
    check (status in ('to_listen', 'listened')),
  rating numeric(3, 1),
  notes text,
  would_recommend boolean not null default true,
  listened_dates date[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, musicbrainz_id)
);

create index if not exists album_user_status_idx
  on public.album (user_id, status);

comment on table public.album is
  'Álbuns/EPs do usuário — Para ouvir / Ouvidos (MusicBrainz release-group ou manual_*).';

alter table public.album enable row level security;

drop policy if exists album_select_own on public.album;
create policy album_select_own on public.album
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists album_insert_own on public.album;
create policy album_insert_own on public.album
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists album_update_own on public.album;
create policy album_update_own on public.album
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists album_delete_own on public.album;
create policy album_delete_own on public.album
  for delete to authenticated
  using (user_id = auth.uid());

-- Capas manuais (upload).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'album-covers',
  'album-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists album_covers_public_read on storage.objects;
create policy album_covers_public_read on storage.objects
  for select to public
  using (bucket_id = 'album-covers');

drop policy if exists album_covers_insert_own on storage.objects;
create policy album_covers_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'album-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists album_covers_update_own on storage.objects;
create policy album_covers_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'album-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'album-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists album_covers_delete_own on storage.objects;
create policy album_covers_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'album-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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

do $$
begin
  if to_regclass('public.album') is null then
    return;
  end if;
  if not exists (
    select 1 from pg_proc where proname = 'enforce_app_access'
  ) then
    raise notice 'enforce_app_access ausente — skip trigger album';
    return;
  end if;

  execute 'drop trigger if exists trg_enforce_app_access on public.album';
  execute $trig$
    create trigger trg_enforce_app_access
      before insert or update or delete on public.album
      for each row execute function public.enforce_app_access()
  $trig$;
end;
$$;
