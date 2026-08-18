\set ON_ERROR_STOP on

-- Comportamento depois do drop. Tudo dentro de begin/rollback: o arquivo roda duas vezes (uma por
-- aplicação da migration) e não pode deixar resíduo entre as passagens.
begin;

-- ---- 1. a coluna morta é mesmo inalcançável ------------------------------------------------
do $$
begin
  begin
    execute 'select notes from public.project limit 1';
    raise exception 'FALHOU: select project.notes ainda responde depois do drop';
  exception
    when undefined_column then null;
  end;

  begin
    execute 'insert into public.project (user_id, name, notes) values
      (''11111111-1111-1111-1111-111111111111'', ''X'', ''y'')';
    raise exception 'FALHOU: insert escrevendo project.notes ainda é aceito';
  exception
    when undefined_column then null;
  end;
end $$;

-- ---- 2. o CRUD normal de projeto segue funcionando -------------------------------------------
do $$
declare
  n int;
  pid uuid;
begin
  insert into public.project (user_id, name, status)
  values ('11111111-1111-1111-1111-111111111111', 'Projeto novo', 'active')
  returning id into pid;

  perform 1 from public.project where id = pid and name = 'Projeto novo' and status = 'active';
  if not found then raise exception 'FALHOU: insert de projeto sem notes não persistiu'; end if;

  update public.project set status = 'completed' where id = pid;
  perform 1 from public.project where id = pid and status = 'completed';
  if not found then raise exception 'FALHOU: update de projeto depois do drop'; end if;

  -- o check de status da 006 continua valendo
  begin
    update public.project set status = 'inventado' where id = pid;
    raise exception 'FALHOU: project_status_check não barrou status inválido depois do drop';
  exception
    when check_violation then null;
  end;

  -- ---- 3. nota nova continua nascendo ligada ao projeto -------------------------------------
  insert into public.note (user_id, project_id, title, content)
  values ('11111111-1111-1111-1111-111111111111', pid, 'Notas do projeto novo', 'conteúdo');

  select count(*) into n from public.note where project_id = pid;
  if n <> 1 then raise exception 'FALHOU: nota vinculada ao projeto novo não foi criada'; end if;

  -- ---- 4. `on delete set null` da 055 continua de pé ---------------------------------------
  delete from public.project where id = pid;
  perform 1 from public.note where title = 'Notas do projeto novo' and project_id is null;
  if not found then
    raise exception 'FALHOU: apagar o projeto deveria preservar a nota com project_id nulo';
  end if;

  raise notice 'OK: CRUD de projeto, vínculo nota→projeto e on delete set null intactos';
end $$;

rollback;

-- ---- 5. RLS na prática, com o papel `authenticated` -------------------------------------------
-- O drop de coluna não pode afrouxar policy nenhuma; esta é a prova com JWT de usuário.
begin;

grant select, insert, update, delete on public.project to authenticated;
grant select on public.project_event to authenticated;
grant select on public.note to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare n int;
begin
  select count(*) into n from public.project;
  if n <> 4 then
    raise exception 'FALHOU (RLS): usuário A deveria ver 4 projetos próprios, viu %', n;
  end if;

  perform 1 from public.project where user_id = '22222222-2222-2222-2222-222222222222';
  if found then raise exception 'FALHOU (RLS): usuário A enxergou projeto alheio'; end if;

  select count(*) into n from public.note;
  if n <> 2 then
    raise exception 'FALHOU (RLS): usuário A deveria ver 2 notas migradas próprias, viu %', n;
  end if;

  select count(*) into n from public.project_event;
  if n <> 1 then
    raise exception 'FALHOU (RLS): usuário A deveria ver 1 evento próprio, viu %', n;
  end if;

  update public.project set name = 'hackeado'
   where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU (RLS update): alcançou % projeto(s) alheio(s)', n; end if;

  begin
    insert into public.project (user_id, name)
    values ('22222222-2222-2222-2222-222222222222', 'Roubado');
    raise exception 'FALHOU (RLS insert): projeto com user_id alheio foi aceito';
  exception
    when insufficient_privilege then null;
  end;

  raise notice 'OK: RLS de project/project_event/note segue barrando o alheio depois do drop';
end $$;

rollback;
