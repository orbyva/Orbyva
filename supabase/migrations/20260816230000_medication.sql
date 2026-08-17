-- Controle de medicamentos (feature 064): a medicação vira entidade própria e a `task` continua
-- sendo a **dose**.
--
-- Por que promover: desde a 049 uma medicação era só `task.is_medication` + `recurrence_rule`, e
-- `recurrence_rule` tem um `time` **singular** compartilhado com todas as tarefas comuns do app.
-- "1 comprimido de manhã e 1 à noite" só existia como duas medicações desconexas. O gap é de
-- modelo, não de UI — multiplicar `time` distorceria a recorrência para o resto do app.
--
-- O vínculo é o mesmo padrão de `linked_recurring_id` + `linked_installment_number` (feature 002):
-- entidade de domínio de um lado, tarefas materializadas do outro, ligadas por
-- `medication_id` + `dose_time`.
--
-- `is_medication` **continua existindo** e continua sendo a flag de renderização (`TaskList`,
-- `ProjectDetail`, calendário já dependem dela). `medication_id` é a fonte da verdade do
-- tratamento; `is_medication` responde "esta tarefa se desenha como dose".
--
-- Dado de saúde é sensível: RLS estritamente por `user_id = auth.uid()` nas quatro operações, sem
-- exceção — nenhuma leitura compartilhada, nem por projeto, nem por convite.

create table if not exists public.medication (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  dose_amount numeric,
  dose_unit text,
  instructions text,
  -- N horários por dia, que é o gap que a 049 não conseguia cobrir. Descartada uma tabela
  -- `medication_schedule`: seria uma tabela só para uma lista de horários, sem atributo próprio.
  times time[] not null,
  interval_days int not null default 1,
  started_on date not null,
  ended_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint medication_times_check check (coalesce(array_length(times, 1), 0) >= 1),
  constraint medication_interval_days_check check (interval_days > 0)
);

-- A materialização lê "os tratamentos ativos deste usuário" a cada carga de tarefas.
create index if not exists medication_user_active_idx
  on public.medication (user_id, active);

comment on table public.medication is
  'Tratamento medicamentoso (feature 064) — nome, posologia, horários e período. Cada dose '
  'continua sendo uma linha em public.task, ligada por medication_id + dose_time.';
comment on column public.medication.times is
  'Horários do dia em que a dose é tomada. A materialização gera uma task por (data x horário) — '
  'é o que permite "1 de manhã e 1 à noite" numa medicação só.';
comment on column public.medication.dose_amount is
  'Quantidade por dose (ex.: 2). Separada de dose_unit para ser comparável e compor o título da '
  'dose em formatDoseTitle (src/domain/health/medication.ts).';
comment on column public.medication.interval_days is
  'A cada quantos dias a medicação se repete (1 = todo dia). Substitui o `interval` da '
  'recurrence_rule que a 049 usava.';
comment on column public.medication.active is
  'Encerrar um tratamento zera active (não apaga a linha): o histórico de doses já tomadas e a '
  'adesão do período continuam válidos.';

alter table public.medication enable row level security;

drop policy if exists medication_select_own on public.medication;
create policy medication_select_own on public.medication
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists medication_insert_own on public.medication;
create policy medication_insert_own on public.medication
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists medication_update_own on public.medication;
create policy medication_update_own on public.medication
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists medication_delete_own on public.medication;
create policy medication_delete_own on public.medication
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- a dose, do lado da task ------------------------------------------------------------------
-- `on delete set null`: apagar o tratamento não pode evaporar o histórico de doses já tomadas.
alter table public.task
  add column if not exists medication_id uuid references public.medication(id) on delete set null;
alter table public.task
  add column if not exists dose_time time;

comment on column public.task.medication_id is
  'Tratamento (public.medication) do qual esta task é uma dose — feature 064. Séries com esta '
  'coluna preenchida são excluídas de materializeRecurringInstances: quem gera as doses é '
  'materializeMedicationDoses, e os dois caminhos juntos duplicariam doses no calendário.';
comment on column public.task.dose_time is
  'Horário do tratamento a que esta dose corresponde (um dos elementos de medication.times). '
  'Junto com due_date é a chave que impede a mesma dose de ser materializada duas vezes.';

create index if not exists task_medication_due_idx
  on public.task (medication_id, due_date);

-- Inclui `medication` no wipe de conta. Vem **depois** de 'task' na lista: a dose é filha do
-- tratamento (medication_id), então apagar as tasks primeiro evita o `set null` em massa antes do
-- delete do pai. Lista copiada da versão mais recente (20260816210000_health_metric.sql).
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
    'medication'
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
    raise notice 'enforce_app_access ausente — skip trigger medication';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.medication;
  create trigger trg_enforce_app_access
    before insert or update or delete on public.medication
    for each row execute function public.enforce_app_access();
end;
$$;
