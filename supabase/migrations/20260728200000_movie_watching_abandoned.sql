-- Status Assistindo / Abandonei no cinema (espelha livros).

alter table public.movie drop constraint if exists movie_status_check;
alter table public.movie
  add constraint movie_status_check
  check (status in ('to_watch', 'watching', 'watched', 'abandoned'));

-- Séries com episódio já marcado passam de "para assistir" → "assistindo".
update public.movie m
set status = 'watching'
where m.status = 'to_watch'
  and m.type = 'series'
  and exists (
    select 1
    from public.movie_episode e
    where e.user_id = m.user_id
      and e.imdb_id = m.imdb_id
      and e.status = 'watched'
  );
