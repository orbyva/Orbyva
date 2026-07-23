-- Opinião em filmes (notes + recomendação).
-- Rode no SQL Editor do Supabase.

alter table public.movie
  add column if not exists notes text,
  add column if not exists would_recommend boolean not null default true;

comment on column public.movie.notes is 'Opinião / comentário do usuário sobre o título';
comment on column public.movie.would_recommend is 'Se o usuário recomendaria o título';
