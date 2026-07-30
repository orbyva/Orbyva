-- Favorito explícito (separado de nota e de would_recommend).
alter table public.movie
  add column if not exists is_favorite boolean not null default false;

alter table public.book
  add column if not exists is_favorite boolean not null default false;

alter table public.album
  add column if not exists is_favorite boolean not null default false;

comment on column public.movie.is_favorite is 'Favorito explícito do usuário (não derivado de nota)';
comment on column public.book.is_favorite is 'Favorito explícito do usuário (não derivado de nota)';
comment on column public.album.is_favorite is 'Favorito explícito do usuário (não derivado de nota)';
