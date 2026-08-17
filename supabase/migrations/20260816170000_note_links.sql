-- Módulo de Notas — vínculo com qualquer entidade (feature 056): a parte "CONVERSAM COM TUDO" do
-- prompt-mãe. Primeira referência polimórfica do banco.
--
-- Não dá para ter FK apontando para 10 tabelas diferentes, então a integridade vem de três lados:
--   (a) RLS por user_id na própria note_link;
--   (b) entity_type restrito por `check` a uma lista fechada — é o contrato com
--       `src/types/notes.ts` (`NoteLinkEntityType`), e mexer aqui obriga a mexer lá;
--   (c) a UI só oferece entidades que o usuário possui.
-- Link órfão (entidade apagada) é tolerado e a UI mostra "referência removida"; descartado trigger
-- de limpeza por tabela, que seria um trigger por módulo do app para um ganho cosmético.
--
-- `note.project_id` (feature 055) continua sendo o vínculo primário — este aqui cobre os
-- secundários, N:N. Ver Decisões da feature 056.

create table if not exists public.note_link (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  note_id uuid not null references public.note(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  label text,
  created_at timestamptz not null default now(),
  constraint note_link_entity_type_check check (entity_type in (
    'project','task','book','movie','album','trip','place','goal','habit','vehicle'
  )),
  constraint note_link_unique_entity unique (note_id, entity_type, entity_id)
);

-- Os vínculos de uma nota (painel do editor).
create index if not exists note_link_user_note_idx
  on public.note_link (user_id, note_id);
-- A consulta reversa: "quais notas falam desta meta/livro/viagem?" — é o que faz o vínculo
-- aparecer do outro lado, na página da entidade.
create index if not exists note_link_user_entity_idx
  on public.note_link (user_id, entity_type, entity_id);

comment on table public.note_link is
  'Vínculo N:N entre uma nota e qualquer entidade do app (entity_type + entity_id, sem FK — '
  'referência polimórfica). RLS por user_id; entity_type restrito por check. Link órfão é '
  'tolerado: a UI mostra "referência removida".';

alter table public.note_link enable row level security;

drop policy if exists note_link_select_own on public.note_link;
create policy note_link_select_own on public.note_link
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists note_link_insert_own on public.note_link;
create policy note_link_insert_own on public.note_link
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists note_link_update_own on public.note_link;
create policy note_link_update_own on public.note_link
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists note_link_delete_own on public.note_link;
create policy note_link_delete_own on public.note_link
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui `note_link` no wipe de conta. Vem antes de `note` porque tem FK para ela (a mesma razão
-- pela qual `note` vem antes de `project`).
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
    'note_link',
    'note',
    'project',
    'tag',
    'content_link',
    'shopping_item',
    'shopping_category'
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
    raise notice 'enforce_app_access ausente — skip trigger note_link';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.note_link;
  create trigger trg_enforce_app_access before insert or update or delete on public.note_link
    for each row execute function public.enforce_app_access();
end $$;
