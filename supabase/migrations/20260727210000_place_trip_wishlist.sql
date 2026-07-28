-- Visitar depois (lugares) — espelho de "Para assistir" nos filmes.

alter table public.place_visit
  add column if not exists status text;

update public.place_visit
set status = 'visited'
where status is null;

alter table public.place_visit
  alter column status set default 'visited';

alter table public.place_visit
  alter column status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'place_visit_status_check'
  ) then
    alter table public.place_visit
      add constraint place_visit_status_check
      check (status in ('to_visit', 'visited'));
  end if;
end $$;

-- Wishlist de lugares: sem data de visita ainda.
alter table public.place_visit
  alter column visited_date drop not null;

comment on column public.place_visit.status is
  'to_visit = para visitar; visited = já visitado/avaliado.';
