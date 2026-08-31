\set ON_ERROR_STOP on

-- Controles negativos: sabotam o banco de propósito e exigem que a assertiva correspondente de
-- `02_assert_schema.sql` / `04_assert_backfill.sql` **falhe**. Sem isto, um teste que só faz
-- `select` de coisas que já são verdade passaria mesmo se a migration não fizesse nada — é o que
-- prova que 02 e 04 realmente testam.
--
-- Cada sabotagem roda dentro de um sub-bloco plpgsql que termina em exceção: a exceção desfaz o
-- DDL/DML do sub-bloco (savepoint implícito), então o banco volta ao estado real depois de cada
-- controle — e o bloco final reconfirma isso.

-- ---- 1. check de `times` removido: a assertiva do check tem que acusar ------------------------
do $$
begin
  begin
    alter table public.medication drop constraint medication_times_check;
    begin
      insert into public.medication (user_id, name, times, started_on) values
        ('11111111-1111-1111-1111-111111111111', 'Vazia', array[]::time[], '2026-08-17');
      raise exception 'CONTROLE OK';
    exception when check_violation then
      raise exception 'CONTROLE NEGATIVO FALHOU: check ainda barrou times vazio depois de removido';
    end;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 2. índice removido -----------------------------------------------------------------------
do $$
begin
  begin
    drop index public.medication_user_active_idx;
    perform 1 from pg_indexes
     where schemaname='public' and tablename='medication'
       and indexname='medication_user_active_idx';
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria sem o índice medication_user_active_idx';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 3. uma policy a menos --------------------------------------------------------------------
do $$
declare n int;
begin
  begin
    drop policy medication_delete_own on public.medication;
    select count(*) into n from pg_policies
     where schemaname='public' and tablename='medication';
    if n <> 4 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com 3 policies em medication';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 4. policy sem auth.uid() -----------------------------------------------------------------
-- O erro mais perigoso não é policy ausente, é policy **frouxa**: `using (true)` deixa a tabela
-- aberta com a RLS ligada e as 4 policies no lugar.
do $$
declare n int;
begin
  begin
    drop policy medication_select_own on public.medication;
    create policy medication_select_own on public.medication
      for select to authenticated using (true);
    select count(*) into n from pg_policies
     where schemaname='public' and tablename='medication'
       and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
    if n <> 4 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 aceitaria uma policy using (true) em dado de saúde';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 5. RLS desligada -------------------------------------------------------------------------
do $$
begin
  begin
    alter table public.medication disable row level security;
    perform 1 from pg_class where oid='public.medication'::regclass and relrowsecurity;
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com a RLS de medication desligada';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 6. wipe_own_data sem a tabela ------------------------------------------------------------
do $$
begin
  begin
    create or replace function public.wipe_own_data()
    returns void language plpgsql security definer set search_path = public
    as $f$ begin perform 1; end; $f$;
    perform 1 from pg_proc where proname='wipe_own_data' and prosrc like '%medication%';
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria com wipe_own_data sem medication';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 7. wipe_own_data com medication ANTES de task: a ordem de FK tem que acusar ---------------
do $$
declare src text; pos_task int; pos_med int;
begin
  begin
    create or replace function public.wipe_own_data()
    returns void language plpgsql security definer set search_path = public
    as $f$ declare t text; begin
      foreach t in array array['medication', 'task'] loop perform t; end loop;
    end; $f$;
    select prosrc into src from pg_proc where proname='wipe_own_data';
    pos_task := position(E'\'task\'' in src);
    pos_med  := position(E'\'medication\'' in src);
    if pos_task > pos_med then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 aceitaria medication sendo apagada antes de task';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 8. trigger do gate Pro removido ----------------------------------------------------------
do $$
begin
  begin
    drop trigger trg_enforce_app_access on public.medication;
    perform 1 from pg_trigger t
     where t.tgrelid='public.medication'::regclass and t.tgname='trg_enforce_app_access'
       and not t.tgisinternal;
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria sem o trigger do gate Pro';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 9. medication_id removido de task --------------------------------------------------------
do $$
begin
  begin
    alter table public.task drop column medication_id;
    perform 1 from information_schema.columns
     where table_schema='public' and table_name='task' and column_name='medication_id';
    if not found then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 02 passaria sem task.medication_id';
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 10. duplicata simulada: a assertiva de idempotência de 04 tem que acusar ------------------
-- ESTE é o controle que importa mais nesta feature. As contagens de 04 só provam idempotência se
-- forem capazes de acusar uma duplicata — aqui uma é criada à mão e o teste exige que os números
-- de 04 mudem.
do $$
declare n int; dup int;
begin
  begin
    insert into public.medication (user_id, name, times, interval_days, started_on)
    select user_id, name, times, interval_days, started_on
      from public.medication where name = 'Losartana';

    select count(*) into n from public.medication;
    select count(*) into dup from (
      select user_id, name from public.medication group by user_id, name having count(*) > 1
    ) d;

    -- As duas assertivas de 04 que pegariam a não-idempotência: total de tratamentos e (user, name)
    -- duplicado. Se qualquer uma passasse batido com uma duplicata no banco, 04 seria decorativo.
    if n <> 3 and dup > 0 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: 04 não acusaria um tratamento duplicado (total %, dups %)', n, dup;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- 11. backfill "sem guard": simula o que aconteceria sem `medication_id is null` ------------
-- Reproduz a mesma insert do backfill **sem** o filtro de idempotência e exige que ela duplique —
-- é o que prova que o guard é o que segura a segunda execução, e não sorte do conjunto de dados.
do $$
declare n int;
begin
  begin
    insert into public.medication (user_id, name, times, interval_days, started_on)
    select t.user_id,
           t.title,
           array[coalesce(nullif(t.recurrence_rule ->> 'time', '')::time, t.due_time, time '08:00')],
           greatest(1, coalesce((t.recurrence_rule ->> 'interval')::int, 1)),
           t.due_date
      from public.task t
     where t.is_medication = true
       and t.recurrence_rule is not null
       and t.recurrence_origin_id is null
       and t.due_date is not null;
       -- (sem `and t.medication_id is null` — é exatamente o guard que está sendo testado)

    select count(*) into n from public.medication;
    if n = 6 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: sem o guard de idempotência deveriam existir 6 tratamentos, existem % — o guard não era o que segurava a duplicação', n;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- estado real restaurado depois das sabotagens ---------------------------------------------
do $$
declare n int; src text;
begin
  perform 1 from pg_constraint
   where conrelid='public.medication'::regclass and conname='medication_times_check';
  if not found then raise exception 'FALHOU: controle negativo deixou o check removido'; end if;

  perform 1 from pg_indexes
   where schemaname='public' and tablename='medication' and indexname='medication_user_active_idx';
  if not found then raise exception 'FALHOU: controle negativo deixou o índice removido'; end if;

  select count(*) into n from pg_policies
   where schemaname='public' and tablename='medication'
     and coalesce(qual, '') || coalesce(with_check, '') like '%uid()%';
  if n <> 4 then raise exception 'FALHOU: controle negativo deixou % policy(s) por user_id', n; end if;

  perform 1 from pg_class where oid='public.medication'::regclass and relrowsecurity;
  if not found then raise exception 'FALHOU: controle negativo deixou a RLS desligada'; end if;

  select prosrc into src from pg_proc where proname='wipe_own_data';
  if src not like '%medication%' or src not like '%health_metric%' then
    raise exception 'FALHOU: controle negativo deixou wipe_own_data sabotado';
  end if;

  perform 1 from information_schema.columns
   where table_schema='public' and table_name='task' and column_name='medication_id';
  if not found then raise exception 'FALHOU: controle negativo deixou task sem medication_id'; end if;

  select count(*) into n from public.medication;
  if n <> 3 then raise exception 'FALHOU: controle negativo deixou % tratamento(s) na tabela (esperado 3)', n; end if;

  raise notice 'OK: 11 controles negativos acusaram a sabotagem e o estado real foi restaurado';
end $$;
