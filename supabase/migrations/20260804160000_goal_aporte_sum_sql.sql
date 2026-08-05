-- Soma aportes de uma meta sem baixar o ledger no client.
-- Critérios alinhados a matchesGoalAporte / matchesGoalMetaClass (domain/goals/finance).

create or replace function public.get_goal_aporte_sum(p_title text)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select trim(p_title) as title
  )
  select coalesce(sum(abs(tx.value)), 0)::numeric
  from public.transaction tx
  left join public.class c on c.id = tx.class_id
  cross join t
  where tx.user_id = auth.uid()
    and t.title <> ''
    and (
      lower(trim(coalesce(tx.description, ''))) = lower('Meta - ' || t.title)
      or lower(trim(coalesce(tx.description, ''))) like lower('Meta - ' || t.title || ' %')
      or lower(trim(coalesce(tx.description, ''))) like lower('Aporte meta: ' || t.title || '%')
      or lower(trim(coalesce(c.name, ''))) = lower(t.title)
      or lower(trim(coalesce(c.name, ''))) = lower('Meta - ' || t.title)
    );
$$;

revoke all on function public.get_goal_aporte_sum(text) from public;
grant execute on function public.get_goal_aporte_sum(text) to authenticated;

comment on function public.get_goal_aporte_sum(text) is
  'Soma |value| dos lançamentos de aporte da meta (descrição/classe); RLS via security invoker.';
