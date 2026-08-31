\set ON_ERROR_STOP on

-- Assertivas do backfill (20260816233000_medication_backfill.sql). Este arquivo roda **duas
-- vezes** no run.sh: uma depois da primeira aplicação da migration e outra depois da segunda. Como
-- todas as contagens são absolutas (3 tratamentos, 5 doses ligadas, 1 tratamento por origem), a
-- segunda passagem é a prova de idempotência: se o backfill duplicasse qualquer coisa ao rodar de
-- novo, os números aqui mudariam e o arquivo falharia.
do $$
declare
  n int;
  med_a uuid;
  med_b uuid;
  rule jsonb;
  t record;
begin
  -- ---- um tratamento por medicação antiga, nem um a mais ---------------------------------------
  select count(*) into n from public.medication;
  if n <> 3 then
    raise exception 'FALHOU: deveriam existir 3 tratamentos depois do backfill (Losartana, Amoxicilina, Metformina), existem % — backfill duplicou ou deixou de fora', n;
  end if;

  -- Duplicata se manifestaria como dois tratamentos com o mesmo (user_id, name).
  select count(*) into n from (
    select user_id, name from public.medication group by user_id, name having count(*) > 1
  ) dup;
  if n <> 0 then
    raise exception 'FALHOU: % (user_id, name) duplicado(s) em medication — o backfill não é idempotente', n;
  end if;

  -- ---- tratamento A (Losartana): horário, cadência e período -----------------------------------
  select * into t from public.medication
   where name = 'Losartana' and user_id = '11111111-1111-1111-1111-111111111111';
  if t is null then raise exception 'FALHOU: Losartana não virou tratamento'; end if;
  med_a := t.id;

  if t.times <> array['08:00'::time] then
    raise exception 'FALHOU: times de Losartana deveria ser {08:00}, veio %', t.times;
  end if;
  if t.interval_days <> 1 then
    raise exception 'FALHOU: interval_days de Losartana deveria ser 1 (regra daily/interval 1), veio %', t.interval_days;
  end if;
  if t.started_on <> date '2026-08-10' then
    raise exception 'FALHOU: started_on de Losartana deveria ser o due_date da origem (2026-08-10), veio %', t.started_on;
  end if;
  if t.ended_on is not null then
    raise exception 'FALHOU: Losartana não tinha `until` na regra, ended_on deveria ser null, veio %', t.ended_on;
  end if;
  if not t.active then raise exception 'FALHOU: tratamento migrado deveria nascer ativo'; end if;

  -- ---- tratamento B (Amoxicilina): `interval` e `until` da regra vieram junto -------------------
  select * into t from public.medication where name = 'Amoxicilina';
  if t is null then raise exception 'FALHOU: Amoxicilina não virou tratamento'; end if;
  med_b := t.id;
  if t.interval_days <> 2 then
    raise exception 'FALHOU: interval_days de Amoxicilina deveria ser 2, veio %', t.interval_days;
  end if;
  if t.ended_on <> date '2026-08-20' then
    raise exception 'FALHOU: `until` da regra deveria virar ended_on 2026-08-20, veio % — backfill perdeu informação', t.ended_on;
  end if;
  if t.times <> array['09:30'::time] then
    raise exception 'FALHOU: times de Amoxicilina deveria ser {09:30}, veio %', t.times;
  end if;

  -- ---- a origem e TODAS as ocorrências apontam pro mesmo tratamento ----------------------------
  select count(*) into n from public.task where medication_id = med_a;
  if n <> 3 then
    raise exception 'FALHOU: a série da Losartana tem origem + 2 doses = 3 tasks ligadas, ligou %', n;
  end if;

  select count(*) into n from public.task
   where medication_id = med_a and dose_time = time '08:00' and is_medication;
  if n <> 3 then
    raise exception 'FALHOU: as 3 tasks da Losartana deveriam ter dose_time 08:00 e is_medication, só % têm', n;
  end if;

  select count(*) into n from public.task where medication_id = med_b;
  if n <> 1 then
    raise exception 'FALHOU: Amoxicilina só tem a origem materializada, deveriam ser 1 task ligada, foram %', n;
  end if;

  -- ---- o histórico de doses já tomadas continua intacto ----------------------------------------
  select * into t from public.task where id = 'aaaa0000-0000-0000-0000-000000000002';
  if t.completed_at is null or t.status <> 'done' then
    raise exception 'FALHOU: o backfill apagou o registro da dose já tomada (status %, completed_at %)',
      t.status, t.completed_at;
  end if;

  -- `recurrence_rule` é preservada de propósito: é o registro do que a série era. Quem impede a
  -- dupla materialização é o filtro por `medication_id` em materializeRecurringInstances.
  select recurrence_rule into rule from public.task
   where id = 'aaaa0000-0000-0000-0000-000000000001';
  if rule is null then
    raise exception 'FALHOU: o backfill zerou a recurrence_rule da origem — informação perdida';
  end if;

  -- ---- o que o backfill NÃO pode encostar -------------------------------------------------------
  select count(*) into n from public.task
   where id = 'cccc0000-0000-0000-0000-000000000001'
     and (medication_id is not null or dose_time is not null or is_medication);
  if n <> 0 then
    raise exception 'FALHOU: o backfill transformou uma tarefa recorrente comum em medicação';
  end if;

  select count(*) into n from public.task
   where id = 'dddd0000-0000-0000-0000-000000000001' and medication_id is not null;
  if n <> 0 then
    raise exception 'FALHOU: medicação avulsa (sem recurrence_rule) não deveria virar tratamento';
  end if;

  -- ---- dono correto: o backfill não cruza usuários ---------------------------------------------
  select count(*) into n from public.medication m
    join public.task tk on tk.medication_id = m.id
   where tk.user_id <> m.user_id;
  if n <> 0 then
    raise exception 'FALHOU: % dose(s) ligada(s) a tratamento de outro usuário', n;
  end if;

  select count(*) into n from public.medication
   where name = 'Metformina' and user_id = '22222222-2222-2222-2222-222222222222';
  if n <> 1 then
    raise exception 'FALHOU: a medicação do outro usuário deveria ter migrado para o dono dela';
  end if;

  -- ---- total de doses ligadas: 3 (A) + 1 (B) + 1 (outro usuário) --------------------------------
  select count(*) into n from public.task where medication_id is not null;
  if n <> 5 then
    raise exception 'FALHOU: deveriam existir 5 tasks com medication_id, existem % — backfill vazou ou duplicou', n;
  end if;

  select count(*) into n from public.task;
  if n <> 7 then
    raise exception 'FALHOU: o backfill mexeu na quantidade de tasks (7 no seed, % agora) — ele só atualiza, nunca insere', n;
  end if;

  raise notice 'OK: backfill — 3 tratamentos, 5 doses ligadas, histórico preservado, nada fora do escopo tocado';
end $$;
