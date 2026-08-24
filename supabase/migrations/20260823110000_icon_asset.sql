-- Feature 086: a biblioteca de ícones do usuário — a metade "e aí esse ícone já fica salvo também
-- na lista" do pedido-mãe.
--
-- Até aqui não havia lista nenhuma: cada tarefa tinha o seu arquivo em
-- `task-icons/{userId}/{taskId}.{ext}` (feature 035) e reusar um ícone significava reenviar o mesmo
-- arquivo. Esta tabela é a lista, e o caminho no bucket passa a ser por **ícone**
-- (`{userId}/library/{uuid}.{ext}`), não por tarefa.
--
-- Por que uma tabela e não `storage.list()` do bucket: listar objetos não dá nome (o arquivo é um
-- uuid), não dá ordem estável e vaza a estrutura de pastas para o cliente. Nome e ordem são o que
-- a lista precisa ter.
--
-- Nada aqui guarda **markup**: o SVG colado é sanitizado no cliente (`prepareSvgIcon`,
-- `src/domain/tasks/svgIcon.ts`) e gravado como arquivo, e `url` é só a URL pública dele. Guardar
-- o markup numa coluna convidaria a render inline, que é exatamente o que a 055 desligou no app
-- inteiro — o consumo é sempre por `<img>`, que roda SVG em modo restrito.

create table if not exists public.icon_asset (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Rótulo da lista, editável. Não tem relação com o nome do arquivo no bucket, que é um uuid.
  name text not null,
  url text not null,
  created_at timestamptz not null default now(),
  -- O mesmo arquivo duas vezes na biblioteca é engano, não intenção — e é o que torna a cópia de
  -- dado lá embaixo idempotente sem precisar de `not exists`. Cada upload gera um uuid próprio,
  -- então duas linhas só colidem quando são de fato o mesmo arquivo.
  constraint icon_asset_unique_url unique (user_id, url)
);

-- A única consulta da tabela: "meus ícones, mais recentes primeiro" (a seção do popover do
-- seletor). Começa por `user_id`, que é também o escopo que a RLS exige.
create index if not exists icon_asset_user_created_idx
  on public.icon_asset (user_id, created_at desc);

comment on table public.icon_asset is
  'Biblioteca de ícones do usuário (feature 086): cada linha é um arquivo no bucket task-icons, '
  'em {userId}/library/{uuid}.{ext}, com um nome editável. Guarda a URL pública, nunca o markup — '
  'o SVG colado é sanitizado antes do upload e sempre consumido por <img>. Excluir a linha NÃO '
  'apaga o arquivo: tarefas que já usam aquela URL continuam mostrando o ícone.';

comment on column public.icon_asset.name is
  'Rótulo da lista, editável pelo usuário. Sem relação com o nome do arquivo no bucket (um uuid).';
comment on column public.icon_asset.url is
  'URL pública do arquivo no bucket task-icons — o mesmo valor que vai para task.icon_url.';

alter table public.icon_asset enable row level security;

drop policy if exists icon_asset_select_own on public.icon_asset;
create policy icon_asset_select_own on public.icon_asset
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists icon_asset_insert_own on public.icon_asset;
create policy icon_asset_insert_own on public.icon_asset
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists icon_asset_update_own on public.icon_asset;
create policy icon_asset_update_own on public.icon_asset
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists icon_asset_delete_own on public.icon_asset;
create policy icon_asset_delete_own on public.icon_asset
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.icon_asset to authenticated;

-- Inclui `icon_asset` no wipe de conta. Não tem FK para `task` (a ligação é pela URL, não por id),
-- então a posição na lista é livre — fica junto das tabelas de tarefa por parentesco temático.
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
    raise notice 'enforce_app_access ausente — skip trigger icon_asset';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.icon_asset;
  create trigger trg_enforce_app_access before insert or update or delete on public.icon_asset
    for each row execute function public.enforce_app_access();
end $$;

-- ---------------------------------------------------------------------------------------------
-- O bucket `task-icons` não precisa mudar de forma — só de garantia.
--
-- `20260814010000_task_icon.sql` já o criou público, com teto de 1 MB e `image/svg+xml` entre os
-- mimes aceitos, e as policies dele são ancoradas em `(storage.foldername(name))[1] =
-- auth.uid()::text`. Isso continua valendo com a subpasta nova: para `{uid}/library/{uuid}.svg`,
-- `storage.foldername` devolve `{uid, library}` e o `[1]` continua sendo o dono — nenhuma policy
-- precisa ser reescrita (e reescrevê-las à toa é risco puro num banco compartilhado).
--
-- O `update` abaixo é no-op quando o bucket veio daquela migration; existe porque o `on conflict
-- (id) do nothing` de lá **preserva** um bucket criado antes, que poderia ter sido criado sem o
-- mime de SVG — e sem ele o "colar SVG" desta feature falharia no upload, não na validação.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets ausente — skip ajuste do bucket task-icons';
    return;
  end if;

  update storage.buckets
     set allowed_mime_types = (
           select array_agg(distinct m)
             from unnest(
               coalesce(allowed_mime_types, array[]::text[])
               || array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
             ) as m
         ),
         file_size_limit = greatest(coalesce(file_size_limit, 0), 1048576)
   where id = 'task-icons'
     and (
       not (allowed_mime_types @> array['image/svg+xml'])
       or allowed_mime_types is null
       or coalesce(file_size_limit, 0) < 1048576
     );
end $$;

-- ---------------------------------------------------------------------------------------------
-- Cópia do dado antigo: cada `icon_url` distinto que já existe em `task` vira uma linha da
-- biblioteca. Sem isto a lista nasceria vazia mesmo para quem já enviou ícones, o que pareceria
-- perda de dado — e os ícones antigos seguiriam funcionando (a URL é absoluta) sem estar na lista.
--
-- Idempotente pelo `unique (user_id, url)`: reaplicar não duplica nada, e o `do nothing` também
-- protege o caso de o usuário já ter renomeado a linha depois do primeiro push.
--
-- O nome sai do nome do arquivo, como manda a decisão — mas o caminho antigo é
-- `{userId}/{taskId}.{ext}`, então o "nome do arquivo" quase sempre é um uuid, que não diria nada
-- na lista. Quando for esse o caso (ou quando não sobrar nome nenhum), cai para "Ícone N",
-- numerado por usuário e estável entre reaplicações porque a ordem é a da própria URL.
with candidates as (
  select distinct t.user_id, t.icon_url as url
    from public.task t
   where t.icon_url is not null
     and btrim(t.icon_url) <> ''
), named as (
  select c.user_id,
         c.url,
         regexp_replace(
           regexp_replace(split_part(split_part(c.url, '?', 1), '#', 1), '^.*/', ''),
           '\.[a-z0-9]+$', '', 'i'
         ) as file_base,
         row_number() over (partition by c.user_id order by c.url) as n
    from candidates c
)
insert into public.icon_asset (user_id, name, url)
select n.user_id,
       case
         when n.file_base = ''
           or n.file_base ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         then 'Ícone ' || n.n
         else n.file_base
       end,
       n.url
  from named n
on conflict on constraint icon_asset_unique_url do nothing;
