-- Espelho de supabase/migrations/20260727143000_habit_kind_goal.sql
alter table public.habit
  add column if not exists kind text not null default 'build';

alter table public.habit
  drop constraint if exists habit_kind_check;

alter table public.habit
  add constraint habit_kind_check check (kind in ('build', 'avoid'));

alter table public.habit
  add column if not exists goal_id uuid;

alter table public.habit
  add column if not exists goal_increment numeric;

do $$
begin
  if to_regclass('public.personal_goal') is not null then
    begin
      alter table public.habit
        add constraint habit_goal_id_fkey
        foreign key (goal_id) references public.personal_goal(id) on delete set null;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

update public.habit
set kind = 'avoid'
where kind = 'build'
  and (
    lower(name) like 'sem %'
    or lower(name) like '%sem delivery%'
    or lower(name) like 'evitar %'
  );
