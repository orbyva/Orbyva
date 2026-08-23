\set ON_ERROR_STOP on

-- O "antes" do roteiro de conferência que a tarefa "Aguarda o usuário" da 074 manda anotar contra o
-- banco real. Guardar numa tabela (em vez de olhar o número na tela) é o que permite as assertivas
-- compararem depois × antes em vez de contra constantes escritas à mão.
create table pre_counts as
select
  (select count(*) from public.task)                                       as tasks_total,
  (select count(*) from public.task where medication_id is not null)       as doses_total,
  (select count(*) from public.task where completed_at is not null)        as concluidas_total,
  (select count(*) from public.task
     where linked_recurring_id is not null
       and linked_installment_number is not null)                          as parcelas_total;

-- As linhas que a migration **não** pode encostar. `except` linha a linha depois: qualquer coluna
-- alterada, além de qualquer linha sumida, acusa.
create table pre_intocaveis as
select * from public.task
where id not in (
  -- as duas duplicatas que devem morrer
  'd0000000-0000-0000-0000-000000000004',
  'e0000000-0000-0000-0000-000000000003',
  'd0000000-0000-0000-0000-000000000001'
);

-- A query (2) do roteiro de diagnóstico, generalizada: quantos grupos duplicados existem por chave.
create or replace view duplicatas as
  select 'dose' as chave, count(*) as grupos from (
    select 1 from public.task
     where medication_id is not null and due_date is not null and dose_time is not null
     group by medication_id, due_date, dose_time having count(*) > 1
  ) g
  union all
  select 'ocorrencia', count(*) from (
    select 1 from public.task
     where recurrence_origin_id is not null and linked_recurring_id is null and due_date is not null
     group by recurrence_origin_id, due_date having count(*) > 1
  ) g;

do $$
declare c record; n int;
begin
  select * into c from pre_counts;

  -- Sanidade do seed: sem estes números o resto do harness não prova nada.
  if c.tasks_total <> 17 then
    raise exception 'SEED INVÁLIDO: deveriam existir 17 tarefas antes da migration, existem %', c.tasks_total;
  end if;
  if c.doses_total <> 8 then
    raise exception 'SEED INVÁLIDO: deveriam existir 8 doses, existem %', c.doses_total;
  end if;

  -- O banco de partida **tem** duplicata; é o que torna o `create unique index` impossível sem a
  -- limpeza, e o que a query (2) do roteiro devolve para o usuário hoje.
  select grupos into n from duplicatas where chave = 'dose';
  if n <> 2 then
    raise exception 'SEED INVÁLIDO: deveriam existir 2 grupos de dose duplicada, existem %', n;
  end if;
  select grupos into n from duplicatas where chave = 'ocorrencia';
  if n <> 1 then
    raise exception 'SEED INVÁLIDO: deveria existir 1 grupo de ocorrência duplicada, existem %', n;
  end if;

  -- Controle negativo do próprio seed: sem a migration, criar o índice **falha**. Se isto passasse,
  -- o harness estaria validando um banco que já era limpo.
  begin
    create unique index seed_control_idx
      on public.task (medication_id, due_date, dose_time)
      where medication_id is not null;
    raise exception 'SEED INVÁLIDO: o índice único foi criado sem limpeza — não havia duplicata de verdade';
  exception
    when unique_violation then
      null; -- esperado
  end;
end $$;
