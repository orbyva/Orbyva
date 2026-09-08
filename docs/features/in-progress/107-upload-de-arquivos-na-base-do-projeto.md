---
prompt: |
  - permitir criar notas e canvas por projeto, então ao clicar em projetos, ter uma seção para ver todos os documentos daquele projeto (aparecem aqui as notas e canvas com referência a tarefa) mas uma nota/canva vai ter um escopo do projeto, e podem ser vinculadas a uma tarefa
  - permitir adicionar links/arquivos também ao projeto, isso pode ser vinculado nas tarefas também, então eu posso subir um documento por meiod e uma tarefa, e isso fica na base desse projeto
---

# 107 — Subir arquivo pela tarefa (ou pelo projeto) para a base do projeto

## Contexto

Fecha o segundo item do pedido-mãe: *"eu posso subir um documento por meio de uma tarefa, e isso
fica na base desse projeto"*. A 106 criou a base (`public.project_asset` + `project_asset_task`) e
resolveu o caso `kind = 'link'`; aqui entra o `kind = 'file'` — arquivo de verdade, enviado pelo
usuário.

**Isto é infraestrutura nova.** O app usa Supabase Storage em dois lugares (`album-covers`, feature
026, e `task-icons`, features 035/086) e nos dois o bucket é **público**, com `getPublicUrl`, para
guardar **imagem de enfeite**. Não existe no projeto nenhum bucket privado, nenhuma chamada a
`createSignedUrl` e nenhum upload que não seja de imagem. Documento de projeto é outra classe de
dado: contrato, orçamento, laudo, planilha — conteúdo que não pode ficar legível para qualquer um
que consiga a URL. Por isso as decisões abaixo tratam bucket, políticas, limites e tipos aceitos
como o miolo da feature, não como detalhe de implementação.

Depende da 106 (tabela, API, seções de UI). Não depende da 105.

## Decisões

- **Bucket novo `project-files`, `public = false`** — o primeiro bucket privado do app. Bucket
  público entrega o arquivo a quem tiver a URL, para sempre, sem login e sem revogação; para um
  documento de projeto isso é vazamento com uma etapa só. O custo é ter que gerar URL assinada a
  cada leitura, e é um custo aceitável.
- **Leitura por `createSignedUrl` com validade de 60 segundos, gerada no clique** — nunca gravada
  em coluna nem posta em `href` no render. URL assinada guardada em estado vira link quebrado
  quando expira e vira link vazado quando não expira; gerar no clique não tem nenhum dos dois
  problemas. `project_asset.url` continua **nulo** para `kind = 'file'`.
- **Caminho `project-files/{userId}/{projectId}/{uuid}.{ext}`.** A primeira pasta é o id do dono
  porque é o que as policies checam (`(storage.foldername(name))[1] = auth.uid()::text`) — mesmo
  idioma de `task-icons`, já provado em `supabase/tests/icon_asset/`. O nome é um uuid, não o nome
  original: nome de arquivo do usuário traz acento, espaço, `/` e colisão. O nome original vira o
  `title` do asset (e é o que aparece na tela).
- **Teto de 10 MB por arquivo**, declarado no `file_size_limit` do bucket **e** conferido no
  cliente antes de tentar o upload. O do bucket é a garantia (o cliente é sugestão); o do cliente é
  o que dá mensagem decente em vez de um 413 cru depois de 10 MB de espera.
- **Lista fechada de `allowed_mime_types`:** PDF, PNG/JPEG/WebP/GIF, texto simples, CSV, Markdown,
  os formatos de Office (docx/xlsx/pptx e os legados doc/xls/ppt) e ZIP. **Ficam de fora, de
  propósito, `image/svg+xml` e `text/html`**: são documentos executáveis, e mesmo com bucket
  privado a URL assinada abre no navegador com a origem do Supabase — é XSS armazenado com passo
  extra. A 086 sanitiza SVG porque precisa renderizar ícone; aqui não há nada a ganhar aceitando.
- **Arquivo nunca é renderizado dentro do app** — nem `<iframe>`, nem `<img>` de miniatura, nem
  visualizador embutido. A ação é abrir em aba nova (URL assinada) ou baixar. Consequência
  assumida: a lista mostra ícone por tipo de arquivo, não miniatura — e uma miniatura por item, num
  bucket privado, custaria uma URL assinada por item a cada abertura da aba.
- **Ordem de exclusão: a linha primeiro, o objeto depois, em melhor esforço.** Se a remoção do
  objeto falhar, a exclusão **não** é revertida e o usuário vê um aviso de que o arquivo pode ter
  ficado no armazenamento. O contrário — objeto primeiro — deixaria, na falha do delete da linha,
  um item na base apontando para um arquivo que não existe mais, que é um estado quebrado visível.
  Órfão no bucket é invisível e só custa cota.
- **Insert que falha depois do upload limpa o objeto, em melhor esforço, e propaga o erro
  original.** Diferente da escolha da 086 (que deixa o órfão de propósito) porque ali o órfão é um
  ícone de alguns KB e aqui pode ser 10 MB por tentativa. O `catch` da limpeza nunca troca o erro
  que o usuário precisa ler.
- **Sem barra de progresso.** O `supabase-js` v2 sobe via `fetch` e não expõe progresso de upload;
  fingir uma barra determinada seria mentira e trocar por `XMLHttpRequest` só para isso é reescrever
  o cliente de storage. O que a tela mostra é o nome do arquivo, um spinner e o botão fora do ar —
  e, para arquivo grande, o aviso de que pode demorar.
- **Um arquivo por vez.** Seleção múltipla multiplica os estados de erro parcial ("3 de 5 subiram")
  sem que o pedido peça isso; o campo aceita um arquivo por acionamento, e subir vários é repetir.
- **`wipe_own_data` apaga as linhas; os objetos são apagados no cliente, antes da RPC.** Apagar de
  `storage.objects` por SQL remove só o metadado — o binário fica no backend de storage. Então
  `deleteOwnAccount`/`wipeOwnData` (`src/api/account.ts`) passam a listar e remover os arquivos do
  usuário via `supabase.storage.remove` **antes** de chamar a RPC, e a falha nessa limpeza não
  impede o wipe (o dado que importa é o do banco).
- **Migration `20260831130000_project_asset_file.sql`** — timestamp único e maior que o da 106.
  **Não aplicar**: `supabase db push` escreve no banco remoto e depende de confirmação do usuário.

## Tarefas

- [x] Criar `supabase/migrations/20260831130000_project_asset_file.sql`: `alter table
      public.project_asset` — `alter column url drop not null`, `add column storage_path text`,
      `add column mime_type text`, `add column size_bytes bigint`, com `comment on column` em cada
      uma explicando que `url` é do link e `storage_path` é do arquivo. Verificação: revisão do SQL
      (não aplicar)
- [x] Na mesma migration: `check` de coerência via `do $$` (Postgres 16 não tem `add constraint if
      not exists`) — `(kind = 'link' and url is not null and storage_path is null) or (kind =
      'file' and storage_path is not null and url is null)`. Verificação: revisão do SQL
- [x] Na mesma migration: `insert into storage.buckets` de `project-files` com `public = false`,
      `file_size_limit = 10485760` e a lista fechada de `allowed_mime_types`, com
      `on conflict (id) do nothing` **mais** o `update` idempotente que garante limite e mimes num
      bucket pré-existente (padrão de `20260823110000_icon_asset.sql`). Verificação: revisão do SQL
- [x] Na mesma migration: as policies de `storage.objects` para `project-files` — select, insert,
      update e delete, todas `to authenticated` e ancoradas em
      `(storage.foldername(name))[1] = auth.uid()::text`. **Sem policy `to public`**: é o que
      diferencia este bucket de `task-icons`, e o comentário do SQL precisa dizer isso. Verificação:
      revisão do SQL, conferindo que não sobrou nenhuma policy pública
- [x] `src/types/tasks.ts`: `ProjectAsset` ganha `storage_path`, `mime_type` e `size_bytes`, com
      `url` virando `string | null`; ajustar `ProjectAssetDraft` para o payload de arquivo.
      Verificação: `npm run build`
- [x] `src/domain/tasks/projectAssetFile.ts` (novo, puro): `PROJECT_FILE_MAX_BYTES`,
      `PROJECT_FILE_ACCEPTED_MIMES` (espelhando a lista do bucket — mexeu num, mexe no outro),
      `validateProjectFile(file)` devolvendo `{ ok } | { ok: false, reason }` com razões fechadas, e
      `projectFileExtension(file)` / `formatFileSize(bytes)`. Verificação: `npm run build`
- [x] `src/domain/tasks/__tests__/projectAssetFile.test.ts` (novo): arquivo acima do teto é
      recusado com a razão de tamanho; `image/svg+xml` e `text/html` são recusados com a razão de
      tipo (é a decisão de segurança que uma "melhoria" futura desfaz sem querer); tipo aceito com
      extensão estranha passa; `formatFileSize` em B/KB/MB. Verificação: `npm test src/domain/tasks`
- [ ] `src/api/tasks/projectAssetFiles.ts` (novo): `PROJECT_FILES_BUCKET`,
      `uploadProjectAssetFile({ projectId, file, comment })` — valida pelo domínio, sobe em
      `{userId}/{projectId}/{uuid}.{ext}` com `upsert: false` e `contentType` do arquivo, insere a
      linha `kind='file'` e devolve o `ProjectAsset`. Verificação: `npm run build`
- [ ] `uploadProjectAssetFile`: falha no insert remove o objeto recém-subido em melhor esforço e
      **relança o erro original**, nunca o da limpeza. Verificação: teste com o insert rejeitando —
      afirma o `storage.remove` e a mensagem original
- [ ] `src/api/tasks/projectAssetFiles.ts`: `createProjectAssetFileUrl(asset)` chamando
      `createSignedUrl(storage_path, 60)`, com erro amigável quando o objeto não existe mais.
      Verificação: teste afirmando que a URL **não** é buscada no render, só sob demanda
- [ ] `src/api/tasks/projectAssets.ts`: `deleteProjectAsset` passa a apagar a linha primeiro e,
      quando `kind='file'`, remover o objeto depois, sem reverter a exclusão se a remoção falhar
      (devolvendo um sinal de "arquivo pode ter ficado" para a UI avisar). Verificação:
      `npm test src/api/tasks`
- [ ] `ProjectAssetsSection` (106): botão "Subir arquivo" ao lado de "Adicionar link", com
      `<input type="file">` escondido e o `accept` montado a partir de
      `PROJECT_FILE_ACCEPTED_MIMES`. Verificação: `npm run build && npm run lint`
- [ ] `ProjectAssetsSection`: estado de upload — nome do arquivo, spinner, botões fora do ar e o
      aviso de demora acima de ~2 MB; erro de validação aparece **antes** de qualquer ida à rede.
      Verificação: teste do caminho de recusa (arquivo grande / tipo barrado) sem chamada de upload
- [ ] `ProjectAssetsSection`: item de arquivo — ícone por tipo, `title` (nome original), tamanho
      formatado, e as ações "Abrir" (aba nova com a URL assinada, `rel="noopener noreferrer"`) e
      "Baixar". Nada é renderizado embutido. Verificação: teste das duas ações e da ausência de
      `iframe`/`img` apontando para o arquivo
- [ ] `ProjectAssetsSection`: excluir arquivo usa `ConfirmDeleteDialog` dizendo que **o arquivo
      também é apagado** (diferente do link, que só sai da base), e mostra o aviso quando a remoção
      do objeto falhou mas o item saiu. Verificação: teste dos dois textos
- [ ] `TaskProjectAssetsField` (106): "Subir arquivo" dentro da seção da tarefa — sobe para a base
      do projeto e já entra na seleção de anexos da tarefa; desabilitado, com a razão escrita,
      quando a tarefa não tem projeto. É o pedido literal ("subir um documento por meio de uma
      tarefa, e isso fica na base desse projeto"). Verificação: `npm run build`
- [ ] `src/api/account.ts`: `wipeOwnData` e `deleteOwnAccount` listam e removem os arquivos do
      usuário em `project-files` antes da RPC, e a falha dessa limpeza não impede o wipe.
      Verificação: teste afirmando a ordem (remoção antes da RPC) e que a RPC roda mesmo com a
      remoção falhando
- [ ] `src/pages/admin/tasks/__tests__/ProjectAssetsSection.file.test.tsx` (novo): subir, recusar
      por tamanho, recusar por tipo, abrir com URL assinada, excluir com remoção do objeto, e
      excluir com a remoção falhando. Verificação: `npm test src/pages/admin/tasks`
- [ ] `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle` limpos, com a contagem
      registrada nas Notas. Verificação: os quatro comandos
- [ ] Verificação do pedido literal, por teste e não no navegador: um PDF subido pela seção de uma
      tarefa aparece na base do projeto **e** entre os anexos daquela tarefa; anexado a uma segunda
      tarefa, continua sendo um arquivo só. Verificação: teste de fluxo
- [ ] **BLOQUEADA — aplicar a migration** (bucket `project-files`, policies e colunas novas).
      `supabase db push` escreve no banco remoto compartilhado e depende de confirmação explícita do
      usuário. Depois de aplicada, conferir no painel do Supabase que o bucket ficou **privado** —
      é a decisão desta feature que um `on conflict do nothing` sobre um bucket pré-existente
      poderia silenciosamente não aplicar.

## Prompts

## Notas

- 2026-08-31 (esteira): timestamp da migration alterado de `20260831110000` para
  `20260831130000`, acompanhando o remanejamento feito na 106 e mantendo-se maior que ela.
