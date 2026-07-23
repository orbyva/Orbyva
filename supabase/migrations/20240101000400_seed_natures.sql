-- Naturezas mínimas (Receita / Despesa) — globais.
-- Necessário para o onboarding semear tipos/classes.

insert into public.nature (name)
select 'Receita'
where not exists (select 1 from public.nature where lower(name) = 'receita');

insert into public.nature (name)
select 'Despesa'
where not exists (select 1 from public.nature where lower(name) = 'despesa');
