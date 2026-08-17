-- Backfill das medicações da feature 049 para a tabela `medication` da 064.
--
-- Antes desta migration, uma medicação era uma tarefa-origem com `is_medication = true` +
-- `recurrence_rule`, e cada dose era uma ocorrência materializada (`recurrence_origin_id`
-- apontando pra ela). Aqui cada tarefa-origem dessas vira uma linha em `public.medication`, e a
-- origem **e todas as suas ocorrências** ganham `medication_id` + `dose_time`.
--
-- IDEMPOTÊNCIA — o requisito mais importante deste arquivo. Rodar duas vezes não pode duplicar
-- tratamento nenhum. O que garante isso é o filtro `t.medication_id is null` na CTE `origins`:
-- na segunda execução a origem já está ligada, sai do conjunto, e nem a insert nem o update têm
-- linha pra tocar. Provado em supabase/tests/medication (a migration é aplicada duas vezes e as
-- contagens têm de bater).
--
-- `recurrence_rule` é **preservada** de propósito, não zerada: é o registro do que a série era, e
-- perder informação num backfill é irreversível. Quem impede a dupla materialização é
-- `materializeRecurringInstances`, que passa a pular séries com `medication_id` preenchido
-- (src/api/tasks/tasks.ts) — não o apagamento da regra.

do $$
begin
  if to_regclass('public.medication') is null then
    raise exception 'medication não existe — aplique 20260816230000_medication.sql antes';
  end if;
end;
$$;

with origins as (
  select
    t.id           as task_id,
    t.user_id      as user_id,
    t.title        as title,
    t.due_date     as due_date,
    t.recurrence_rule as rule,
    -- Horário da dose: o `time` da regra é a fonte (foi ele que a 049 gravou); `due_time` é o
    -- fallback pra série antiga sem `time` na regra, e 08:00 o último recurso pra não gerar
    -- `times` nulo (a coluna é not null e o check exige ao menos um horário).
    coalesce(
      nullif(t.recurrence_rule ->> 'time', '')::time,
      t.due_time,
      time '08:00'
    ) as dose_time,
    gen_random_uuid() as med_id
  from public.task t
  where t.is_medication = true
    and t.recurrence_rule is not null
    and t.recurrence_origin_id is null
    and t.due_date is not null
    -- Este é o guard de idempotência: origem já migrada não entra de novo.
    and t.medication_id is null
),
inserted as (
  insert into public.medication (
    id, user_id, name, times, interval_days, started_on, ended_on, active
  )
  select
    o.med_id,
    o.user_id,
    o.title,
    array[o.dose_time],
    -- A 049 só criava regra `daily`, mas a origem pode ter sido editada depois pelo form completo
    -- de tarefa. `weekly` vira o equivalente em dias; o resto cai no próprio `interval` (o pior
    -- caso é uma cadência mais frequente que a original, nunca uma dose perdida).
    greatest(
      1,
      case coalesce(o.rule ->> 'frequency', 'daily')
        when 'weekly' then coalesce((o.rule ->> 'interval')::int, 1) * 7
        else coalesce((o.rule ->> 'interval')::int, 1)
      end
    ),
    o.due_date,
    -- `until` da regra é o fim do tratamento; sem ele o tratamento é contínuo.
    nullif(o.rule ->> 'until', '')::date,
    true
  from origins o
  returning id
)
update public.task t
   set medication_id = o.med_id,
       dose_time     = o.dose_time,
       -- A dose ligada a um tratamento é sempre renderizada como dose. As ocorrências já herdavam
       -- `is_medication` da origem (049), mas o backfill não depende disso.
       is_medication = true
  from origins o
 where t.id = o.task_id
    or t.recurrence_origin_id = o.task_id;

-- `inserted` é uma CTE modificadora: o Postgres a executa mesmo sem ninguém referenciá-la.
