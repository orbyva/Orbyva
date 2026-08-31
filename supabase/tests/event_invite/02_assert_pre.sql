\set ON_ERROR_STOP on

-- Estado ANTES das migrations. Sem isso, um `03_assert_schema` que passasse por acaso (porque o
-- schema já era assim) não provaria nada.
do $$
declare
  v_nullable text;
begin
  select is_nullable into v_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'project_event' and column_name = 'project_id';
  if v_nullable <> 'NO' then
    raise exception 'FALHOU: o seed deveria começar com project_event.project_id NOT NULL (veio %)', v_nullable;
  end if;

  if to_regclass('public.event_invite') is not null then
    raise exception 'FALHOU: event_invite não deveria existir antes da migration';
  end if;

  -- Controle: sem a migration, evento sem projeto é rejeitado pelo banco.
  begin
    insert into public.project_event (user_id, project_id, title, starts_at)
    values ('11111111-1111-1111-1111-111111111111', null, 'Sem projeto', now());
    raise exception 'FALHOU: project_id nulo deveria ser rejeitado antes da migration';
  exception
    when not_null_violation then null;
  end;

  raise notice 'OK: estado pré-migration conferido (project_id NOT NULL, sem event_invite)';
end $$;
