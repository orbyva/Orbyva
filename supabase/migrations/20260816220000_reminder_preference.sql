-- Preferência de lembrete (feature 063): uma linha por (`user_id`, `entity_type`) dizendo **se**,
-- **com que frequência** e **a que horas** o usuário quer ser lembrado de água, alimentação,
-- medicação, consulta ou de registrar as medidas do corpo.
--
-- Guarda a configuração, não cada disparo. Uma tabela de log de notificações só se paga quando
-- houver envio server-side com auditoria (ou seja, junto do push real, que está fora desta
-- feature); para não repetir o mesmo lembrete duas vezes no mesmo período, `last_notified_at` na
-- própria linha basta. Quais lembretes estão vencidos agora é função pura calculada no cliente
-- (`src/domain/health/reminder.ts`) — nenhuma linha é gravada por ocorrência, do mesmo jeito que as
-- ocorrências recorrentes de tarefa são virtuais até serem materializadas.
--
-- O `unique (user_id, entity_type)` é o alvo do upsert do app: mudar a preferência atualiza a linha
-- que já existe em vez de acumular configurações concorrentes do mesmo tipo.
--
-- Preferência de lembrete de saúde é dado sensível como o resto do módulo: RLS estritamente por
-- `user_id = auth.uid()` nas quatro operações, sem exceção.

create table if not exists public.reminder_preference (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  frequency text not null default 'daily',
  time_of_day time,
  enabled boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reminder_preference_entity_type_check check (
    entity_type in ('medication', 'consultation', 'water', 'nutrition', 'body_metric')
  ),
  constraint reminder_preference_frequency_check check (
    frequency in ('daily', 'weekly', 'monthly')
  ),
  constraint reminder_preference_user_entity_key unique (user_id, entity_type)
);

comment on table public.reminder_preference is
  'Configuração de lembrete por tipo de entidade (feature 063) — se, com que frequência e a que '
  'horas lembrar. Não guarda disparos: last_notified_at deduplica o lembrete do período atual.';
comment on column public.reminder_preference.entity_type is
  'medication | consultation | water | nutrition | body_metric — o check é o contrato que '
  'ReminderEntityType (src/types/health.ts) espelha. Mexeu num, mexe no outro.';
comment on column public.reminder_preference.time_of_day is
  'Horário local do lembrete; nulo cai no padrão do cliente (09:00).';
comment on column public.reminder_preference.last_notified_at is
  'Último disparo já entregue — impede repetir o mesmo lembrete no mesmo período a cada carga da '
  'página. É também o que uma Edge Function de push futura leria para não notificar duas vezes.';

alter table public.reminder_preference enable row level security;

drop policy if exists reminder_preference_select_own on public.reminder_preference;
create policy reminder_preference_select_own on public.reminder_preference
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists reminder_preference_insert_own on public.reminder_preference;
create policy reminder_preference_insert_own on public.reminder_preference
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists reminder_preference_update_own on public.reminder_preference;
create policy reminder_preference_update_own on public.reminder_preference
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists reminder_preference_delete_own on public.reminder_preference;
create policy reminder_preference_delete_own on public.reminder_preference
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui `reminder_preference` no wipe de conta (lista mais recente de wipe_own_data, copiada de
-- 20260816210000_health_metric.sql).
create or replace function public.wipe_own_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  t text;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  foreach t in array array[
    'transaction',
    'recurring_transaction',
    'monthly_budget',
    'movie',
    'movie_episode',
    'book_note',
    'book',
    'album',
    'personal_goal',
    'habit',
    'place_visit',
    'trip',
    'vehicle',
    'class',
    'type',
    'task_time_entry',
    'task_dependency',
    'task',
    'project_event',
    'note',
    'project',
    'tag',
    'content_link',
    'shopping_item',
    'shopping_category',
    'health_metric',
    'reminder_preference'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;
end;
$$;

-- Gate de acesso Pro (mesmo padrão das demais tabelas do app).
do $$
begin
  if to_regclass('public.enforce_app_access') is null
     and not exists (
       select 1 from pg_proc where proname = 'enforce_app_access'
     ) then
    raise notice 'enforce_app_access ausente — skip trigger reminder_preference';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.reminder_preference;
  create trigger trg_enforce_app_access
    before insert or update or delete on public.reminder_preference
    for each row execute function public.enforce_app_access();
end;
$$;
