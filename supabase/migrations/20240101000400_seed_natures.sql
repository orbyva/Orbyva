-- Naturezas mínimas (Receita / Despesa / Investimento) — globais.
-- Necessário para o onboarding semear tipos/classes.

insert into public.nature (name)
select 'Receita'
where not exists (select 1 from public.nature where lower(name) = 'receita');

insert into public.nature (name)
select 'Despesa'
where not exists (select 1 from public.nature where lower(name) = 'despesa');

insert into public.nature (name)
select 'Investimento'
where not exists (select 1 from public.nature where lower(name) = 'investimento');
