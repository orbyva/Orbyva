\set ON_ERROR_STOP on

-- Controles negativos: sabotam o banco de propósito e exigem que a assertiva correspondente de
-- `02_assert_schema.sql` **acuse**. Sem isto, um harness que só confere coisas já verdadeiras
-- passaria mesmo se a migration não fizesse nada — este é o argumento de que 02 testa de verdade.
--
-- Cada sabotagem roda num sub-bloco que termina em exceção: a exceção desfaz o DDL/DML do
-- sub-bloco (savepoint implícito), então o banco volta ao estado real depois de cada controle.

-- ---- 1. a coluna `notes` de volta: a assertiva do drop tem que acusar -------------------------
do $$
begin
  begin
    alter table public.project add column notes text;
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='project' and column_name='notes';
    if found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com project.notes ainda existindo';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 2. `project_event` arrastada junto (o erro clássico da migration da 006) -----------------
do $$
begin
  begin
    drop table public.project_event cascade;
    if to_regclass('public.project_event') is null then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria sem a tabela project_event';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 3. uma nota migrada perdida --------------------------------------------------------------
do $$
declare n int;
begin
  begin
    delete from public.note where project_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    select count(*) into n from public.note where title = 'Notas do projeto';
    if n <> (select copied_notes from public.__after_copy) then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com uma nota migrada a menos';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 4. conteúdo de nota migrada alterado ------------------------------------------------------
do $$
declare txt text;
begin
  begin
    update public.note set content = 'mexido' where title = 'Notas do projeto';
    select md5(string_agg(coalesce(project_id::text, '<null>') || '|' || user_id::text || '|' || content,
                          '#' order by id))
      into txt from public.note;
    if txt is distinct from (select note_digest from public.__after_copy) then
      raise exception 'CONTROLE OK';
    end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com o conteúdo das notas alterado';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 5. policy de `project` perdida ------------------------------------------------------------
do $$
declare n int;
begin
  begin
    drop policy project_all_own on public.project;
    select count(*) into n from pg_policies where schemaname='public' and tablename='project';
    if n <> 2 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com 1 policy em project';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 6. o banco voltou ao estado real depois das sabotagens -----------------------------------
do $$
declare n int;
begin
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='project' and column_name='notes';
  if found then raise exception 'FALHOU: o controle 1 deixou project.notes de volta'; end if;

  if to_regclass('public.project_event') is null then
    raise exception 'FALHOU: o controle 2 deixou project_event apagada';
  end if;

  select count(*) into n from public.note;
  if n <> 3 then raise exception 'FALHOU: os controles 3/4 deixaram resíduo em note (% linhas)', n; end if;

  select count(*) into n from pg_policies where schemaname='public' and tablename='project';
  if n <> 2 then raise exception 'FALHOU: o controle 5 deixou project com % policies', n; end if;

  raise notice 'OK: 5 controles negativos acusaram, e o banco voltou ao estado real';
end $$;
