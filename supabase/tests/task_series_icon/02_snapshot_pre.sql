\set ON_ERROR_STOP on

-- O "antes" do roteiro de conferência que a tarefa "Aguarda o usuário" manda anotar. Guardar isto
-- numa tabela (em vez de olhar o número na tela) é o que permite `03_assert_backfill.sql` comparar
-- pós contra pré, em vez de contra uma constante escrita à mão.
create table pre_counts as
select
  (select count(*) from public.task)                                                  as tasks_total,
  (select count(*) from public.task where recurrence_origin_id is not null)           as ocorrencias_total,
  (select count(*) from public.task
     where recurrence_origin_id is not null and icon_key is null and icon_url is null) as ocorrencias_sem_icone,
  (select count(*) from public.task where recurrence_origin_id is null)               as nao_ocorrencias;

-- Snapshot completo das linhas que o backfill **não** pode encostar: tudo que não é ocorrência
-- (origens, templates, doses e tarefas avulsas).
create table pre_nao_ocorrencias as
select * from public.task where recurrence_origin_id is null;

-- E das ocorrências que já tinham ícone próprio — o backfill preenche buraco, não sobrescreve.
create table pre_ocorrencias_com_icone as
select * from public.task
where recurrence_origin_id is not null and (icon_key is not null or icon_url is not null);

do $$
declare c record; n int;
begin
  select * into c from pre_counts;

  -- Sanidade do próprio seed: sem estes números o resto do arquivo não prova nada.
  if c.ocorrencias_total <> 8 then
    raise exception 'SEED INVÁLIDO: deveriam existir 8 ocorrências antes da migration, existem %', c.ocorrencias_total;
  end if;
  -- 7 das 8 ocorrências estão sem ícone (a 8ª é a que o usuário marcou com "star"). É exatamente o
  -- buraco que a migration existe para tapar: no app, essas linhas apareciam sem ícone enquanto a
  -- ocorrência **virtual** do mesmo dia na Agenda mostrava o ícone da origem.
  if c.ocorrencias_sem_icone <> 7 then
    raise exception 'SEED INVÁLIDO: deveriam existir 7 ocorrências sem ícone, existem %', c.ocorrencias_sem_icone;
  end if;

  select count(*) into n from pre_ocorrencias_com_icone;
  if n <> 1 then
    raise exception 'SEED INVÁLIDO: deveria existir 1 ocorrência com ícone próprio, existem %', n;
  end if;

  -- Duas ocorrências da série "Reunião mensal"/"Corrida"... conferindo que existe pelo menos uma
  -- série sem ícone nenhum na origem (o caso que tem de continuar sem ícone depois).
  select count(*) into n from public.task
    where recurrence_origin_id = 'cccccccc-0000-0000-0000-000000000000';
  if n <> 1 then
    raise exception 'SEED INVÁLIDO: a série sem ícone deveria ter 1 ocorrência, tem %', n;
  end if;
end $$;
