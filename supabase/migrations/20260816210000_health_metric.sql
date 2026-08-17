-- Métricas corporais (feature 063): uma linha por medição — peso, altura, cintura, quadril, peito,
-- braço.
--
-- Por que tabela nova e não hábito: hábito é booleano por dia ("bebi água hoje"), e aqui o valor é
-- contínuo (78,4 kg), medido em datas irregulares, e o que importa é a série histórica — não a
-- aderência. Nada disso cabe em `habit`/`habit_log`.
--
-- IMC **não** é coluna: sai de peso + altura e ficaria inconsistente assim que um dos dois mudasse.
-- A altura entra como métrica normal (`metric_type = 'height'`) e o IMC é derivado no cliente
-- (`src/domain/health/metrics.ts`).
--
-- Dado de saúde é sensível: RLS estritamente por `user_id = auth.uid()` nas quatro operações, sem
-- exceção — nenhuma policy de leitura compartilhada, nem por projeto, nem por convite.

create table if not exists public.health_metric (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_type text not null,
  value numeric not null,
  recorded_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint health_metric_type_check check (
    metric_type in ('weight', 'height', 'waist', 'hip', 'chest', 'arm')
  )
);

-- O dashboard lê "as medições mais recentes deste usuário, por tipo" — é exatamente esta ordem.
create index if not exists health_metric_user_type_date_idx
  on public.health_metric (user_id, metric_type, recorded_date desc);

comment on table public.health_metric is
  'Medições corporais ao longo do tempo (feature 063) — uma linha por medição. IMC não é guardado: '
  'é derivado de peso + altura no cliente.';
comment on column public.health_metric.metric_type is
  'weight | height | waist | hip | chest | arm — o check é o contrato que MetricType '
  '(src/types/health.ts) espelha. Mexeu num, mexe no outro.';
comment on column public.health_metric.value is
  'Valor da medição na unidade do tipo: kg para weight, cm para os demais.';

alter table public.health_metric enable row level security;

drop policy if exists health_metric_select_own on public.health_metric;
create policy health_metric_select_own on public.health_metric
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists health_metric_insert_own on public.health_metric;
create policy health_metric_insert_own on public.health_metric
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists health_metric_update_own on public.health_metric;
create policy health_metric_update_own on public.health_metric
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists health_metric_delete_own on public.health_metric;
create policy health_metric_delete_own on public.health_metric
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui `health_metric` no wipe de conta (lista mais recente de wipe_own_data, copiada de
-- 20260816160000_notes_core.sql).
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
    'health_metric'
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
    raise notice 'enforce_app_access ausente — skip trigger health_metric';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.health_metric;
  create trigger trg_enforce_app_access
    before insert or update or delete on public.health_metric
    for each row execute function public.enforce_app_access();
end;
$$;
