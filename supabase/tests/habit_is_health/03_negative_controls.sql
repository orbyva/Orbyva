\set ON_ERROR_STOP on

-- Controles negativos: sabotam o banco de propósito e exigem que a assertiva correspondente de
-- `02_assert_schema.sql` **falhe**. Sem isto, um teste que só faz `select` de coisas que já são
-- verdade passa mesmo se a migration não fizer nada — é o que prova que 02 realmente testa.
--
-- Cada sabotagem roda dentro de um sub-bloco plpgsql que termina em exceção: a exceção desfaz o
-- DDL/DML do sub-bloco (savepoint implícito), então o banco volta ao estado real depois de cada
-- controle — e o bloco final reconfirma isso.

-- ---- 1. coluna ausente: a assertiva da coluna tem que acusar --------------------------------
do $$
begin
  begin
    alter table public.habit drop column is_health;
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='habit' and column_name='is_health'
       and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
    if not found then
      raise exception 'CONTROLE OK';
    end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria mesmo sem a coluna is_health';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 2. coluna nullable: `not null default false` tem que ser exigido de verdade -------------
do $$
begin
  begin
    alter table public.habit alter column is_health drop not null;
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='habit' and column_name='is_health'
       and data_type='boolean' and is_nullable='NO' and column_default like '%false%';
    if not found then
      raise exception 'CONTROLE OK';
    end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 aceitaria is_health nullable';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 3. hábito antigo virando de saúde: a assertiva do default tem que acusar ----------------
do $$
declare n int;
begin
  begin
    update public.habit set is_health = true
     where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    select count(*) into n from public.habit where is_health is distinct from false;
    if n <> 0 then
      raise exception 'CONTROLE OK';
    end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 não veria hábito antigo com is_health = true';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 4. comentário apagado: a assertiva de documentação tem que acusar -----------------------
do $$
begin
  begin
    comment on column public.habit.is_health is null;
    if coalesce(col_description('public.habit'::regclass,
         (select ordinal_position from information_schema.columns
           where table_schema='public' and table_name='habit' and column_name='is_health')::int), '') = '' then
      raise exception 'CONTROLE OK';
    end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria sem comment on column';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 5. índice removido: a assertiva do índice parcial tem que acusar ------------------------
do $$
begin
  begin
    drop index public.habit_user_health_idx;
    perform 1 from pg_indexes
     where schemaname='public' and tablename='habit' and indexname='habit_user_health_idx';
    if not found then
      raise exception 'CONTROLE OK';
    end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria sem o índice habit_user_health_idx';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 6. RLS desligada: a assertiva de RLS tem que acusar -------------------------------------
do $$
begin
  begin
    alter table public.habit disable row level security;
    perform 1 from pg_class where oid='public.habit'::regclass and relrowsecurity;
    if not found then
      raise exception 'CONTROLE OK';
    end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com a RLS de habit desligada';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- estado real restaurado depois das sabotagens --------------------------------------------
do $$
declare n int;
begin
  perform 1 from information_schema.columns
   where table_schema='public' and table_name='habit' and column_name='is_health'
     and is_nullable='NO';
  if not found then
    raise exception 'FALHOU: um controle negativo deixou o banco sabotado (coluna is_health)';
  end if;

  select count(*) into n from public.habit where is_health;
  if n <> 0 then
    raise exception 'FALHOU: um controle negativo deixou % hábito(s) marcados como de saúde', n;
  end if;

  perform 1 from pg_indexes
   where schemaname='public' and tablename='habit' and indexname='habit_user_health_idx';
  if not found then raise exception 'FALHOU: controle negativo deixou o índice removido'; end if;

  perform 1 from pg_class where oid='public.habit'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: controle negativo deixou a RLS desligada'; end if;

  if coalesce(col_description('public.habit'::regclass,
       (select ordinal_position from information_schema.columns
         where table_schema='public' and table_name='habit' and column_name='is_health')::int), '') = '' then
    raise exception 'FALHOU: controle negativo deixou o comment apagado';
  end if;

  raise notice 'OK: 6 controles negativos acusaram a sabotagem e o estado real foi restaurado';
end $$;
