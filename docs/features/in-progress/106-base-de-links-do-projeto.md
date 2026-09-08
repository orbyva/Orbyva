---
prompt: |
  - permitir criar notas e canvas por projeto, então ao clicar em projetos, ter uma seção para ver todos os documentos daquele projeto (aparecem aqui as notas e canvas com referência a tarefa) mas uma nota/canva vai ter um escopo do projeto, e podem ser vinculadas a uma tarefa
  - permitir adicionar links/arquivos também ao projeto, isso pode ser vinculado nas tarefas também, então eu posso subir um documento por meiod e uma tarefa, e isso fica na base desse projeto
---

# 106 — Base do projeto: links compartilhados, anexáveis às tarefas

## Contexto

Esta feature cobre a metade **"links"** do segundo item do pedido-mãe: *"permitir adicionar
links/arquivos também ao projeto, isso pode ser vinculado nas tarefas também… e isso fica na base
desse projeto"*. A metade **"arquivos"** (upload de verdade, com Supabase Storage) é a feature 107,
que se apoia na tabela criada aqui.

Hoje link no app de tarefas é sempre **da tarefa**: `task_external_link` (feature 085) tem
`task_id not null`, `unique (task_id, url)` e um `position` que só faz sentido dentro daquela
tarefa; a lista inteira é reescrita a cada save do formulário (`saveExternalLinksForTask`). Não
existe nada em nível de projeto — abrir um projeto não mostra link nenhum, e o mesmo contrato
referenciado por cinco tarefas é cinco linhas soltas, cada uma com o seu comentário.

O pedido descreve outra coisa: um acervo do **projeto** ("a base desse projeto"), ao qual as
tarefas se ligam. É o mesmo formato que `note` já tem — escopo de projeto (`project_id`) mais
vínculo com tarefa (`note_link`) — aplicado a link/arquivo.

## Decisões

- **Tabela nova `public.project_asset`, não extensão de `task_external_link`.** Reusar a da 085
  exigiria tornar `task_id` nulo, o que quebra o `unique (task_id, url)`, o `position` "dentro da
  tarefa" e a semântica de "grava a lista inteira" de `saveExternalLinksForTask` — três coisas que
  a 085 acabou de decidir de propósito. E a 085 ainda tem o `drop column` de
  `task.external_url/external_provider` pendente; mexer no modelo dela agora atrapalharia essa
  conferência.
- **As duas coisas coexistem, com divisão explícita:** `task_external_link` = *link solto desta
  tarefa* (rápido, ordenado, vira chip no card); `project_asset` = *item da base do projeto*
  (compartilhado, sobrevive à tarefa, anexável a várias). No formulário são duas seções com nomes
  diferentes ("Links externos" e "Base do projeto"). Unificar as duas é uma feature própria, com
  migração de dados, e não é o que foi pedido — fica registrado aqui como dívida conhecida.
- **`project_asset.project_id` é `not null`.** A base é *do projeto*; asset sem projeto seria um
  terceiro conceito ("acervo pessoal") que ninguém pediu. Consequência assumida: **tarefa sem
  projeto não pode alimentar a base** — a seção no formulário aparece desabilitada, com a razão
  escrita ("Escolha um projeto para usar a base"), no idioma que `TASK_NOTE_UNSAVED_HINT` (084) já
  usa. É um estado real e ganha teste.
- **`kind` já nasce com o `check ('link','file')`,** mesmo que esta feature só grave `'link'`. A
  107 acrescenta colunas (`storage_path`, `mime_type`, `size_bytes`) e afrouxa o `not null` de
  `url`; reescrever um `check` depois é mais arriscado que declarar o contrato inteiro de uma vez.
  O tipo `ProjectAssetKind` em `src/types/tasks.ts` espelha o `check` — mexeu num, mexe no outro
  (mesma regra que `NoteKind` e `NoteLinkEntityType`).
- **Vínculo com tarefa é N:N, em `public.project_asset_task`.** Com `asset.task_id` simples, anexar
  o mesmo contrato a duas tarefas exigiria duas linhas na base — e a base passaria a mostrar o
  mesmo documento duas vezes, que é exatamente o problema que o pedido quer resolver. Precedente
  direto: `note_link` (056).
- **`unique (project_id, url) where kind = 'link'`** (índice único parcial): o mesmo link duas
  vezes na mesma base é engano, não intenção — a mesma frase da 085. Parcial porque a 107 grava
  arquivo com `url` nulo, e dois arquivos distintos não colidem.
- **Excluir um asset da base desanexa de todas as tarefas** (`on delete cascade` em
  `project_asset_task.asset_id`); excluir a **tarefa** não apaga o asset, só o vínculo. É a mesma
  assimetria que `note`/`note_link` tem, e é a que o usuário espera de uma "base".
- **`title` é obrigatório e cai para o host da URL** quando o usuário não escreve nada
  (`externalLinkHostLabel`, já existente em `src/domain/tasks/externalLink.ts`) — uma base cheia de
  URLs cruas é ilegível. `comment` continua sendo o campo livre "por que isto importa", herdado da
  085.
- **O ícone do item é derivado da URL em tempo de render** (`resolveLinkAppearance` + as regras da
  087), nunca gravado — mesma decisão da 085, pelo mesmo motivo: a 087 tornou a derivação
  configurável pelo usuário.
- **A base vive na aba "Documentos"** criada pela 105, como segunda seção abaixo das notas/canvas,
  e não numa aba nova: o pedido trata "documentos do projeto" e "base do projeto" como o mesmo
  lugar, e a `TabsList` já está no limite de largura (motivo da 069).
- **No formulário de tarefa, anexar é estado controlado, gravado no save** — a lista de ids
  selecionados vive no formulário e é escrita depois do `createTask`, exatamente como as subtarefas
  e os links da 085. Assim tarefa nova também consegue anexar, sem salvar por efeito colateral.
  **Criar** um asset novo pela tarefa, porém, grava na hora: ele pertence ao projeto, não à tarefa,
  e faz sentido mesmo que o usuário cancele o formulário depois — o que o save decide é só o
  vínculo.
- **No card, anexo é um contador, não chips.** Os três chips do card são território dos links da
  085; um segundo bloco de chips deixaria o card ilegível. O card ganha um `Paperclip` com o número
  quando houver anexo, com `title` listando os títulos.
- **Migration `20260831120000_project_asset.sql`** — timestamp único e maior que
  `20260823120000` (há migrations pendentes de aplicação). **Não aplicar**: `supabase db push`
  mexe no banco remoto e depende de confirmação do usuário.

## Tarefas

- [x] Criar `supabase/migrations/20260831120000_project_asset.sql` com `public.project_asset`:
      `id`, `user_id` (FK `auth.users` on delete cascade), `project_id` (FK `public.project` on
      delete cascade, `not null`), `kind text not null default 'link'` com
      `check (kind in ('link','file'))`, `title text not null`, `url text not null`,
      `comment text`, `position integer not null default 0`, `created_at`. Comentários de tabela e
      de coluna no padrão da 085 (por que tabela nova, por que `kind` já traz `'file'`).
      Verificação: revisão do SQL (não aplicar)
- [x] Na mesma migration: índice `project_asset_user_project_idx (user_id, project_id, position)` e
      o único parcial `project_asset_unique_link_url (project_id, url) where kind = 'link'`.
      Verificação: revisão do SQL
- [x] Na mesma migration: `public.project_asset_task` (`id`, `user_id`, `asset_id` FK on delete
      cascade, `task_id` FK `public.task` on delete cascade, `created_at`,
      `unique (asset_id, task_id)`), com índices `(user_id, task_id)` e `(user_id, asset_id)` — os
      dois sentidos da consulta. Verificação: revisão do SQL
- [x] Na mesma migration: RLS `enable` + as quatro policies por `user_id = auth.uid()` nas duas
      tabelas, `grant select, insert, update, delete ... to authenticated` e o trigger
      `enforce_app_access` em cada uma — copiando o bloco da 085 verbatim (inclusive o `do $$` que
      pula quando a função não existe). Verificação: revisão do SQL
- [x] Na mesma migration: `wipe_own_data` reescrita incluindo `project_asset_task` e
      `project_asset` **antes** de `task` e de `project` (as duas têm FK para elas), partindo da
      lista mais recente (a de `20260823110000_icon_asset.sql`), sem perder nenhuma entrada.
      Verificação: comparar a lista nova com a antiga, item a item
- [x] `src/types/tasks.ts`: `PROJECT_ASSET_KINDS`/`ProjectAssetKind`, `ProjectAsset`,
      `ProjectAssetDraft` (sem `id`/`user_id`) e `ProjectAssetTaskLink`, cada um documentando o
      espelhamento com o `check` do banco. Verificação: `npm run build`
- [x] `src/domain/tasks/projectAsset.ts` (novo, puro): `normalizeProjectAssetDraft` — `title`
      aparado com fallback para `externalLinkHostLabel(url)` e depois para a própria URL, `comment`
      vazio virando `null`, `url` aparada; e `isValidAssetUrl` reusando a regra de protocolo da 085
      (`EXTERNAL_URL_HINT`), sem duplicar a mensagem. Verificação: `npm run build`
- [x] `src/domain/tasks/__tests__/projectAsset.test.ts` (novo): título vazio vira host; host
      impossível de extrair cai na URL; comentário só com espaço vira `null`; URL sem `http(s)` é
      recusada; título com espaços é aparado. Verificação: `npm test src/domain/tasks`
- [x] `src/api/tasks/projectAssets.ts` (novo): `fetchProjectAssets(projectId)` ordenado por
      `position`, `createProjectAsset(draft)` (com `position` = fim da lista),
      `updateProjectAsset(id, patch)` e `deleteProjectAsset(id)` — todas com `.eq("user_id", userId)`
      explícito, no cabeçalho de comentário do módulo que a 085/086 usam. Verificação:
      `npm run build`
- [x] `src/api/tasks/projectAssets.ts`: `reorderProjectAssets(projectId, orderedIds)` gravando só
      as linhas cuja `position` de fato mudou — reabrir e salvar sem mexer não pode gerar uma
      escrita por item (mesma regra de `saveExternalLinksForTask`). Verificação: teste com o
      supabase mockado contando os `update`
- [x] `src/api/tasks/projectAssets.ts`: `fetchAssetsForTasks(taskIds)` agrupado por `task_id`
      (molde de `fetchExternalLinksForTasks`: uma consulta em `project_asset_task`, outra em
      `project_asset`, cruzamento em memória; tarefa sem anexo não vira chave) e
      `saveTaskAssetLinks(taskId, assetIds)` que insere os que entraram e apaga os que saíram, sem
      apagar-e-recriar os que ficaram. Verificação: `npm test src/api/tasks`
- [x] `src/api/tasks/__tests__/projectAssets.test.ts` (novo): todas as funções filtram por
      `user_id`; `saveTaskAssetLinks` com a mesma lista não escreve nada; remover um vínculo não
      apaga o asset; `fetchAssetsForTasks([])` não vai ao banco. Verificação: `npm test src/api/tasks`
- [x] Exportar as funções novas em `src/api/tasks/index.ts` e o domínio em
      `src/domain/tasks/index.ts`, seguindo o que já está lá. Verificação: `npm run build`
- [x] `src/pages/admin/tasks/ProjectAssetsSection.tsx` (novo): lista da base — por item, ícone
      derivado (`resolveLinkAppearance` + `useLinkIconRules`), título, host, comentário e "em N
      tarefas"; ações de editar e remover; setas ↑/↓ para a ordem (idioma da 085, não arraste).
      Verificação: `npm run build && npm run lint`
- [x] `ProjectAssetsSection`: formulário de adicionar link (URL, título opcional, comentário
      opcional) com validação de protocolo no blur e aviso de duplicata antes de ir ao banco — o
      único parcial do banco devolveria um erro genérico do PostgREST. Verificação: teste dos dois
      avisos
- [x] `ProjectAssetsSection`: os quatro estados — carregando (`TableLoadingSkeleton`), vazio
      (`EmptyState` "Nenhum link na base deste projeto", com a ação de adicionar), erro (mensagem +
      "Tentar de novo", nunca disfarçado de vazio) e a lista. Verificação: teste dos quatro
- [x] `ProjectAssetsSection`: remover usa `ConfirmDeleteDialog` e o texto avisa que o item sai de
      **todas** as tarefas em que está anexado (com o número). Verificação: teste do texto e da
      chamada
- [x] `src/pages/admin/tasks/TaskProjectAssetsField.tsx` (novo): seção "Base do projeto" no
      formulário — os anexos atuais da tarefa, "Anexar da base" (busca por título/URL sobre os
      assets do projeto escolhido) e "Adicionar link à base" (cria e já anexa). Controlado
      (`value: string[]` / `onChange`), sem I/O de vínculo: quem grava é o save do formulário.
      Verificação: `npm run build`
- [x] `TaskProjectAssetsField`: estado desabilitado, com a razão visível, quando a tarefa não tem
      projeto escolhido; e a lista de assets recarrega ao **trocar** o projeto no formulário
      (anexos de outro projeto são descartados da seleção, com aviso). Verificação: teste dos dois
      casos
- [x] `src/pages/admin/tasks/TaskFormFields.tsx`: montar o campo abaixo de `TaskExternalLinksField`,
      com rótulos que deixem clara a divisão ("Links externos" × "Base do projeto"). Verificação:
      `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/TaskList.tsx` e `ProjectDetail.tsx`: estado dos ids anexados no
      formulário, carga em `fetchAssetsForTasks` junto do lote de links da 085 e escrita via
      `saveTaskAssetLinks` no `handleSave` — depois do `createTask` no modo criação. Verificação:
      `npm run build && npm run lint`
- [x] Falha ao gravar os vínculos **não** perde a tarefa: a tarefa já foi salva, o toast avisa que
      os anexos não foram gravados e o formulário continua aberto — mesma escolha que
      `TaskNoteButtons` faz com o `note_link`. Verificação: teste com `saveTaskAssetLinks`
      rejeitando
- [x] `src/pages/admin/tasks/TaskViews.tsx`: badge `Paperclip` com o número de anexos no card
      quando houver, com `title` listando os títulos; sem anexo, nada é renderizado. Verificação:
      `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/__tests__/ProjectAssetsSection.test.tsx` e
      `TaskProjectAssetsField.test.tsx` (novos): cobrir adicionar, editar, remover, reordenar,
      anexar/desanexar, duplicata, tarefa sem projeto. Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle` limpos, com a contagem
      registrada nas Notas. Verificação: os quatro comandos
- [x] Verificação do pedido literal, por teste e não no navegador: um link adicionado pela seção da
      tarefa aparece na base do projeto; anexado a uma segunda tarefa, continua sendo **um** item
      na base; apagar a primeira tarefa não o tira da base. Verificação: teste de fluxo
- [ ] **BLOQUEADA — aplicar a migration.** `supabase db push` escreve no banco remoto compartilhado
      e depende de confirmação explícita do usuário; há migrations anteriores ainda não aplicadas,
      então o push levaria todas juntas. Não marcar sem o "pode aplicar" dele.

## Prompts

## Notas

- 2026-08-31 (esteira): timestamp da migration alterado de `20260831100000` para
  `20260831120000`. O valor original colidia com o timestamp sugerido para a migration
  pendente da feature 058 (`drop column project.notes`) — migrations nunca compartilham
  timestamp (regra do `CLAUDE.md`; já causou bug real de bookkeeping do CLI).
