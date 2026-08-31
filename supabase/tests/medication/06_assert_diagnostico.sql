\set ON_ERROR_STOP on

-- Prova de que o **roteiro de diagnóstico da feature 096** discrimina (Q1–Q4 de
-- `docs/features/.../096-tratamento-encerrado-sem-limite.md`).
--
-- Por que isto existe: o roteiro vai ser rodado **uma vez** contra o banco de produção do usuário,
-- e a decisão de reparo de dado sai do que ele devolver. Uma consulta que "sempre acusa" — ou que
-- nunca acusa — levaria a esteira a reparar a coisa errada num dado que não dá pra desfazer. Então
-- as quatro consultas entram aqui como **views verbatim** (o mesmo texto que está no arquivo da
-- feature, sem uma vírgula de diferença) e cada uma é submetida a duas perguntas:
--   1. acusa o cenário dela? (sensibilidade)
--   2. deixa os outros três em paz? (especificidade)
-- Os controles negativos do fim fecham o argumento: sabotam o dado de um cenário e exigem que o
-- veredito **mude**, provando que ele vem da linha e não da consulta.
--
-- Roda por último no `run.sh`, depois de `05_assert_rls.sql`: aquele arquivo faz contagens
-- absolutas em `public.medication` e terminaria quebrado com os quatro tratamentos daqui na tabela.
-- Por isso também o usuário próprio (`3333…`), que nenhum dos outros arquivos toca.
--
-- Todas as datas são relativas a `current_date` de propósito: um roteiro de diagnóstico com data
-- chumbada apodrece, e a assertiva "está fora do alcance do gerador" só significa alguma coisa
-- medida contra hoje.
--
-- Toda leitura de linha usa `select ... into strict`: sem `strict`, uma consulta que não devolvesse
-- linha nenhuma deixaria o record todo nulo, `null <> 0` não é verdade, e a assertiva passaria
-- **vazia** — que é precisamente o modo de falhar que este arquivo existe para impedir.

reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ---- os quatro cenários -----------------------------------------------------------------------

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'diagnostico@x.com');

-- S1 (H1) e S2 (H4) são **deliberadamente idênticos**, do `started_on` ao `ended_on`, e diferem em
-- exatamente uma linha de `task`: a dose pendente das 20:00 de hoje, que o `delete` de
-- `end-treatment` levou em S1 e que em S2 continua de pé. Se o Q2 discrimina os dois, discrimina
-- por causa dessa linha — não por causa de nada do tratamento.
insert into public.medication
  (id, user_id, name, times, interval_days, started_on, ended_on, active)
values
  ('f1f10000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
   'S1 Sertralina (H1 — encerrada pelo dialog de dose)',
   array['08:00','20:00']::time[], 1, current_date - 10, current_date, false),
  ('f4f40000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333',
   'S2 Omeprazol (H4 — encerrado pelo botão da lista)',
   array['08:00','20:00']::time[], 1, current_date - 10, current_date, false),
  ('f2f20000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333',
   'S3 Amoxicilina (H2 — ended_on herdado do until)',
   array['09:30']::time[], 2, current_date - 30, current_date - 5, true),
  ('f3f30000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333',
   'S4 Metformina (H3 — além do alcance do gerador)',
   array['08:00']::time[], 1, current_date - 500, null, true);

-- Passado idêntico para S1 e S2: dez dias, dois horários, tudo tomado.
insert into public.task
  (user_id, title, status, due_date, due_time, dose_time, medication_id, is_medication, completed_at)
select
  '33333333-3333-3333-3333-333333333333',
  'dose',
  'done',
  current_date - d,
  t,
  t,
  m,
  true,
  (current_date - d)::timestamptz
from generate_series(1, 10) as d,
     unnest(array['08:00','20:00']::time[]) as t,
     unnest(array['f1f10000-0000-0000-0000-000000000001',
                  'f4f40000-0000-0000-0000-000000000004']::uuid[]) as m;

-- Hoje, S1: sobrou só a dose já tomada das 08:00. A das 20:00 estava pendente e o
-- `delete ... where due_date >= current_date and completed_at is null` a levou.
insert into public.task
  (user_id, title, status, due_date, due_time, dose_time, medication_id, is_medication, completed_at)
values
  ('33333333-3333-3333-3333-333333333333', 'dose', 'done', current_date, '08:00', '08:00',
   'f1f10000-0000-0000-0000-000000000001', true, current_date::timestamptz);

-- Hoje, S2: as duas doses no lugar — a das 08:00 tomada, a das 20:00 ainda pendente. Nada foi
-- apagado; só o `active` virou.
insert into public.task
  (user_id, title, status, due_date, due_time, dose_time, medication_id, is_medication, completed_at)
values
  ('33333333-3333-3333-3333-333333333333', 'dose', 'done', current_date, '08:00', '08:00',
   'f4f40000-0000-0000-0000-000000000004', true, current_date::timestamptz),
  ('33333333-3333-3333-3333-333333333333', 'dose', 'todo', current_date, '20:00', '20:00',
   'f4f40000-0000-0000-0000-000000000004', true, null);

-- S3: a tarefa-origem da 049 que o backfill converteu, com `until` na regra igual ao `ended_on`
-- que foi parar na `medication`. É o par que o Q3 procura.
insert into public.task
  (id, user_id, title, status, due_date, due_time, dose_time, recurrence_rule,
   recurrence_origin_id, medication_id, is_medication)
values
  ('f2f20000-0000-0000-0000-0000000000a1', '33333333-3333-3333-3333-333333333333',
   'Amoxicilina', 'todo', current_date - 30, '09:30', '09:30',
   jsonb_build_object(
     'frequency', 'daily', 'interval', 2, 'time', '09:30',
     'until', to_char(current_date - 5, 'YYYY-MM-DD')
   ),
   null, 'f2f20000-0000-0000-0000-000000000002', true);

-- S4: tratamento diário começado há 500 dias. As doses param em `started_on + 399`, que é o teto
-- do laço de `computeMissingDoses` — daí para cá o gerador nunca mais alcançou nada.
insert into public.task
  (user_id, title, status, due_date, due_time, dose_time, medication_id, is_medication, completed_at)
select
  '33333333-3333-3333-3333-333333333333',
  'dose', 'done',
  (current_date - 500) + d,
  time '08:00', time '08:00',
  'f3f30000-0000-0000-0000-000000000003',
  true,
  ((current_date - 500) + d)::timestamptz
from generate_series(0, 399) as d;

-- ---- as quatro consultas, verbatim, como views ------------------------------------------------
-- O texto abaixo é o mesmo do arquivo da feature. Qualquer divergência entre os dois torna esta
-- prova inútil, então elas moram juntas: quem editar a consulta lá edita aqui.

create or replace view public.diag_q1 as
select
  m.id,
  m.name,
  m.active,
  m.started_on,
  m.ended_on,
  m.interval_days,
  m.times,
  m.created_at,
  count(t.id)                                                        as doses_total,
  count(t.id) filter (
    where t.due_date >= current_date and t.completed_at is null
  )                                                                  as pendentes_hoje_ou_depois,
  max(t.due_date)                                                    as ultima_dose
from public.medication m
left join public.task t on t.medication_id = m.id
group by m.id
order by m.active, m.created_at;

create or replace view public.diag_q2 as
with alvo as (
  select m.* from public.medication m where m.active = false
)
select
  a.id,
  a.name,
  a.ended_on,
  coalesce(array_length(a.times, 1), 0)                              as horarios_por_dia,
  (select count(*) from public.task t
     where t.medication_id = a.id
       and t.due_date >= current_date
       and t.completed_at is null)                                   as pendentes_hoje_ou_depois,
  (select count(*) from public.task t
     where t.medication_id = a.id
       and t.due_date >= current_date)                               as doses_hoje_ou_depois,
  (select max(t.due_date) from public.task t
     where t.medication_id = a.id)                                   as ultimo_dia,
  (select count(*) from public.task t
     where t.medication_id = a.id
       and t.due_date = (select max(t2.due_date) from public.task t2
                          where t2.medication_id = a.id))            as doses_no_ultimo_dia
from alvo a;

create or replace view public.diag_q3 as
select
  m.id,
  m.name,
  m.ended_on,
  t.id                                                    as origem_task_id,
  t.recurrence_rule ->> 'until'                           as until_da_origem,
  (m.ended_on is not distinct from
     nullif(t.recurrence_rule ->> 'until', '')::date)     as ended_on_veio_do_until
from public.medication m
join public.task t
  on t.medication_id = m.id
 and t.recurrence_rule is not null
 and t.recurrence_origin_id is null;

create or replace view public.diag_q4 as
select
  m.id,
  m.name,
  m.active,
  m.started_on,
  m.interval_days,
  (current_date - m.started_on)                                      as dias_desde_o_inicio,
  399 * m.interval_days                                              as alcance_em_dias,
  m.started_on + (399 * m.interval_days)                             as ultimo_dia_alcancavel,
  (select max(t.due_date) from public.task t
     where t.medication_id = m.id)                                   as ultima_dose_real,
  ((current_date - m.started_on) > 399 * m.interval_days)            as fora_do_alcance
from public.medication m
order by fora_do_alcance desc, m.started_on;

-- ---- Q1: o inventário mostra os quatro e conta o que cada um materializou ---------------------
do $$
declare r record; n int;
begin
  select count(*) into n from public.diag_q1
   where id in ('f1f10000-0000-0000-0000-000000000001',
                'f4f40000-0000-0000-0000-000000000004',
                'f2f20000-0000-0000-0000-000000000002',
                'f3f30000-0000-0000-0000-000000000003');
  if n <> 4 then
    raise exception 'FALHOU Q1: o inventário devolveu % dos 4 cenários', n;
  end if;

  -- S1: 20 doses passadas + 1 de hoje = 21. S2: 20 + 2 = 22. A diferença de uma linha é o bug.
  select * into strict r from public.diag_q1 where id = 'f1f10000-0000-0000-0000-000000000001';
  if r.doses_total <> 21 or r.pendentes_hoje_ou_depois <> 0 or r.ultima_dose <> current_date then
    raise exception 'FALHOU Q1/S1: doses_total=%, pendentes=%, ultima_dose=%',
      r.doses_total, r.pendentes_hoje_ou_depois, r.ultima_dose;
  end if;

  select * into strict r from public.diag_q1 where id = 'f4f40000-0000-0000-0000-000000000004';
  if r.doses_total <> 22 or r.pendentes_hoje_ou_depois <> 1 or r.ultima_dose <> current_date then
    raise exception 'FALHOU Q1/S2: doses_total=%, pendentes=%, ultima_dose=%',
      r.doses_total, r.pendentes_hoje_ou_depois, r.ultima_dose;
  end if;

  -- S4 é o retrato do horizonte: 400 doses e a última há 101 dias, com o tratamento ativo.
  select * into strict r from public.diag_q1 where id = 'f3f30000-0000-0000-0000-000000000003';
  if r.doses_total <> 400 or r.ultima_dose <> current_date - 101 or r.active is not true then
    raise exception 'FALHOU Q1/S4: doses_total=%, ultima_dose=% (esperado %), active=%',
      r.doses_total, r.ultima_dose, current_date - 101, r.active;
  end if;

  -- E o `ended_on` do Q1 é o que denuncia o `deactivateMedication`: S1 e S2 têm término = hoje
  -- sem o usuário ter posto nada, que é a frase do prompt desta feature.
  select count(*) into n from public.diag_q1
   where id in ('f1f10000-0000-0000-0000-000000000001',
                'f4f40000-0000-0000-0000-000000000004')
     and ended_on = current_date;
  if n <> 2 then
    raise exception 'FALHOU Q1: o término fabricado não apareceu no inventário (% de 2)', n;
  end if;

  raise notice 'OK Q1: inventário devolve os 4 cenários com as contagens certas';
end $$;

-- ---- Q2: sensibilidade (acusa H1 e H4) e especificidade (ignora H2 e H3) ----------------------
do $$
declare r record; n int;
begin
  -- Especificidade: tratamento ativo não entra no discriminante de encerramento, por definição.
  select count(*) into n from public.diag_q2
   where id in ('f2f20000-0000-0000-0000-000000000002',
                'f3f30000-0000-0000-0000-000000000003');
  if n <> 0 then
    raise exception 'FALHOU Q2: pegou % tratamento(s) ativo(s) — o Q2 é só sobre active = false', n;
  end if;

  -- Leitura 2 do roteiro: pendentes = 0 **e** o último dia perdeu horário ⇒ H1.
  select * into strict r from public.diag_q2 where id = 'f1f10000-0000-0000-0000-000000000001';
  if r.pendentes_hoje_ou_depois <> 0 then
    raise exception 'FALHOU Q2/S1: leitura de H1 exige 0 pendentes, veio %',
      r.pendentes_hoje_ou_depois;
  end if;
  if r.doses_no_ultimo_dia >= r.horarios_por_dia then
    raise exception 'FALHOU Q2/S1: leitura de H1 exige dia incompleto, veio % de %',
      r.doses_no_ultimo_dia, r.horarios_por_dia;
  end if;

  -- Leitura 1 do roteiro: sobrou pendente de hoje em diante ⇒ H4, e H1 fica refutada.
  select * into strict r from public.diag_q2 where id = 'f4f40000-0000-0000-0000-000000000004';
  if r.pendentes_hoje_ou_depois <> 1 then
    raise exception 'FALHOU Q2/S2: leitura de H4 exige pendente vivo, veio %',
      r.pendentes_hoje_ou_depois;
  end if;
  if r.doses_no_ultimo_dia <> r.horarios_por_dia then
    raise exception 'FALHOU Q2/S2: em H4 o último dia está inteiro, veio % de %',
      r.doses_no_ultimo_dia, r.horarios_por_dia;
  end if;

  raise notice 'OK Q2: separa H1 (dia incompleto, 0 pendentes) de H4 (pendente vivo) com uma linha de diferença';
end $$;

-- ---- Q3: sensibilidade (acusa H2) e especificidade (ignora H1, H3 e H4) -----------------------
do $$
declare r record; n int;
begin
  select count(*) into n from public.diag_q3
   where id in ('f1f10000-0000-0000-0000-000000000001',
                'f4f40000-0000-0000-0000-000000000004',
                'f3f30000-0000-0000-0000-000000000003');
  if n <> 0 then
    raise exception 'FALHOU Q3: % cenário(s) sem tarefa-origem entraram no join do backfill', n;
  end if;

  select * into strict r from public.diag_q3 where id = 'f2f20000-0000-0000-0000-000000000002';
  if r.ended_on_veio_do_until is not true then
    raise exception 'FALHOU Q3/S3: ended_on=% vs until=% não foi reconhecido como herdado',
      r.ended_on, r.until_da_origem;
  end if;
  if r.origem_task_id <> 'f2f20000-0000-0000-0000-0000000000a1' then
    raise exception 'FALHOU Q3/S3: origem errada (%)', r.origem_task_id;
  end if;

  raise notice 'OK Q3: acusa só o tratamento cujo ended_on é o until da origem da 049';
end $$;

-- ---- Q4: sensibilidade (acusa H3) e especificidade (ignora H1, H2 e H4) -----------------------
do $$
declare r record; n int;
begin
  select count(*) into n from public.diag_q4
   where id in ('f1f10000-0000-0000-0000-000000000001',
                'f4f40000-0000-0000-0000-000000000004',
                'f2f20000-0000-0000-0000-000000000002')
     and fora_do_alcance;
  if n <> 0 then
    raise exception 'FALHOU Q4: % tratamento(s) dentro do alcance foram marcados como fora', n;
  end if;

  select * into strict r from public.diag_q4 where id = 'f3f30000-0000-0000-0000-000000000003';
  if r.fora_do_alcance is not true then
    raise exception 'FALHOU Q4/S4: % dias desde o início contra % de alcance não acusou',
      r.dias_desde_o_inicio, r.alcance_em_dias;
  end if;
  -- O que faz o diagnóstico valer: a última dose real bate no teto calculado. Se batesse em
  -- qualquer outro lugar, a explicação do horizonte estaria errada.
  if r.ultima_dose_real <> r.ultimo_dia_alcancavel then
    raise exception 'FALHOU Q4/S4: última dose % não bate com o teto do gerador %',
      r.ultima_dose_real, r.ultimo_dia_alcancavel;
  end if;

  raise notice 'OK Q4: acusa só o tratamento além de started_on + 399 x interval_days, e o teto bate com a última dose real';
end $$;

-- ---- controles negativos: sabotar o dado tem que virar o veredito -----------------------------
-- Mesmo mecanismo de `03_negative_controls.sql`: cada sabotagem vive num sub-bloco que termina em
-- exceção, e a exceção desfaz o DML do sub-bloco (savepoint implícito).

-- CN-1. Devolver a dose pendente das 20:00 de hoje a S1: o veredito tem que sair de H1 e virar H4.
do $$
declare r record;
begin
  begin
    insert into public.task
      (user_id, title, status, due_date, due_time, dose_time, medication_id, is_medication)
    values
      ('33333333-3333-3333-3333-333333333333', 'dose', 'todo', current_date, '20:00', '20:00',
       'f1f10000-0000-0000-0000-000000000001', true);
    select * into strict r from public.diag_q2 where id = 'f1f10000-0000-0000-0000-000000000001';
    if r.pendentes_hoje_ou_depois = 1 and r.doses_no_ultimo_dia = r.horarios_por_dia then
      raise exception 'CONTROLE OK';
    end if;
    raise exception
      'CONTROLE NEGATIVO FALHOU: com a dose pendente de volta o Q2 ainda leu H1 (pendentes=%, dia %/%)',
      r.pendentes_hoje_ou_depois, r.doses_no_ultimo_dia, r.horarios_por_dia;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- CN-2. Apagar as doses de hoje de S2: o veredito tem que sair de H4. E, mais importante, tem que
-- cair na leitura 3 do roteiro (`ultimo_dia < ended_on`, dia inteiro) — a **ambígua**, que manda
-- desempatar com o usuário — em vez de virar um H1 falsamente confiante.
do $$
declare r record;
begin
  begin
    delete from public.task
     where medication_id = 'f4f40000-0000-0000-0000-000000000004'
       and due_date >= current_date;
    select * into strict r from public.diag_q2 where id = 'f4f40000-0000-0000-0000-000000000004';
    if r.pendentes_hoje_ou_depois = 0
       and r.doses_no_ultimo_dia = r.horarios_por_dia
       and r.ultimo_dia < r.ended_on then
      raise exception 'CONTROLE OK';
    end if;
    raise exception
      'CONTROLE NEGATIVO FALHOU: sem as doses de hoje o Q2 não caiu na leitura ambígua (pendentes=%, dia %/%, ultimo=%, fim=%)',
      r.pendentes_hoje_ou_depois, r.doses_no_ultimo_dia, r.horarios_por_dia, r.ultimo_dia, r.ended_on;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- CN-3. Mudar o `until` da origem de S3: o Q3 tem que parar de dizer que o término foi herdado.
do $$
declare r record;
begin
  begin
    update public.task
       set recurrence_rule = jsonb_set(recurrence_rule, '{until}',
             to_jsonb(to_char(current_date - 9, 'YYYY-MM-DD')))
     where id = 'f2f20000-0000-0000-0000-0000000000a1';
    select * into strict r from public.diag_q3 where id = 'f2f20000-0000-0000-0000-000000000002';
    if r.ended_on_veio_do_until is false then raise exception 'CONTROLE OK'; end if;
    raise exception
      'CONTROLE NEGATIVO FALHOU: Q3 disse "herdado" com ended_on=% e until=%',
      r.ended_on, r.until_da_origem;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- CN-4. Tirar o vínculo da origem de S3: sem tarefa-origem, o tratamento tem que **sumir** do Q3 —
-- é assim que o roteiro refuta H2 para quem foi criado direto pela 064.
do $$
declare n int;
begin
  begin
    update public.task set medication_id = null
     where id = 'f2f20000-0000-0000-0000-0000000000a1';
    select count(*) into n from public.diag_q3
     where id = 'f2f20000-0000-0000-0000-000000000002';
    if n = 0 then raise exception 'CONTROLE OK'; end if;
    raise exception 'CONTROLE NEGATIVO FALHOU: Q3 ainda achou origem para S3 sem vínculo (% linha[s])', n;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- CN-5. Aproximar o `started_on` de S4: dentro do alcance, o Q4 tem que parar de acusar.
do $$
declare r record;
begin
  begin
    update public.medication set started_on = current_date - 100
     where id = 'f3f30000-0000-0000-0000-000000000003';
    select * into strict r from public.diag_q4 where id = 'f3f30000-0000-0000-0000-000000000003';
    if r.fora_do_alcance is false then raise exception 'CONTROLE OK'; end if;
    raise exception
      'CONTROLE NEGATIVO FALHOU: Q4 acusou um tratamento de % dias contra % de alcance',
      r.dias_desde_o_inicio, r.alcance_em_dias;
  exception when others then
    if sqlerrm <> 'CONTROLE OK' then raise; end if;
  end;
end $$;

-- ---- estado real restaurado depois das sabotagens ---------------------------------------------
do $$
declare r record; n int;
begin
  select * into strict r from public.diag_q2 where id = 'f1f10000-0000-0000-0000-000000000001';
  if r.pendentes_hoje_ou_depois <> 0 or r.doses_no_ultimo_dia <> 1 then
    raise exception 'FALHOU: controle negativo deixou S1 alterado (pendentes=%, dia=%)',
      r.pendentes_hoje_ou_depois, r.doses_no_ultimo_dia;
  end if;

  select * into strict r from public.diag_q2 where id = 'f4f40000-0000-0000-0000-000000000004';
  if r.pendentes_hoje_ou_depois <> 1 then
    raise exception 'FALHOU: controle negativo deixou S2 alterado (pendentes=%)',
      r.pendentes_hoje_ou_depois;
  end if;

  select count(*) into n from public.diag_q3
   where id = 'f2f20000-0000-0000-0000-000000000002' and ended_on_veio_do_until;
  if n <> 1 then raise exception 'FALHOU: controle negativo deixou S3 alterado'; end if;

  select count(*) into n from public.diag_q4
   where id = 'f3f30000-0000-0000-0000-000000000003' and fora_do_alcance;
  if n <> 1 then raise exception 'FALHOU: controle negativo deixou S4 alterado'; end if;

  raise notice 'OK: 5 controles negativos viraram o veredito e o estado real foi restaurado';
end $$;

drop view public.diag_q1;
drop view public.diag_q2;
drop view public.diag_q3;
drop view public.diag_q4;
