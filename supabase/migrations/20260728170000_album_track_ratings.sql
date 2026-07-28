-- Notas por faixa no álbum (MusicBrainz tracklist).
-- Chave: "{disc}:{position}" → nota 0–10.

alter table public.album
  add column if not exists track_ratings jsonb not null default '{}'::jsonb;

comment on column public.album.track_ratings is
  'Notas por faixa: mapa disc:position → rating (0–10).';
