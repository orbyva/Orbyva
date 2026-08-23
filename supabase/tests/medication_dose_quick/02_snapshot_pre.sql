\set ON_ERROR_STOP on

-- O "antes" do roteiro de conferência que a tarefa "Aguarda o usuário" manda anotar. Guardar isto
-- numa tabela (em vez de olhar o número na tela) é o que permite `03_assert_backfill.sql` comparar
-- pós contra pré em vez de contra uma constante escrita à mão.
create table pre_counts as
select
  (select count(*) from public.task where medication_id is not null)                as doses_total,
  (select count(*) from public.task where is_quick and medication_id is null)       as quick_nao_dose,
  (select count(*) from public.task)                                                as tasks_total,
  (select count(*) from public.task where medication_id is not null and is_quick)   as doses_ja_pontuais;

-- Snapshot completo das linhas que o backfill **não** pode encostar: tudo que não é dose.
create table pre_nao_doses as
select * from public.task where medication_id is null;

do $$
declare c record;
begin
  select * into c from pre_counts;

  -- Sanidade do próprio seed: sem estes números o resto do arquivo não prova nada.
  if c.doses_total <> 6 then
    raise exception 'SEED INVÁLIDO: deveriam existir 6 doses antes da migration, existem %', c.doses_total;
  end if;
  if c.quick_nao_dose <> 1 then
    raise exception 'SEED INVÁLIDO: deveria existir 1 pontual que não é dose (Trocar escova), existem %', c.quick_nao_dose;
  end if;
  if c.doses_ja_pontuais <> 1 then
    raise exception 'SEED INVÁLIDO: deveria existir 1 dose já no estado final, existem %', c.doses_ja_pontuais;
  end if;

  -- Antes do backfill, 5 das 6 doses ainda se desenham como bloco na agenda. É a diferença que a
  -- migration existe para apagar.
  select count(*) into c.doses_total from public.task where medication_id is not null and not is_quick;
  if c.doses_total <> 5 then
    raise exception 'SEED INVÁLIDO: deveriam existir 5 doses ainda não pontuais, existem %', c.doses_total;
  end if;
end $$;
