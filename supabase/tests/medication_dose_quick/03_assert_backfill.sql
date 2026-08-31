\set ON_ERROR_STOP on

-- Assertivas do backfill (20260819110000_medication_dose_quick.sql). Este arquivo roda **duas
-- vezes** no run.sh: depois da primeira aplicação e depois da segunda. Todas as contagens são
-- absolutas ou comparadas contra `pre_counts`, então a segunda passagem é parte da prova de
-- idempotência (a outra parte é `05_assert_idempotente.sql`, que compara linha a linha).
do $$
declare
  pre record;
  n int;
  t record;
begin
  select * into pre from pre_counts;

  -- ---- 1. toda dose virou pontual --------------------------------------------------------------
  select count(*) into n from public.task where medication_id is not null and not is_quick;
  if n <> 0 then
    raise exception 'FALHOU: % dose(s) continuam sem is_quick — na agenda elas ficariam como bloco de 30 min enquanto as novas viram bolinha', n;
  end if;

  select count(*) into n from public.task where medication_id is not null and is_quick;
  if n <> pre.doses_total then
    raise exception 'FALHOU: % de % doses ficaram pontuais — o backfill deixou dose de fora (ou criou linha, o que ele nunca faz)', n, pre.doses_total;
  end if;

  -- ---- 2. toda dose tem ícone ------------------------------------------------------------------
  select count(*) into n from public.task where medication_id is not null and icon_key is null;
  if n <> 0 then
    raise exception 'FALHOU: % dose(s) sem icon_key — a bolinha ficaria um círculo liso, indistinguível de outra pontual', n;
  end if;

  -- ---- 3. ícone escolhido à mão sobrevive (é o `coalesce`, não um `= ''pill''`) -----------------
  select * into t from public.task where id = 'cccccccc-0000-0000-0000-000000000003';
  if t.icon_key <> 'star' then
    raise exception 'FALHOU: o backfill sobrescreveu o ícone customizado da dose (era "star", virou "%")', t.icon_key;
  end if;
  if not t.is_quick then
    raise exception 'FALHOU: a dose com ícone customizado não virou pontual';
  end if;

  -- ---- 4. o upload (icon_url) continua tendo prioridade na UI ----------------------------------
  select * into t from public.task where id = 'cccccccc-0000-0000-0000-000000000004';
  if t.icon_url <> 'https://cdn.example.com/remedio.png' then
    raise exception 'FALHOU: o backfill mexeu no icon_url da dose (era o upload do usuário, virou "%")', t.icon_url;
  end if;

  -- ---- 5. nada além das doses foi tocado -------------------------------------------------------
  -- Comparação linha a linha contra o snapshot pré-migration: qualquer coluna de qualquer tarefa
  -- que não é dose que tenha mudado aparece aqui.
  select count(*) into n from (
    (select * from pre_nao_doses except select * from public.task where medication_id is null)
    union all
    (select * from public.task where medication_id is null except select * from pre_nao_doses)
  ) diff;
  if n <> 0 then
    raise exception 'FALHOU: % linha(s) que NÃO são dose mudaram — o where do backfill vazou para fora de medication_id', n;
  end if;

  -- O número do roteiro de conferência pós-push, explicitamente.
  select count(*) into n from public.task where is_quick and medication_id is null;
  if n <> pre.quick_nao_dose then
    raise exception 'FALHOU: pontuais que não são dose passaram de % para % — o backfill marcou tarefa comum como pontual', pre.quick_nao_dose, n;
  end if;

  -- ---- 6. a medicação da 049 nunca migrada (sem medication_id) não virou pontual ----------------
  select * into t from public.task where id = 'cccccccc-0000-0000-0000-000000000006';
  if t.is_quick then
    raise exception 'FALHOU: medicação da 049 sem medication_id virou pontual — o filtro está em is_medication, não em medication_id';
  end if;
  if t.icon_key is not null then
    raise exception 'FALHOU: medicação da 049 sem medication_id ganhou icon_key "%"', t.icon_key;
  end if;

  -- ---- 7. nenhuma linha criada nem apagada -----------------------------------------------------
  select count(*) into n from public.task;
  if n <> pre.tasks_total then
    raise exception 'FALHOU: o total de tarefas foi de % para % — um UPDATE não pode criar nem apagar linha', pre.tasks_total, n;
  end if;

  -- ---- 8. a dose do outro usuário também foi convertida, e continua dele ------------------------
  select * into t from public.task where id = 'dddddddd-0000-0000-0000-000000000001';
  if not t.is_quick or t.icon_key <> 'pill' then
    raise exception 'FALHOU: a dose do outro usuário não foi convertida (is_quick=%, icon_key=%)', t.is_quick, t.icon_key;
  end if;
  if t.user_id <> '22222222-2222-2222-2222-222222222222' then
    raise exception 'FALHOU: o backfill mexeu no dono da linha';
  end if;
end $$;
