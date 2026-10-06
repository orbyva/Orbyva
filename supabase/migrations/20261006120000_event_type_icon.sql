-- Feature 258: "poder personalizar os tipos do evento, adicionando um ícone (da biblioteca de
-- ícones gerais do orbyva)".
--
-- O ícone de uma linha do roteiro era **código**: `PLACE_TYPE_META` mapeia cada tipo para um ícone
-- lucide fixo, e um concerto, um encontro ou uma peça caem em "Passeio"/"Outro" e desenham câmera ou
-- alfinete. Esta tabela inverte isso para o mesmo lado que a feature 087 já inverteu os ícones de
-- link: a escolha vira dado do usuário.
--
-- Por que tabela e não `jsonb` numa coluna de preferências: cada tipo é escrito, trocado e apagado
-- sozinho, com RLS por linha — a alternativa seria reescrever um documento inteiro a cada clique,
-- com a corrida que isso traz quando duas abas estão abertas.
--
-- A tabela nasce **vazia**: sem linha, o tipo desenha o ícone padrão de sempre. Personalização é
-- preferência, e escrever preferência por migration decidiria pelo usuário.

create table if not exists public.event_type_icon (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A chave do tipo de evento (`TripActivityCategory`: restaurant, cafe, bar, attraction, hotel,
  -- park, museum, shop, other). Texto livre de propósito: o conjunto mora no cliente
  -- (`EVENT_TYPE_CATEGORIES`), e um `check` com a lista obrigaria uma migration a cada tipo novo —
  -- linha com categoria que o cliente não conhece é simplesmente ignorada na leitura.
  --
  -- `transport` não é oferecido pela interface (deslocamento não é um tipo de evento: o ícone dele
  -- é o modo de transporte), mas isso é escopo de UI, não integridade de dado, e por isso não vira
  -- `check` aqui.
  category text not null,
  -- Preset de `TASK_ICON_PRESETS` **ou** URL de um ícone da biblioteca (feature 086) — exatamente o
  -- par de `task.icon_key`/`icon_url` e de `link_icon_rule`.
  icon_key text,
  icon_url text,
  created_at timestamptz not null default now(),
  -- Um tipo, um ícone. É o que faz o upsert por (user_id, category) ser possível e o que impede a
  -- lista de ter duas respostas para "qual é o ícone de museu?".
  constraint event_type_icon_unique_category unique (user_id, category),
  constraint event_type_icon_category_check
    check (char_length(btrim(category)) > 0 and char_length(category) <= 40),
  -- Exatamente um dos dois. Nenhum seria uma linha que não personaliza nada (tirar o ícone é
  -- **apagar a linha**); os dois seria a UI tendo de escolher qual vence, que é a ambiguidade que a
  -- exclusividade de `task.icon_key`/`icon_url` já evita em todo o resto do app.
  constraint event_type_icon_one_source
    check (num_nonnulls(icon_key, icon_url) = 1)
);

-- A única consulta da tabela: "meus ícones de tipo" — lida uma vez por sessão (cache de módulo em
-- `useEventTypeIcons`) e reescrita pelo seletor. Começa por `user_id`, que é o escopo da RLS.
create index if not exists event_type_icon_user_idx
  on public.event_type_icon (user_id);

comment on table public.event_type_icon is
  'Ícone personalizado por tipo de evento do roteiro (feature 258): uma linha por (user_id, '
  'category), com preset lucide OU URL da biblioteca de ícones (feature 086). Sem linha, o tipo '
  'desenha o ícone padrão de PLACE_TYPE_META. Tirar a personalização é apagar a linha, não gravar '
  'dois nulos.';

comment on column public.event_type_icon.category is
  'Chave do tipo de evento (mesmo conjunto de PlaceType). Texto livre: o catálogo mora no cliente, '
  'e categoria desconhecida é ignorada na leitura em vez de virar erro.';
comment on column public.event_type_icon.icon_url is
  'URL pública de um ícone da biblioteca (feature 086). Guarda a URL, e não o id de icon_asset, de '
  'propósito: excluir o ícone da biblioteca tira da lista sem apagar o arquivo, e o tipo que já '
  'apontava para ele continua desenhando o mesmo ícone.';

alter table public.event_type_icon enable row level security;

drop policy if exists event_type_icon_select_own on public.event_type_icon;
create policy event_type_icon_select_own on public.event_type_icon
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists event_type_icon_insert_own on public.event_type_icon;
create policy event_type_icon_insert_own on public.event_type_icon
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists event_type_icon_update_own on public.event_type_icon;
create policy event_type_icon_update_own on public.event_type_icon
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists event_type_icon_delete_own on public.event_type_icon;
create policy event_type_icon_delete_own on public.event_type_icon
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.event_type_icon to authenticated;

-- Inclui `event_type_icon` no wipe de conta. A lista abaixo é a de
-- `20260924113000_orb_avatar.sql` (a mais recente) com uma entrada a mais — copiada de lá, não
-- escrita de memória. Sem FK para viagem nenhuma (a personalização é do usuário), então fica ao
-- lado de `icon_asset` e `link_icon_rule`, os outros catálogos de aparência.
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
    'icon_asset',
    'link_icon_rule',
    'event_type_icon',
    'orb_avatar',
    'project_event',
    'note',
    'note_folder',
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
    raise notice 'enforce_app_access ausente — skip trigger event_type_icon';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.event_type_icon;
  create trigger trg_enforce_app_access before insert or update or delete on public.event_type_icon
    for each row execute function public.enforce_app_access();
end $$;
