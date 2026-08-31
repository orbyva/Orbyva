-- Módulo de Notas — núcleo (feature 055): nota markdown com título, conteúdo e vínculo opcional a
-- um projeto. RLS estritamente por user_id, sem soft-delete. Modelagem espelha `project_event`
-- (feature 006): entidade satélite com `user_id` + FK para `project`.

create table if not exists public.note (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.project(id) on delete set null,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A lista de notas é sempre "as minhas, mais recentes primeiro" — este índice cobre a consulta.
create index if not exists note_user_updated_idx
  on public.note (user_id, updated_at desc);
create index if not exists note_project_idx
  on public.note (project_id);

comment on table public.note is
  'Notas em Markdown do usuário — título + conteúdo, com vínculo opcional a um projeto; '
  'excluir o projeto não apaga a nota, só desfaz o vínculo (on delete set null).';

alter table public.note enable row level security;

drop policy if exists note_select_own on public.note;
create policy note_select_own on public.note
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists note_insert_own on public.note;
create policy note_insert_own on public.note
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists note_update_own on public.note;
create policy note_update_own on public.note
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists note_delete_own on public.note;
create policy note_delete_own on public.note
  for delete to authenticated
  using (user_id = auth.uid());

-- Inclui `note` no wipe de conta (lista mais recente de wipe_own_data, copiada de
-- 20260816130000_shopping_list.sql). Vem antes de `project` porque tem FK para ele.
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
    raise notice 'enforce_app_access ausente — skip trigger note';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.note;
  create trigger trg_enforce_app_access before insert or update or delete on public.note
    for each row execute function public.enforce_app_access();
end $$;

-- Migração de `project.notes` (feature 006) para o módulo novo: COPIA, não move.
--
-- A coluna `public.project.notes` continua existindo, com o conteúdo original intocado — é
-- deliberado, não esquecimento. Este é o banco remoto, com dados reais, e não há Supabase local
-- para ensaiar: copiar e dropar na mesma transação tornaria irreversível qualquer erro no filtro
-- abaixo. A UI para de ler e escrever a coluna nesta mesma feature, então ela fica órfã de
-- propósito, como rede de segurança. O `drop column` é a última tarefa da feature 058 e depende de
-- confirmação explícita do usuário. NÃO adicionar `drop column` aqui.
--
-- O `btrim` leva a lista de caracteres explícita: `btrim(x)` sem argumento remove só ESPAÇO, então
-- uma nota com apenas quebras de linha/tabs (`'   \n\t '`) passaria pelo filtro e viraria uma nota
-- vazia no módulo novo. Verificado em Postgres 16.
--
-- O `not exists` só existe para a reaplicação da migration ser idempotente (não duplicar notas);
-- na primeira aplicação ele não filtra nada.
--
-- `EXECUTE`: o remoto deste push (2026-08-31) não tem `project.notes` (SQLSTATE 42703). A 006
-- (`20260806130000`) já estava no histórico sem a coluna — o `create table if not exists` do
-- baseline não recria, e o `add column` da 006 não rodou de novo. SQL estático no `DO` ainda
-- planeja `p.notes` e quebra; dinâmico só avalia se a coluna existe. Sem a coluna não há o que
-- copiar. Esta migration falhou e não entrou no histórico — edição no lugar.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project'
      and column_name = 'notes'
  ) then
    execute $ins$
      insert into public.note (user_id, project_id, title, content)
      select p.user_id, p.id, 'Notas do projeto', p.notes
      from public.project p
      where p.notes is not null
        and btrim(p.notes, E' \t\r\n') <> ''
        and not exists (
          select 1
          from public.note n
          where n.project_id = p.id
            and n.title = 'Notas do projeto'
        )
    $ins$;
  else
    raise notice 'project.notes ausente — skip cópia para note';
  end if;
end $$;
