-- Feature 102: assets de uma linha do roteiro — arquivo ou link pendurado numa visita ou num
-- deslocamento.
--
-- Até aqui `trip_itinerary_activity` guardava **um** link (`link_url`) e nenhum arquivo: o cartão
-- de embarque do voo, o PDF da reserva e o ingresso do museu viviam fora do app, justamente onde
-- não estão quando o deslocamento acontece.
--
-- Uma tabela só para os dois tipos de linha do roteiro. Visita e deslocamento não querem modelos
-- diferentes — os dois querem "coisas importantes anexadas a esta linha" — e `trip_itinerary_day`
-- já é o lugar onde a diferença entre eles mora (`category = 'transport'`).
--
-- `link_url` **continua existindo e em uso**: é o link canônico da atividade (o chip "Maps" do
-- card), não um asset. Esta tabela é para o *resto*, e não migra nada.

create table if not exists public.trip_activity_asset (
  id uuid primary key default gen_random_uuid(),

  -- Denormalizado de propósito, mesmo havendo `activity_id`. Duas razões, ambas medidas:
  --   1. `fetchTripDetailBundle` baixa os assets da viagem na **wave 1**, em paralelo com
  --      expenses/days/places. Sem `trip_id` isso seria uma terceira wave, que só poderia começar
  --      depois de as atividades chegarem — uma ida serial ao banco em toda abertura de viagem.
  --   2. A RLS abaixo fica igual à de `trip_milestone` (`is_trip_member(trip_id)`) em vez de um
  --      join duplo por linha avaliado a cada select.
  -- É seguro porque atividade muda de **dia**, nunca de viagem: este valor nunca precisa ser
  -- reescrito. O trigger no fim do arquivo afirma o invariante em vez de confiar no cliente.
  trip_id uuid not null references public.trip(id) on delete cascade,
  activity_id uuid not null references public.trip_itinerary_activity(id) on delete cascade,

  -- Gravado, não derivado de "tem storage_path?": é o que o `check` ancora e o que a UI lê para
  -- escolher ícone e ação. Derivar espalharia a regra por três camadas.
  kind text not null check (kind in ('file', 'link')),

  -- Rótulo editável. Ausente = a UI cai para o nome do arquivo (`storage_path`) ou para o host da
  -- URL — `''` não é rótulo, é ruído, então vazio vira null na API.
  label text,

  -- Só para `kind = 'link'`: a URL de destino, como o usuário colou.
  url text,

  -- Só para `kind = 'file'`: o caminho dentro do bucket privado `trip-assets`, sempre
  -- `{tripId}/{activityId}/{uuid}.{ext}`. **Não** guardamos URL de arquivo: bucket privado não tem
  -- URL estável, cada abertura assina uma nova.
  storage_path text,

  -- Do arquivo enviado. `mime_type` não é enfeite: é ele que decide se a URL assinada abre inline
  -- (pdf e imagem) ou força download (todo o resto) — ver `signedAssetUrl`.
  mime_type text,
  size_bytes bigint,

  -- Ordem manual dentro da atividade (0..n-1).
  position integer not null default 0,

  -- Quem anexou, para viagem compartilhada. `set null` porque o asset é da viagem, não da pessoa:
  -- membro que sai não leva o cartão de embarque do grupo com ele.
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Os dois formatos, um `check` só. Link sem URL e arquivo sem caminho são linhas que a UI não
  -- saberia desenhar; e um asset que é as duas coisas não existe (o usuário escolheu um botão).
  constraint trip_activity_asset_shape check (
    (kind = 'link' and url is not null and btrim(url) <> '' and storage_path is null)
    or
    (kind = 'file' and storage_path is not null and btrim(storage_path) <> '' and url is null)
  )
);

-- A consulta do bundle: "os assets desta viagem, na ordem de exibição". Começa por `trip_id`, que
-- é também o escopo que a RLS exige.
create index if not exists trip_activity_asset_trip_idx
  on public.trip_activity_asset (trip_id, activity_id, position);

comment on table public.trip_activity_asset is
  'Feature 102: arquivos e links anexados a uma linha do roteiro (visita ou deslocamento). '
  'Arquivo mora no bucket privado trip-assets em {tripId}/{activityId}/{uuid}.{ext} e é lido por '
  'URL assinada — nunca há URL pública de arquivo. trip_id é denormalizado para a wave 1 do '
  'bundle e para a RLS; o trigger trip_activity_asset_check_trip garante que ele confere com o '
  'dia da atividade.';
comment on column public.trip_activity_asset.trip_id is
  'Viagem da atividade, denormalizada (atividade muda de dia, nunca de viagem). Escopo da RLS.';
comment on column public.trip_activity_asset.kind is
  'file = arquivo no bucket (storage_path); link = URL externa (url). Gravado, não derivado.';
comment on column public.trip_activity_asset.label is
  'Rótulo editável. Null = a UI cai para o nome do arquivo ou para o host da URL.';
comment on column public.trip_activity_asset.storage_path is
  'Caminho no bucket privado trip-assets. Sem URL pública: cada abertura gera uma URL assinada.';
comment on column public.trip_activity_asset.mime_type is
  'Mime do arquivo enviado. Decide se a URL assinada abre inline (pdf/imagem) ou baixa.';

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────
--
-- Uma policy `for all` por membro da viagem, no molde exato de `trip_milestone_member`
-- (`20240101000900_shared_trips.sql`): quem participa da viagem vê e edita os assets dela. Não há
-- visibilidade "pessoal" como em `trip_expense` — um documento de voo anexado ao roteiro é
-- justamente o que o grupo precisa alcançar.

alter table public.trip_activity_asset enable row level security;

drop policy if exists trip_activity_asset_member on public.trip_activity_asset;
create policy trip_activity_asset_member on public.trip_activity_asset
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

grant select, insert, update, delete on public.trip_activity_asset to authenticated;

-- Gate de acesso Pro (mesmo padrão das demais tabelas do app).
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'enforce_app_access') then
    raise notice 'enforce_app_access ausente — skip trigger trip_activity_asset';
    return;
  end if;

  drop trigger if exists trg_enforce_app_access on public.trip_activity_asset;
  create trigger trg_enforce_app_access
    before insert or update or delete on public.trip_activity_asset
    for each row execute function public.enforce_app_access();
end $$;

-- ── Invariante do trip_id denormalizado ──────────────────────────────────────────────────────
--
-- `trip_id` existe por performance, mas performance não é licença para dado inconsistente: sem
-- isto, um cliente poderia gravar um asset com o `trip_id` de uma viagem sua e o `activity_id` de
-- outra. A linha seria inerte (ninguém a leria), mas mentiria — e o próximo leitor a acreditaria.

create or replace function public.trip_activity_asset_check_trip()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actual_trip uuid;
begin
  select d.trip_id
    into actual_trip
    from public.trip_itinerary_activity a
    join public.trip_itinerary_day d on d.id = a.day_id
   where a.id = new.activity_id;

  if actual_trip is null then
    raise exception 'Atividade % não existe', new.activity_id
      using errcode = 'foreign_key_violation';
  end if;

  if actual_trip <> new.trip_id then
    raise exception 'trip_id % não confere com a viagem da atividade (%)',
      new.trip_id, actual_trip
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trip_activity_asset_check_trip on public.trip_activity_asset;
create trigger trip_activity_asset_check_trip
  before insert or update of trip_id, activity_id on public.trip_activity_asset
  for each row execute function public.trip_activity_asset_check_trip();

-- ── Bucket privado ───────────────────────────────────────────────────────────────────────────
--
-- **Privado**, ao contrário de `task-icons` e `album-covers`. Um cartão de embarque tem nome
-- completo, número de documento e localizador; num bucket público a URL *é* a senha, e URL vaza
-- (histórico, print, link colado no grupo). Leitura só por `createSignedUrl` (5 min).
--
-- Sem `allowed_mime_types` de propósito: "arquivo importante" é o que o usuário tem na mão — pdf da
-- reserva, foto do ingresso, `.pkpass` do cartão de embarque, `.docx` do contrato de aluguel. Uma
-- allowlist viraria falha opaca de upload na metade desses casos. O que substitui a allowlist é o
-- bucket ser privado (nada é navegável sem assinatura) e a regra de abertura do cliente: só pdf e
-- imagem abrem inline; todo o resto é assinado com `download`, então nunca renderiza.
--
-- 10 MB por arquivo: um pdf de reserva com mapa cabe; um vídeo, não — e vídeo não é o pedido.
insert into storage.buckets (id, name, public, file_size_limit)
values ('trip-assets', 'trip-assets', false, 10485760)
on conflict (id) do nothing;

-- O `update` cobre o bucket que já exista de uma tentativa anterior: o `do nothing` acima
-- preservaria um bucket **público**, que é exatamente o que esta feature não pode ter.
update storage.buckets
   set public = false,
       file_size_limit = greatest(coalesce(file_size_limit, 0), 10485760)
 where id = 'trip-assets'
   and (public is distinct from false or coalesce(file_size_limit, 0) < 10485760);

-- As policies do bucket precisam do `trip_id`, e o que elas têm é o caminho do objeto. A primeira
-- pasta de `{tripId}/{activityId}/{uuid}.{ext}` é o `trip_id`.
--
-- O cast mora numa função com `exception` própria em vez de inline na policy: um caminho torto
-- (upload manual, objeto legado) faria `'lixo'::uuid` levantar `invalid input syntax`, e a policy
-- devolveria **erro** onde deveria devolver "não pode". `and` curto-circuitando à esquerda não é
-- garantia do planner; esta função é.
create or replace function public.trip_assets_path_member(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  folder text := (storage.foldername(p_name))[1];
  tid uuid;
begin
  if folder is null or folder = '' then
    return false;
  end if;

  begin
    tid := folder::uuid;
  exception when others then
    return false;
  end;

  return public.is_trip_member(tid);
end;
$$;

revoke all on function public.trip_assets_path_member(text) from public;
grant execute on function public.trip_assets_path_member(text) to authenticated;

comment on function public.trip_assets_path_member(text) is
  'True quando auth.uid() é membro da viagem cujo id é a primeira pasta do caminho do objeto '
  '({tripId}/{activityId}/{uuid}.{ext}) no bucket trip-assets. Caminho torto devolve false, não '
  'erro de cast — por isso o cast está aqui e não inline na policy.';

-- Sem policy `to public`: este bucket não tem leitura anônima nenhuma. A URL assinada é emitida
-- pelo Storage para quem passou por esta policy.
drop policy if exists trip_assets_select_member on storage.objects;
create policy trip_assets_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'trip-assets'
    and public.trip_assets_path_member(name)
  );

drop policy if exists trip_assets_insert_member on storage.objects;
create policy trip_assets_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trip-assets'
    and public.trip_assets_path_member(name)
  );

drop policy if exists trip_assets_update_member on storage.objects;
create policy trip_assets_update_member on storage.objects
  for update to authenticated
  using (
    bucket_id = 'trip-assets'
    and public.trip_assets_path_member(name)
  )
  with check (
    bucket_id = 'trip-assets'
    and public.trip_assets_path_member(name)
  );

drop policy if exists trip_assets_delete_member on storage.objects;
create policy trip_assets_delete_member on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'trip-assets'
    and public.trip_assets_path_member(name)
  );
