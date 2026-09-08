-- Feature 107: upload de arquivos na base do projeto (Supabase Storage privado)
-- Adapta public.project_asset para kind='file' e cria o bucket privado project-files

-- 1. Colunas de arquivo em public.project_asset
alter table public.project_asset
    alter column url drop not null,
    add column if not exists storage_path text,
    add column if not exists mime_type text,
    add column if not exists size_bytes bigint;

comment on column public.project_asset.url is
    'URL externa para kind="link"; nulo para kind="file" (arquivos usam storage_path com URL assinada).';
comment on column public.project_asset.storage_path is
    'Caminho no bucket privado project-files ({userId}/{projectId}/{uuid}.{ext}) para kind="file"; nulo para kind="link".';
comment on column public.project_asset.mime_type is
    'MIME type do arquivo para kind="file" (ex.: application/pdf); nulo para kind="link".';
comment on column public.project_asset.size_bytes is
    'Tamanho em bytes do arquivo para kind="file"; nulo para kind="link".';

-- 2. Constraint de coerência entre kind, url e storage_path
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'project_asset_kind_source_check'
          and conrelid = 'public.project_asset'::regclass
    ) then
        alter table public.project_asset
            add constraint project_asset_kind_source_check
            check (
                (kind = 'link' and url is not null and storage_path is null)
                or
                (kind = 'file' and storage_path is not null and url is null)
            );
    end if;
end $$;

-- 3. Bucket privado project-files com limite de 10 MB e mimes fechados
-- Diferente de task-icons e album-covers (que são públicos), este bucket é PRIVADO (public = false).
-- Leitura de arquivos é feita exclusivamente por createSignedUrl no clique.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'project-files',
    'project-files',
    false,
    10485760,
    array[
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'text/plain',
        'text/csv',
        'text/markdown',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/msword',
        'application/vnd.ms-excel',
        'application/vnd.ms-powerpoint',
        'application/zip',
        'application/x-zip-compressed'
    ]
)
on conflict (id) do nothing;

-- Update idempotente para garantir limite, mimes e public=false em bucket pré-existente
do $$
begin
    if to_regclass('storage.buckets') is null then
        raise notice 'storage.buckets ausente — skip ajuste do bucket project-files';
        return;
    end if;

    update storage.buckets
       set allowed_mime_types = (
             select array_agg(distinct m)
               from unnest(
                 coalesce(allowed_mime_types, array[]::text[])
                 || array[
                      'application/pdf',
                      'image/png',
                      'image/jpeg',
                      'image/webp',
                      'image/gif',
                      'text/plain',
                      'text/csv',
                      'text/markdown',
                      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                      'application/msword',
                      'application/vnd.ms-excel',
                      'application/vnd.ms-powerpoint',
                      'application/zip',
                      'application/x-zip-compressed'
                    ]
               ) as m
           ),
           file_size_limit = greatest(coalesce(file_size_limit, 0), 10485760),
           public = false
     where id = 'project-files';
end $$;

-- 4. Policies de storage.objects para project-files
-- SEM policy to public: apenas authenticated com user_id coincidente no primeiro segmento do path
-- ({userId}/{projectId}/{uuid}.{ext}) pode ler, enviar, atualizar ou deletar seus arquivos.

drop policy if exists project_files_select_own on storage.objects;
create policy project_files_select_own on storage.objects
    for select to authenticated
    using (
        bucket_id = 'project-files'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists project_files_insert_own on storage.objects;
create policy project_files_insert_own on storage.objects
    for insert to authenticated
    with check (
        bucket_id = 'project-files'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists project_files_update_own on storage.objects;
create policy project_files_update_own on storage.objects
    for update to authenticated
    using (
        bucket_id = 'project-files'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'project-files'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists project_files_delete_own on storage.objects;
create policy project_files_delete_own on storage.objects
    for delete to authenticated
    using (
        bucket_id = 'project-files'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
