\set ON_ERROR_STOP on

-- Controles negativos: sabotam o banco de propósito e exigem que a assertiva correspondente de
-- `02_assert_schema.sql` **falhe**. Sem isto, um teste que só faz `select` de coisas que já são
-- verdade passaria mesmo se a migration não fizesse nada — é o que prova que 02 realmente testa.
--
-- Cada sabotagem roda dentro de um sub-bloco plpgsql que termina em exceção: a exceção desfaz o
-- DDL/DML do sub-bloco (savepoint implícito), então o banco volta ao estado real depois de cada
-- controle — e o bloco final reconfirma isso.

-- ---- 1. check de metric_type removido: a assertiva do check tem que acusar -------------------
do $$
begin
  begin
    alter table public.health_metric drop constraint health_metric_type_check;
    begin
      insert into public.health_metric (user_id, metric_type, value, recorded_date) values
        ('11111111-1111-1111-1111-111111111111', 'imc', 24, '2026-08-17');
      -- Entrou tipo inventado: é exatamente o que 02 acusaria.
      raise exception 'CONTROLE OK';
    exception when check_violation then
      raise exception 'CONTROLE NEGATIVO FALHOU: check ainda barrou depois de removido';
    end;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 2. índice removido: a assertiva do índice tem que acusar ---------------------------------
do $$
begin
  begin
    drop index public.health_metric_user_type_date_idx;
    perform 1 from pg_indexes
     where schemaname='public' and tablename='health_metric'
       and indexname='health_metric_user_type_date_idx';
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria sem o índice health_metric_user_type_date_idx';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 3. uma policy a menos: a contagem de 4 tem que acusar ------------------------------------
do $$
declare n int;
begin
  begin
    drop policy health_metric_delete_own on public.health_metric;
    select count(*) into n from pg_policies
     where schemaname='public' and tablename='health_metric';
    if n <> 4 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com 3 policies em health_metric';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 4. policy sem auth.uid(): a assertiva de escopo tem que acusar ---------------------------
-- O erro mais perigoso desta feature não é policy ausente, é policy **frouxa**: `using (true)`
-- deixa a tabela aberta com a RLS ligada e as 4 policies no lugar.
do $$
declare n int;
begin
  begin
    drop policy health_metric_select_own on public.health_metric;
    create policy health_metric_select_own on public.health_metric
      for select to authenticated using (true);
    select count(*) into n from pg_policies
     where schemaname='public' and tablename='health_metric'
       and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
    if n <> 4 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 aceitaria uma policy using (true) em dado de saúde';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 5. RLS desligada: a assertiva de RLS tem que acusar --------------------------------------
do $$
begin
  begin
    alter table public.health_metric disable row level security;
    perform 1 from pg_class where oid='public.health_metric'::regclass and relrowsecurity;
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com a RLS de health_metric desligada';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 6. wipe_own_data sem a tabela: a assertiva do wipe tem que acusar ------------------------
do $$
begin
  begin
    create or replace function public.wipe_own_data()
    returns void language plpgsql security definer set search_path = public
    as $f$ begin perform 1; end; $f$;
    perform 1 from pg_proc where proname='wipe_own_data' and prosrc like '%health_metric%';
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com wipe_own_data sem health_metric';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 7. trigger do gate Pro removido ----------------------------------------------------------
do $$
begin
  begin
    drop trigger trg_enforce_app_access on public.health_metric;
    perform 1 from pg_trigger t
     where t.tgrelid='public.health_metric'::regclass and t.tgname='trg_enforce_app_access'
       and not t.tgisinternal;
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria sem o trigger do gate Pro';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- estado real restaurado depois das sabotagens ---------------------------------------------
do $$
declare n int;
begin
  perform 1 from pg_constraint
   where conrelid='public.health_metric'::regclass and conname='health_metric_type_check';
  if not found then raise exception 'FALHOU: controle negativo deixou o check removido'; end if;

  perform 1 from pg_indexes
   where schemaname='public' and tablename='health_metric'
     and indexname='health_metric_user_type_date_idx';
  if not found then raise exception 'FALHOU: controle negativo deixou o índice removido'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='health_metric'
     and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
  if n <> 4 then raise exception 'FALHOU: controle negativo deixou % policy(s) por user_id', n; end if;

  perform 1 from pg_class where oid='public.health_metric'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: controle negativo deixou a RLS desligada'; end if;

  perform 1 from pg_proc where proname='wipe_own_data' and prosrc like '%health_metric%';
  if not found then raise exception 'FALHOU: controle negativo deixou wipe_own_data sem a tabela'; end if;

  select count(*) into n from public.health_metric;
  if n <> 0 then raise exception 'FALHOU: controle negativo deixou % linha(s) na tabela', n; end if;

  raise notice 'OK: 7 controles negativos acusaram a sabotagem e o estado real foi restaurado';
end $$;
