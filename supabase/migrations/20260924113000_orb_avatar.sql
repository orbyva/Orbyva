-- Feature 151: onde mora uma versão da Orb gerada por IA — a base das features 152 (gerar), 153
-- (tela) e 154 (mostrar na esfera). Nada aqui gera imagem nem desenha tela.
--
-- Hoje a Orb não tem imagem nenhuma: a esfera é CSS (`src/components/orb/OrbSphere.tsx` +
-- `src/index.css`). Para o app poder mostrar uma versão gerada, primeiro precisa existir onde
-- guardá-la.
--
-- Por que uma linha por geração, e não uma coluna sobrescrita: o pedido foi "versões", no plural.
-- Sobrescrever a anterior perderia o material de comparação — e o `prompt`/`model` guardados são o
-- que permite repetir uma versão que deu certo depois que o secret do modelo mudar.
--
-- Por que "qual é a ativa" mora aqui e não em `public.profiles`: `profiles` **não tem** policy de
-- UPDATE para `authenticated` — `20240101000300_billing.sql:30-31` a deixa de fora de propósito
-- ("billing só via service_role + trigger") e `20240101001200_security_hardening.sql:46` a derruba
-- de novo; nenhuma migration a recria. Uma coluna lá exigiria abrir escrita na tabela de billing
-- (ou uma RPC própria) por uma preferência cosmética. O índice único parcial lá embaixo resolve o
-- mesmo problema dentro desta tabela, com a RLS dela.

create table if not exists public.orb_avatar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- O que foi pedido ao modelo. Guardado para repetir/variar uma versão que deu certo.
  prompt text not null,
  url text not null,
  -- Qual modelo gerou. O secret `ORB_IMAGE_MODEL` muda; a linha registra o que valia na hora.
  model text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  -- O mesmo arquivo duas vezes na galeria do dono é engano, não intenção. Cada geração escreve um
  -- uuid próprio no bucket, então duas linhas só colidem quando são de fato o mesmo arquivo.
  constraint orb_avatar_unique_url unique (user_id, url)
);

-- A consulta da galeria: "minhas versões, mais recentes primeiro". Começa por `user_id`, que é
-- também o escopo que a RLS exige.
create index if not exists orb_avatar_user_created_idx
  on public.orb_avatar (user_id, created_at desc);

-- É ESTE índice que garante "no máximo uma ativa por dono" — não a aplicação, não a RPC. Parcial
-- (`where is_active`) porque zero ativas é estado válido: sem nenhuma, o app cai na esfera CSS de
-- sempre, e um unique cheio proibiria a segunda linha inativa.
create unique index if not exists orb_avatar_one_active_idx
  on public.orb_avatar (user_id)
  where is_active;

comment on table public.orb_avatar is
  'Versões da Orb geradas por IA (feature 151): cada linha é uma geração, com o arquivo PNG no '
  'bucket orb-avatars em {userId}/{uuid}.png. No máximo uma ativa por dono (índice parcial '
  'orb_avatar_one_active_idx); nenhuma ativa é estado válido e faz o app cair na esfera CSS. '
  'Excluir a linha apaga TAMBÉM o arquivo no bucket — nada mais aponta para a URL.';

comment on column public.orb_avatar.prompt is
  'O pedido enviado ao modelo de imagem. Guardado para repetir ou variar uma versão que deu certo.';
comment on column public.orb_avatar.url is
  'URL pública do PNG no bucket orb-avatars, em {userId}/{uuid}.png.';
comment on column public.orb_avatar.model is
  'Modelo que gerou esta versão (valor de ORB_IMAGE_MODEL na hora da geração) — o secret muda, a '
  'linha registra o que valia.';
comment on column public.orb_avatar.is_active is
  'A versão que o app mostra. No máximo uma por dono, garantido por orb_avatar_one_active_idx; '
  'troque sempre pela RPC public.orb_avatar_set_active, nunca por dois updates do cliente.';

alter table public.orb_avatar enable row level security;

drop policy if exists orb_avatar_select_own on public.orb_avatar;
create policy orb_avatar_select_own on public.orb_avatar
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists orb_avatar_insert_own on public.orb_avatar;
create policy orb_avatar_insert_own on public.orb_avatar
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists orb_avatar_update_own on public.orb_avatar;
create policy orb_avatar_update_own on public.orb_avatar
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists orb_avatar_delete_own on public.orb_avatar;
create policy orb_avatar_delete_own on public.orb_avatar
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.orb_avatar to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Trocar a versão ativa é UMA chamada, não dois updates do cliente.
--
-- Com o índice único parcial, a ordem errada (ligar a nova antes de desligar a velha) viola a
-- constraint, e duas chamadas separadas podem parar no meio — deixando o dono sem nenhuma ativa
-- porque a rede caiu entre o `update ... false` e o `update ... true`. Aqui as duas escritas são
-- uma transação só, na ordem certa.
--
-- `security definer` para que a função seja a única forma de escrever `is_active`, com o escopo do
-- dono verificado dentro dela — por isso todo `where` abaixo carrega `user_id = uid`
-- explicitamente: sem RLS por baixo, o filtro do dono é a única fronteira que sobra.
create or replace function public.orb_avatar_set_active(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  -- Existe e é minha? Checar antes de desligar evita o caso em que um id errado deixaria o dono
  -- sem nenhuma versão ativa, silenciosamente.
  perform 1 from public.orb_avatar where id = p_id and user_id = uid;
  if not found then
    raise exception 'Versão da Orb % não encontrada', p_id;
  end if;

  update public.orb_avatar
     set is_active = false
   where user_id = uid and is_active and id <> p_id;

  update public.orb_avatar
     set is_active = true
   where id = p_id and user_id = uid and not is_active;
  get diagnostics n = row_count;

  -- `n = 0` só acontece quando a linha já estava ativa (o `perform` acima já provou que ela existe
  -- e é do dono): ativar a ativa é no-op, não erro.
  if n > 1 then
    raise exception 'orb_avatar_set_active ativou % linhas — esperada 1', n;
  end if;
end;
$$;

comment on function public.orb_avatar_set_active(uuid) is
  'Troca a versão ativa da Orb do usuário autenticado, numa transação só. Levanta exceção se o id '
  'não for de uma versão do próprio dono. É a única forma suportada de escrever is_active: dois '
  'updates do cliente podem violar orb_avatar_one_active_idx pela ordem, ou parar no meio.';

grant execute on function public.orb_avatar_set_active(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Inclui `orb_avatar` no wipe de conta.
--
-- A lista abaixo é a de `20260823120000_link_icon_rule.sql:124-156` (a redefinição mais recente de
-- `wipe_own_data`) com uma entrada acrescentada — não reescrita de memória. Ela é uma linha a mais
-- do que a de `20260823110000_icon_asset.sql`, que ainda não conhecia `link_icon_rule`.
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
    raise notice 'enforce_app_access ausente — skip trigger orb_avatar';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.orb_avatar;
  create trigger trg_enforce_app_access before insert or update or delete on public.orb_avatar
    for each row execute function public.enforce_app_access();
end $$;

-- ---------------------------------------------------------------------------------------------
-- Bucket próprio, não `task-icons`.
--
-- O de lá foi dimensionado para ícone pequeno: teto de 1 MB (`20260814010000_task_icon.sql:15-23`),
-- e um PNG de 1024² estoura isso com folga. Teto de 5 MB aqui, e só `image/png` — a geração (152)
-- produz PNG, e aceitar mais formatos abriria a porta para arquivo que a tela não sabe mostrar.
--
-- Caminho `{userId}/{uuid}.png`: as policies são ancoradas em
-- `(storage.foldername(name))[1] = auth.uid()::text`, igual `task-icons` — é o primeiro segmento
-- que prende o arquivo ao dono.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage.buckets ausente — skip bucket orb-avatars';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('orb-avatars', 'orb-avatars', true, 5242880, array['image/png'])
  on conflict (id) do nothing;
end $$;

drop policy if exists orb_avatars_public_read on storage.objects;
create policy orb_avatars_public_read on storage.objects
  for select to public
  using (bucket_id = 'orb-avatars');

drop policy if exists orb_avatars_insert_own on storage.objects;
create policy orb_avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'orb-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists orb_avatars_update_own on storage.objects;
create policy orb_avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'orb-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'orb-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists orb_avatars_delete_own on storage.objects;
create policy orb_avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'orb-avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
