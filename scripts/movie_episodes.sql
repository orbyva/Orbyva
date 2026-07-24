-- Episódios de séries + preferências de acompanhamento.
-- Rode no SQL Editor do Supabase (após tenancy_rls / movies_opinion).

-- ── Colunas em movie (séries) ───────────────────────────────────────────────
alter table public.movie
  add column if not exists tmdb_tv_id int,
  add column if not exists notify_new_episodes boolean not null default false,
  add column if not exists following boolean not null default true;

comment on column public.movie.tmdb_tv_id is 'ID TMDB da série (tv), quando conhecido';
comment on column public.movie.notify_new_episodes is 'Avisar quando sair episódio/temporada nova';
comment on column public.movie.following is 'Acompanhar a série na lista';

-- ── Progresso por episódio ──────────────────────────────────────────────────
create table if not exists public.movie_episode (
  user_id uuid not null references auth.users (id) on delete cascade,
  imdb_id text not null,
  season_number int not null check (season_number >= 0),
  episode_number int not null check (episode_number >= 1),
  tmdb_episode_id int,
  episode_name text,
  air_date date,
  status text not null default 'unwatched'
    check (status in ('unwatched', 'watched', 'skipped')),
  watched_at date,
  rating numeric(3, 1)
    check (rating is null or (rating >= 0 and rating <= 10)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, imdb_id, season_number, episode_number),
  foreign key (user_id, imdb_id)
    references public.movie (user_id, imdb_id)
    on delete cascade
);

create index if not exists movie_episode_user_series_idx
  on public.movie_episode (user_id, imdb_id, season_number, episode_number);

alter table public.movie_episode enable row level security;

drop policy if exists movie_episode_select_own on public.movie_episode;
drop policy if exists movie_episode_insert_own on public.movie_episode;
drop policy if exists movie_episode_update_own on public.movie_episode;
drop policy if exists movie_episode_delete_own on public.movie_episode;

create policy movie_episode_select_own on public.movie_episode
  for select to authenticated
  using (user_id = auth.uid());

create policy movie_episode_insert_own on public.movie_episode
  for insert to authenticated
  with check (user_id = auth.uid());

create policy movie_episode_update_own on public.movie_episode
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy movie_episode_delete_own on public.movie_episode
  for delete to authenticated
  using (user_id = auth.uid());
