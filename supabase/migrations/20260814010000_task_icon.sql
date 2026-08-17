-- Ícone customizado por tarefa (feature 035) — preset fixo (`icon_key`) ou upload próprio
-- (`icon_url`), mutuamente exclusivos na UI (selecionar um limpa o outro).

alter table public.task
  add column if not exists icon_key text,
  add column if not exists icon_url text;

comment on column public.task.icon_key is
  'Chave de um ícone preset fixo (ex.: "flag", "star") — mutuamente exclusivo com icon_url.';
comment on column public.task.icon_url is
  'URL pública de um ícone customizado enviado pelo usuário (bucket task-icons) — mutuamente exclusivo com icon_key.';

-- Ícones customizados (upload) — espelha o bucket `album-covers` de
-- `20260728160000_albums.sql`, com limite de tamanho menor (1MB) por serem ícones pequenos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'task-icons',
  'task-icons',
  true,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

drop policy if exists task_icons_public_read on storage.objects;
create policy task_icons_public_read on storage.objects
  for select to public
  using (bucket_id = 'task-icons');

drop policy if exists task_icons_insert_own on storage.objects;
create policy task_icons_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists task_icons_update_own on storage.objects;
create policy task_icons_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'task-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'task-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists task_icons_delete_own on storage.objects;
create policy task_icons_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-icons'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
