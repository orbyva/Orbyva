\set ON_ERROR_STOP on

-- Assertivas da migration 20260820100000_task_dedupe_doses_e_ocorrencias.sql. Roda **duas vezes**
-- no run.sh (depois da primeira e da segunda aplicação), então cada assertiva é absoluta ou
-- comparada contra os snapshots — a segunda passagem já é metade da prova de idempotência.
do $$
declare
  pre record;
  n int;
  t record;
begin
  select * into pre from pre_counts;

  -- ---- 1. não sobrou duplicata nenhuma (a query (2) do roteiro devolve vazio) ------------------
  select grupos into n from duplicatas where chave = 'dose';
  if n <> 0 then
    raise exception 'FALHOU: ainda há % grupo(s) de dose duplicada', n;
  end if;
  select grupos into n from duplicatas where chave = 'ocorrencia';
  if n <> 0 then
    raise exception 'FALHOU: ainda há % grupo(s) de ocorrência duplicada', n;
  end if;

  -- ---- 2. sobrou **uma** linha por chave, e é a certa -------------------------------------------
  -- Dose de 18/08 08:00: sobrevive a CONCLUÍDA, mesmo sendo a mais nova. Apagar a dose tomada e
  -- manter a pendente falsificaria a adesão da 064 — é a decisão mais importante desta migration.
  select count(*) into n from public.task
   where medication_id = 'aaaa0000-0000-0000-0000-0000000000a1'
     and due_date = '2026-08-18' and dose_time = '08:00';
  if n <> 1 then
    raise exception 'FALHOU: sobraram % doses de 18/08 08:00 (esperado 1)', n;
  end if;
  select * into t from public.task
   where medication_id = 'aaaa0000-0000-0000-0000-0000000000a1'
     and due_date = '2026-08-18' and dose_time = '08:00';
  if t.id <> 'd0000000-0000-0000-0000-000000000002' then
    raise exception 'FALHOU: sobrou a dose % — a concluída (…0002) é que tinha de sobreviver', t.id;
  end if;
  if t.completed_at is null then
    raise exception 'FALHOU: a dose que sobrou não tem completed_at — o histórico de adesão foi perdido';
  end if;

  -- Empate sem concluída: sobrevive a mais antiga por created_at.
  select count(*) into n from public.task
   where medication_id = 'aaaa0000-0000-0000-0000-0000000000a1'
     and due_date = '2026-08-19' and dose_time = '08:00';
  if n <> 1 then
    raise exception 'FALHOU: sobraram % doses de 19/08 08:00 (esperado 1)', n;
  end if;
  select * into t from public.task
   where medication_id = 'aaaa0000-0000-0000-0000-0000000000a1'
     and due_date = '2026-08-19' and dose_time = '08:00';
  if t.id <> 'd0000000-0000-0000-0000-000000000003' then
    raise exception 'FALHOU: no empate sobrou % em vez da mais antiga (…0003)', t.id;
  end if;

  -- Ocorrência duplicada de 17/08: idem, a mais antiga.
  select count(*) into n from public.task
   where recurrence_origin_id = 'e0000000-0000-0000-0000-000000000001' and due_date = '2026-08-17';
  if n <> 1 then
    raise exception 'FALHOU: sobraram % ocorrências de 17/08 (esperado 1)', n;
  end if;
  select * into t from public.task
   where recurrence_origin_id = 'e0000000-0000-0000-0000-000000000001' and due_date = '2026-08-17';
  if t.id <> 'e0000000-0000-0000-0000-000000000002' then
    raise exception 'FALHOU: sobrou a ocorrência % em vez da mais antiga (…0002)', t.id;
  end if;

  -- ---- 3. nada além das três duplicatas foi tocado ---------------------------------------------
  select count(*) into n from (
    (select * from pre_intocaveis except select * from public.task)
    union all
    (select * from public.task except select * from pre_intocaveis)
  ) diff;
  if n <> 0 then
    raise exception 'FALHOU: % linha(s) que deveriam ficar intactas sumiram ou mudaram', n;
  end if;

  -- O total caiu exatamente pelo número de duplicatas contadas antes — nem uma linha a mais.
  select count(*) into n from public.task;
  if n <> pre.tasks_total - 3 then
    raise exception 'FALHOU: restaram % tarefas, esperado % (antes % menos as 3 duplicatas)',
      n, pre.tasks_total - 3, pre.tasks_total;
  end if;

  -- ---- 4. o que a limpeza não pode alcançar ----------------------------------------------------
  -- Dose de outro usuário, mesmo dia e horário: a chave é por tratamento.
  if not exists (select 1 from public.task where id = 'd0000000-0000-0000-0000-000000000006') then
    raise exception 'FALHOU: a dose do outro usuário foi apagada';
  end if;
  -- O outro horário do mesmo dia (20:00) continua lá: "1 de manhã e 1 à noite" é o caso de uso da 064.
  if not exists (select 1 from public.task where id = 'd0000000-0000-0000-0000-000000000005') then
    raise exception 'FALHOU: a dose das 20:00 do mesmo dia foi tratada como duplicata';
  end if;
  -- `dose_time` nulo está fora do índice — o índice trata NULL como distinto, então apagar seria
  -- destruir dado que a constraint nem exige.
  select count(*) into n from public.task
   where medication_id = 'aaaa0000-0000-0000-0000-0000000000a1' and due_date = '2026-08-25';
  if n <> 2 then
    raise exception 'FALHOU: sobraram % doses sem dose_time (esperado 2, estão fora do índice)', n;
  end if;
  -- Duas parcelas da Recorrência Financeira no mesmo dia: legítimas.
  select count(*) into n from public.task
   where linked_recurring_id is not null and linked_installment_number is not null;
  if n <> pre.parcelas_total then
    raise exception 'FALHOU: sobraram % parcelas vinculadas, eram %', n, pre.parcelas_total;
  end if;
  -- Tarefas avulsas iguais no mesmo dia continuam sendo duas tarefas.
  select count(*) into n from public.task where title = 'Comprar cimento';
  if n <> 2 then
    raise exception 'FALHOU: sobraram % tarefas avulsas homônimas (esperado 2)', n;
  end if;

  -- ---- 5. nenhuma linha concluída sumiu ---------------------------------------------------------
  select count(*) into n from public.task where completed_at is not null;
  if n <> pre.concluidas_total then
    raise exception 'FALHOU: restaram % linhas concluídas, eram % — histórico perdido',
      n, pre.concluidas_total;
  end if;

  -- ---- 6. os índices existem, e são os parciais certos ------------------------------------------
  if to_regclass('public.task_medication_dose_unique_idx') is null then
    raise exception 'FALHOU: task_medication_dose_unique_idx não foi criado';
  end if;
  if to_regclass('public.task_recurrence_occurrence_unique_idx') is null then
    raise exception 'FALHOU: task_recurrence_occurrence_unique_idx não foi criado';
  end if;

  select count(*) into n from pg_indexes
   where schemaname = 'public'
     and indexname = 'task_recurrence_occurrence_unique_idx'
     and indexdef like '%UNIQUE%'
     and indexdef like '%linked_recurring_id IS NULL%';
  if n <> 1 then
    raise exception 'FALHOU: o índice de ocorrência não é único ou não exclui as parcelas vinculadas';
  end if;

  -- ---- 7. RLS e o gate Pro continuam de pé ------------------------------------------------------
  if not (select relrowsecurity from pg_class where oid = 'public.task'::regclass) then
    raise exception 'FALHOU: RLS de public.task foi desligada';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'task';
  if n < 4 then
    raise exception 'FALHOU: sobraram só % políticas em public.task (esperadas 4)', n;
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.task'::regclass and tgname = 'trg_enforce_app_access'
  ) then
    raise exception 'FALHOU: o trigger enforce_app_access sumiu de public.task';
  end if;
end $$;
