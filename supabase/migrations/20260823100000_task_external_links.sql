-- Feature 085: links externos da tarefa deixam de ser **um** par de colunas em `task`
-- (`external_url`/`external_provider`, feature 013) e viram uma tabela própria — vários links por
-- tarefa, cada um com um comentário livre e uma ordem.
--
-- Por que tabela e não `jsonb`: um array perderia o índice `(user_id, task_id)` e a RLS por linha,
-- e o `unique (task_id, url)` — "o mesmo link duas vezes na mesma tarefa é engano, não intenção" —
-- não teria como existir.
--
-- `external_provider` **não** vira coluna aqui de propósito: provider/ícone é derivado da URL em
-- tempo de render (`describeExternalLink`, `src/domain/tasks/externalLink.ts`), e a feature 087 vai
-- trocar essa derivação por regras configuráveis pelo usuário. Gravar o resultado congelaria uma
-- decisão que o usuário passa a poder mudar depois.
--
-- As colunas antigas de `task` continuam existindo, com o conteúdo original, como rede de
-- segurança — mesma tática que a 055 usou com `project.notes`. O app para de ler e de escrever
-- nelas nesta feature; o `drop column` é tarefa própria e bloqueada, só depois de o usuário
-- conferir que nenhum link se perdeu (ver a última tarefa de
-- `docs/features/085-links-externos-multiplos-com-comentario.md`).

create table if not exists public.task_external_link (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.task(id) on delete cascade,
  url text not null,
  -- "por que este link importa" — anotação curta do usuário, o pedido-mãe desta feature.
  comment text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint task_external_link_unique_url unique (task_id, url)
);

-- Os links de uma tarefa (seção do formulário) e o lote da página inteira
-- (`fetchExternalLinksForTasks`) — os dois caminhos começam por `user_id`, que é também o escopo
-- que a RLS exige.
create index if not exists task_external_link_user_task_idx
  on public.task_external_link (user_id, task_id);

comment on table public.task_external_link is
  'Links externos de uma tarefa (feature 085): vários por tarefa, cada um com comentário livre e '
  'ordem manual (`position`, 0..n-1). Substitui task.external_url/external_provider, que seguem '
  'existindo só como rede de segurança até o drop da 085. Provider/ícone NÃO é gravado: é derivado '
  'da URL no cliente (describeExternalLink), porque a feature 087 torna essa derivação '
  'configurável.';

comment on column public.task_external_link.comment is
  'Comentário livre do usuário sobre o link — aparece no title do chip nos cards.';
comment on column public.task_external_link.position is
  'Ordem manual do link dentro da tarefa (0..n-1), reescrita inteira a cada save. Define quais '
  'links entram nos 3 chips visíveis do card e qual vira o "+N".';

alter table public.task_external_link enable row level security;

drop policy if exists task_external_link_select_own on public.task_external_link;
create policy task_external_link_select_own on public.task_external_link
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists task_external_link_insert_own on public.task_external_link;
create policy task_external_link_insert_own on public.task_external_link
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists task_external_link_update_own on public.task_external_link;
create policy task_external_link_update_own on public.task_external_link
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists task_external_link_delete_own on public.task_external_link;
create policy task_external_link_delete_own on public.task_external_link
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.task_external_link to authenticated;

-- Inclui `task_external_link` no wipe de conta, **antes** de `task`: tem FK para ela, e o
-- `on delete cascade` só cobriria a ordem inversa por acidente.
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

  -- Antes do loop: os convites do dono (feature 076). O `on delete cascade` de `event_id` já
  -- levaria os convites junto com os eventos, mas o delete explícito também cobre convite cujo
  -- evento já sumiu.
  if to_regclass('public.event_invite') is not null then
    delete from public.event_invite where created_by = uid;
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
    'task_external_link',
    'task',
    'project_event',
    'note',
    'project',
    'tag',
    'content_link',
    'shopping_item',
    'shopping_category',
    'health_metric',
    'reminder_preference',
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
    raise notice 'enforce_app_access ausente — skip trigger task_external_link';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.task_external_link;
  create trigger trg_enforce_app_access before insert or update or delete on public.task_external_link
    for each row execute function public.enforce_app_access();
end $$;

-- Cópia do dado antigo: cada tarefa com `external_url` ganha o primeiro link da lista nova.
-- Idempotente pelo `unique (task_id, url)` — reaplicar a migration não duplica nada, e o
-- `on conflict do nothing` também protege o caso de o usuário já ter editado a lista depois do
-- primeiro push.
insert into public.task_external_link (user_id, task_id, url, position)
select user_id, id, external_url, 0
  from public.task
 where external_url is not null
   and btrim(external_url) <> ''
on conflict on constraint task_external_link_unique_url do nothing;
