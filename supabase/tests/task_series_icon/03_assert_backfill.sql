\set ON_ERROR_STOP on

-- Assertivas do backfill (20260819120000_task_series_icon_backfill.sql). Este arquivo roda **duas
-- vezes** no run.sh: depois da primeira aplicação e depois da segunda. Todas as contagens são
-- absolutas ou comparadas contra `pre_counts`, então a segunda passagem já é parte da prova de
-- idempotência (a outra parte é `05_assert_idempotente.sql`, que compara linha a linha).
do $$
declare
  pre record;
  n int;
  t record;
begin
  select * into pre from pre_counts;

  -- ---- 1. nenhuma ocorrência ficou sem o ícone da sua origem -----------------------------------
  select count(*) into n
  from public.task as occurrence
  join public.task as origin on origin.id = occurrence.recurrence_origin_id
  where (origin.icon_key is not null or origin.icon_url is not null)
    and occurrence.icon_key is null
    and occurrence.icon_url is null;
  if n <> 0 then
    raise exception 'FALHOU: % ocorrência(s) continuam sem ícone apesar de a origem ter um — a série apareceria metade com ícone, metade sem', n;
  end if;

  -- ---- 2. série de preset: as ocorrências herdaram o icon_key da origem ------------------------
  select count(*) into n from public.task
  where recurrence_origin_id = 'aaaaaaaa-0000-0000-0000-000000000000'
    and icon_key = 'dumbbell' and icon_url is null;
  if n <> 2 then
    raise exception 'FALHOU: % (de 2) ocorrências de "Academia" herdaram o preset da origem', n;
  end if;

  -- ---- 3. ocorrência com ícone próprio não é sobrescrita ---------------------------------------
  select * into t from public.task where id = 'aaaaaaaa-0000-0000-0000-000000000003';
  if t.icon_key <> 'star' then
    raise exception 'FALHOU: o backfill sobrescreveu o ícone próprio da ocorrência (era "star", virou "%")', t.icon_key;
  end if;

  select count(*) into n from (
    (select * from pre_ocorrencias_com_icone except select * from public.task)
    union all
    (select * from public.task where id in (select id from pre_ocorrencias_com_icone)
       except select * from pre_ocorrencias_com_icone)
  ) diff;
  if n <> 0 then
    raise exception 'FALHOU: % linha(s) de ocorrência que já tinham ícone mudaram', n;
  end if;

  -- ---- 4. série de imagem enviada: herdou o icon_url, e não um icon_key inventado --------------
  select * into t from public.task where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  if t.icon_url is distinct from 'https://cdn.example.com/violao.png' then
    raise exception 'FALHOU: a ocorrência não herdou o icon_url da origem (ficou "%")', t.icon_url;
  end if;
  if t.icon_key is not null then
    raise exception 'FALHOU: a ocorrência ganhou icon_key "%" — icon_key e icon_url são mutuamente exclusivos', t.icon_key;
  end if;

  -- ---- 5. série sem ícone continua sem ícone ---------------------------------------------------
  select * into t from public.task where id = 'cccccccc-0000-0000-0000-000000000001';
  if t.icon_key is not null or t.icon_url is not null then
    raise exception 'FALHOU: ocorrência de série sem ícone ganhou um (icon_key=%, icon_url=%)', t.icon_key, t.icon_url;
  end if;

  -- ---- 6. série vinculada à Recorrência Financeira (002) entra no mesmo escopo ------------------
  select count(*) into n from public.task
  where recurrence_origin_id = 'dddddddd-0000-0000-0000-000000000000' and icon_key = 'wifi';
  if n <> 2 then
    raise exception 'FALHOU: % (de 2) parcelas materializadas herdaram o ícone do template', n;
  end if;

  -- ---- 7. a série do outro usuário também foi backfillada, e continua dele ----------------------
  select * into t from public.task where id = '99999999-0000-0000-0000-000000000001';
  if t.icon_key <> 'heart' then
    raise exception 'FALHOU: a ocorrência do outro usuário não herdou o ícone (ficou "%")', t.icon_key;
  end if;
  if t.user_id <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'FALHOU: o backfill mexeu no dono da linha';
  end if;

  -- ---- 8. nada que não é ocorrência foi tocado -------------------------------------------------
  -- Comparação linha a linha contra o snapshot pré-migration: qualquer coluna de qualquer origem,
  -- template, dose ou tarefa avulsa que tenha mudado aparece aqui.
  select count(*) into n from (
    (select * from pre_nao_ocorrencias
       except select * from public.task where recurrence_origin_id is null)
    union all
    (select * from public.task where recurrence_origin_id is null
       except select * from pre_nao_ocorrencias)
  ) diff;
  if n <> 0 then
    raise exception 'FALHOU: % linha(s) que não são ocorrência mudaram — o where do backfill vazou', n;
  end if;

  -- ---- 9. nenhuma linha criada nem apagada -----------------------------------------------------
  select count(*) into n from public.task;
  if n <> pre.tasks_total then
    raise exception 'FALHOU: o total de tarefas foi de % para % — um UPDATE não pode criar nem apagar linha', pre.tasks_total, n;
  end if;

  select count(*) into n from public.task where recurrence_origin_id is not null;
  if n <> pre.ocorrencias_total then
    raise exception 'FALHOU: o total de ocorrências foi de % para %', pre.ocorrencias_total, n;
  end if;

  -- ---- 10. o número do roteiro de conferência pós-push, explicitamente --------------------------
  -- "ocorrências sem ícone" cai de 7 para 1 (a única cuja origem também não tem ícone).
  select count(*) into n from public.task
  where recurrence_origin_id is not null and icon_key is null and icon_url is null;
  if n <> 1 then
    raise exception 'FALHOU: deveriam sobrar 1 ocorrência sem ícone (a da série sem ícone), sobraram %', n;
  end if;
end $$;
