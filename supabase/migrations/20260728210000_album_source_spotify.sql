-- Catálogo Spotify (além de MusicBrainz / manual).

alter table public.album drop constraint if exists album_source_check;
alter table public.album
  add constraint album_source_check
  check (source in ('spotify', 'musicbrainz', 'manual'));

comment on column public.album.musicbrainz_id is
  'ID opaco do catálogo: Spotify album id | MusicBrainz release-group id | manual_*';

comment on column public.album.source is
  'Provedor: spotify (preferido), musicbrainz (fallback) ou manual';
