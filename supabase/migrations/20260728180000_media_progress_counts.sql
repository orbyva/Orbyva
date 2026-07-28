alter table public.movie
  add column if not exists episode_count integer
    check (episode_count is null or episode_count >= 0);

comment on column public.movie.episode_count is
  'Total de episódios da série (TMDB); usado na barra de progresso.';
