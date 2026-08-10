-- Ao excluir a viagem, remove lugares vinculados (para visitar / visitados).
-- Antes o FK costumava SET NULL e os lugares sobravam na lista global.

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where n.nspname = 'public'
      and t.relname = 'place_visit'
      and c.contype = 'f'
      and a.attname = 'trip_id'
  loop
    execute format(
      'alter table public.place_visit drop constraint %I',
      r.conname
    );
  end loop;
end $$;

alter table public.place_visit
  add constraint place_visit_trip_id_fkey
  foreign key (trip_id)
  references public.trip (id)
  on delete cascade;

comment on constraint place_visit_trip_id_fkey on public.place_visit is
  'Lugares da viagem somem com a viagem (inclui Para visitar).';
