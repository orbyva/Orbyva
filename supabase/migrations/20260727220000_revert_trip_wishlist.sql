-- Remove wishlist de viagens (ficou só Para visitar nos lugares).

update public.trip
set
  start_date = coalesce(start_date, (current_date)::date),
  end_date = coalesce(end_date, (current_date)::date)
where start_date is null or end_date is null;

update public.trip
set status = 'planning'
where status = 'wishlist';

alter table public.trip
  alter column start_date set not null;

alter table public.trip
  alter column end_date set not null;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'trip'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.trip drop constraint %I', r.conname);
  end loop;

  alter table public.trip
    add constraint trip_status_check
    check (
      status in (
        'planning',
        'upcoming',
        'ongoing',
        'completed',
        'cancelled'
      )
    );
exception
  when duplicate_object then null;
end $$;
