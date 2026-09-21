---
prompt: |
  a aba de links externos, precisa ser melhorada

  os links externos devem ir para uma aba separada, em que cada link terá também um comentário, que eu posso adicionar, um cmapo livre de comentário
---

# 085 — Links externos da tarefa: vários, com comentário, em seção própria

## Contexto

Hoje uma tarefa tem **um** link externo, e ele é um par de colunas em `task`: `external_url` e
`external_provider` (feature `done/013`, migration `20260807160000_task_external_link.sql`). O campo
mora solto no Bloco 5 do painel denso (`TaskFormFields.tsx:371-403`, ao lado de Tags) e aparece nas
visualizações pelo `ExternalLinkChip` (`TaskViews.tsx:64`), usado em `TaskListRow` e `KanbanCard`.
`external_provider` é preenchido por `detectExternalProvider` (`src/domain/tasks/externalLink.ts`),
que só conhece GitHub.

O pedido tem duas partes: **vários** links por tarefa, cada um com um **comentário livre**, e os
links fora do meio dos outros campos, numa seção própria. O painel denso da `done/080` já tem o
idioma para isso: `CollapsibleField` (gatilho de uma linha com resumo do conteúdo), que é como
Descrição, Subtarefas e Registros de tempo cabem na mesma página. "Aba" no texto bruto é a seção
separada — o formulário deixou de ter abas de verdade na 080, e ressuscitá-las desfaria aquela
feature.

A feature `todo/087` (ícones por regex) consome os links criados aqui; esta não depende dela.

## Decisões

- **Tabela nova `task_external_link`, com `task.external_url`/`external_provider` mantidas vivas.**
  Um link com comentário e ordem não cabe em duas colunas de `task`, e um array `jsonb` perderia a
  chance de indexar e de escrever RLS por linha. Colunas: `id`, `user_id`, `task_id`
  (`on delete cascade`), `url text not null`, `comment text`, `position int not null default 0`,
  `created_at`. `unique (task_id, url)` — o mesmo link duas vezes na mesma tarefa é engano, não
  intenção. Índice `(user_id, task_id)`. RLS nas 4 operações, no molde de
  `20260816170000_note_links.sql`, e a tabela entra no `wipe_own_data`.
- **`external_provider` não vira coluna da tabela nova.** Provider é derivado da URL em tempo de
  render (é o que `detectExternalProvider` já faz, sem rede), e a `087` vai substituir essa derivação
  por regras configuráveis — gravar o resultado congelaria uma decisão que o usuário passa a poder
  mudar depois.
- **Migração de dados copia o link antigo para a tabela nova; as colunas antigas continuam
  existindo, mas o app para de ler e de escrever nelas.** É a mesma rede de segurança que a 055 usou
  com `project.notes` — e o mesmo desfecho: dropar as colunas é tarefa própria, só depois de o
  usuário conferir que nenhum link se perdeu. Registrar aqui a tarefa bloqueada, com as consultas
  de conferência, em vez de dropar junto.
- **UI: `CollapsibleField label="Links externos"`**, com resumo "N links" (ou o rótulo do primeiro
  link quando só há um) no gatilho, posicionado depois de Tags. Tags passa a ocupar a linha inteira
  do Bloco 5, já que perdeu o par.
- **Cada linha da seção**: campo de URL, campo livre de comentário (uma linha, `Input` — não
  `textarea`: é anotação curta, "por que este link importa", e um `textarea` devolveria ao painel a
  altura que a 080 tirou), botão de remover só-ícone. Um botão "Adicionar link" abaixo da lista.
- **Reordenar por setas ↑/↓**, não drag-and-drop. A ordem importa (o primeiro link é o que aparece
  no chip do card), mas arrastar dentro de um formulário que já tem lista de subtarefas e um Gantt
  arrastável na mesma tela é custo alto para ganho pequeno.
- **Em criação, os links ficam em rascunho e são gravados depois do `createTask`** — exatamente o
  padrão que `subtaskDrafts` já usa em `TaskList.tsx:511`. Sem isso, "adicionar link" numa tarefa
  nova não teria `task_id` para gravar.
- ~~**Nos cards, o chip mostra o primeiro link e, havendo mais, um sufixo "+N"**~~ — **superada pelo
  pedido de 2026-08-23** ("todos com a gestão de ícones+preview"); ver a decisão nova abaixo. O que
  permanece: o comentário do link vai no `title` (tooltip nativo) — ele é a razão de o link existir
  e não pode ficar visível só dentro do formulário — e `ExternalLinkChip` continua sendo o
  componente, com a assinatura mudada de `url` para a lista.
- **Os links dos cards vêm de uma consulta em lote por página, não uma por tarefa.**
  `fetchExternalLinksForTasks(taskIds)` devolve `Record<taskId, TaskExternalLink[]>`, no molde de
  `fetchNotesLinkedToMany` (`src/api/notes/noteLinks.ts`). Chamada no `load()` de `TaskList.tsx` e
  de `ProjectDetail.tsx` — os dois únicos donos de carregamento que alimentam `TaskViews`. Falha
  nessa consulta **não derruba a lista de tarefas**: cai para "sem chips".
- **Validação**: a URL precisa começar com `http://` ou `https://`, conferida no blur (o campo atual
  já faz isso e a regra é mantida); link com URL vazia é descartado ao salvar em vez de virar erro
  (linha em branco esquecida é engano, não pedido); URL repetida na mesma tarefa é barrada no
  cliente com mensagem, antes de o `unique` do banco estourar em erro genérico.
- **Comentário sem URL não existe**: o comentário é atributo do link, então uma linha só com
  comentário preenchido é descartada junto com a URL vazia.
- **Fora de escopo**: link externo em projeto (só tarefa tem o campo hoje), buscar título da página
  linkada por rede (a 013 descartou explicitamente qualquer chamada externa, e a decisão continua
  valendo), e link externo na Agenda/Gantt (nenhum dos dois mostra o chip hoje).

### Decisões do pedido de 2026-08-23 ("todos com a gestão de ícones+preview")

- **"Todos" é literal: cada link vira o próprio chip no card**, com o próprio ícone, o próprio
  rótulo e o próprio comentário no `title` — e não o primeiro com um contador ao lado, como a
  decisão anterior previa. O orçamento visual continua existindo: **até 3 chips visíveis**, e o
  resto vira um único `+N` no fim da linha (com os rótulos restantes no `title` dele). Três é o que
  cabe numa linha de card ao lado do título sem empurrar prazo, tags e ícone para a linha de baixo;
  quem tem mais que isso abre a tarefa e vê a lista inteira na seção.
- **"Preview" aqui é a prévia do chip, não uma prévia da página linkada.** Cada linha da lista de
  links no formulário mostra, ao lado dos campos, exatamente como aquele link vai aparecer no card
  (ícone + rótulo resolvido). Sem isso, "gerenciar ícones" é escrever regra às cegas e voltar à
  lista de tarefas para descobrir o resultado — o mesmo motivo pelo qual a `087` colocou uma prévia
  ao vivo na tela de regras.
  - **Descartado — prévia rica (título/`og:image` da página)**: exige rede a partir do cliente, que
    o CORS bloqueia na prática, então precisaria de uma função de servidor fazendo proxy; mandaria
    para terceiros todas as URLs privadas que o usuário cola; e um fetch lento ou quebrado
    congelaria uma linha de formulário. A 013 já tinha descartado chamada externa e a decisão
    continua valendo. **Ponto de produto em aberto**: se for isso que o usuário quis dizer com
    "preview", é feature própria, com função de servidor, cache e política de privacidade
    explícita — não um detalhe desta.
- **A prévia não pode fazer esta feature depender da `087`.** A resolução de aparência nasce aqui
  como `describeExternalLink(url)` em `src/domain/tasks/externalLink.ts`: ícone genérico +
  rótulo derivado do host, preservando o caso GitHub que `detectGitHubLink` já trata. Quando a `087`
  entrar, `resolveLinkAppearance(url, rules)` usa exatamente essa função como o ramo "nenhuma regra
  casa" — uma implementação só do fallback, em vez de duas versões do mesmo texto.
- **Ícone escolhido à mão por link continua fora de escopo.** A "gestão de ícones" que o usuário
  configura é a da `087` (regra → ícone), e um ícone gravado na linha do link criaria uma segunda
  fonte de verdade que venceria a regra sem que a tela de regras soubesse. Se for pedido, vira
  feature própria (uma coluna `icon_key`/`icon_url` na `task_external_link` e a precedência escrita
  por extenso).

## Tarefas

- [x] Escrever a migration `supabase/migrations/<timestamp>_task_external_links.sql` criando
      `public.task_external_link` (colunas, `unique (task_id, url)`, índice `(user_id, task_id)`,
      `comment on table`), no molde de `20260816170000_note_links.sql`. Timestamp único — conferir
      `ls supabase/migrations/` antes de nomear. **Não rodar `supabase db push`.**
      Verificação: leitura + a validação em Postgres da tarefa abaixo
- [x] Na mesma migration: `enable row level security` + as 4 policies (`select`/`insert`/`update`/
      `delete`) por `user_id = auth.uid()`, e inclusão da tabela no `create or replace function
      public.wipe_own_data()` **antes** de `task` (tem FK para ela). Verificação: a validação em
      Postgres abaixo
- [x] Na mesma migration: `insert into task_external_link (user_id, task_id, url, position)
      select user_id, id, external_url, 0 from task where external_url is not null` — a cópia do
      dado antigo, idempotente (`on conflict do nothing`, coberto pelo `unique`). Verificação: a
      validação em Postgres abaixo
- [x] Validar a migration em Postgres 16 descartável, no molde de `supabase/tests/note_links/` e
      `supabase/tests/note_canvas/`: criar `supabase/tests/task_external_links/` (`00_stubs.sql`,
      `01_seed.sql` com tarefas **com e sem** `external_url`, `02_assert_schema.sql`,
      `03_assert_behavior.sql`, `run.sh`). Afirmar: a cópia trouxe exatamente as tarefas com link;
      reaplicar a migration não duplica; `unique` barra o mesmo link duas vezes; RLS barra leitura
      alheia; `wipe_own_data` apaga os links do usuário. Verificação: `bash supabase/tests/task_external_links/run.sh`
- [x] `src/types/tasks.ts`: `TaskExternalLink` (espelhando a tabela) e `TaskExternalLinkDraft`
      (`url`, `comment`, `position` — sem `id`/`user_id`/`task_id`, que quem grava preenche).
      Verificação: `npm run build`
- [x] `src/api/tasks/taskExternalLinks.ts` (arquivo novo): `fetchExternalLinksForTask(taskId)` e
      `fetchExternalLinksForTasks(taskIds)` (batch agrupado por `task_id`, com `in` e filtro
      explícito por `user_id`, no molde de `fetchNotesLinkedToMany`). Exportar no
      `src/api/tasks/index.ts` se houver barrel. Verificação: `npm run build`
- [x] No mesmo arquivo: `saveExternalLinksForTask(taskId, drafts)` — grava a lista inteira num
      caminho só (apaga os que sumiram, insere os novos, atualiza `comment`/`position` dos que
      ficaram), devolvendo a lista final. Verificação: `npm run build`
- [x] `src/api/__tests__/taskExternalLinks.test.ts` (Supabase falso, no molde dos testes de
      `src/api/notes`): o batch faz **duas** consultas no máximo e agrupa certo; tarefa sem link sai
      do mapa sem chave; `saveExternalLinksForTask` apaga só o que saiu, insere só o que entrou e
      não reescreve o que não mudou; `user_id` está em toda consulta. Verificação: `npm test src/api`
- [x] `src/domain/tasks/externalLink.ts`: `normalizeExternalLinkDrafts(drafts)` puro — descarta
      linhas com URL vazia (levando junto o comentário), apara espaços, recalcula `position` em
      sequência e devolve também a lista de URLs duplicadas encontradas (para a UI avisar).
      Verificação: `npm run build`
- [x] Testar em `src/domain/tasks/__tests__/externalLink.test.ts` (arquivo já existe): linha vazia
      sai; linha só com comentário sai; espaços são aparados; `position` vira 0..n-1 depois da
      remoção do meio; duas URLs iguais (inclusive diferindo só por espaço) são reportadas como
      duplicata; a lista vazia devolve vazio sem erro. Verificação: `npm test src/domain/tasks`
- [x] Criar `src/pages/admin/tasks/TaskExternalLinksField.tsx`: lista editável de links (URL +
      comentário + remover + setas ↑/↓) e o botão "Adicionar link". Componente **controlado**
      (`value`/`onChange` sobre `TaskExternalLinkDraft[]`), sem I/O — quem grava é o `handleSave` do
      formulário, como acontece com as subtarefas. Verificação: `npm run build && npm run lint`
- [x] Em `TaskExternalLinksField.tsx`, os estados que o pedido não menciona e a tela exige: vazio
      ("Nenhum link ainda", com o botão de adicionar como única ação), aviso de URL sem
      `http(s)://` no blur (mensagem `role="alert"`, o mesmo `EXTERNAL_URL_HINT` de hoje), aviso de
      URL duplicada, e `aria-label` por linha ("Link externo 2 de 3") para a lista não virar um
      amontoado de campos sem nome no leitor de tela. Verificação: `npm run build && npm run lint`
- [x] `TaskFormFields.tsx`: trocar o campo único "Link externo" por
      `<CollapsibleField label="Links externos" summary={…}>` com o `TaskExternalLinksField` dentro,
      e deixar Tags ocupando a linha inteira do Bloco 5. O resumo do gatilho é "N links" (ou o host
      do único link, quando só há um). Verificação: `npm run build && npm run lint`
- [x] `TaskFormFields.tsx`: expor as props novas (`externalLinks`, `onExternalLinksChange`) e
      documentá-las no `TaskFormFieldsProps` com o mesmo padrão de comentário dos outros campos.
      Verificação: `npm run build`
- [x] `TaskList.tsx`: estado dos rascunhos de link, carregado em `openEdit` (via
      `fetchExternalLinksForTask`) e zerado em `openCreate`; no `handleSave`, chamar
      `saveExternalLinksForTask` depois do `updateTask`/`createTask` — no caso de criação, com o id
      recém-criado, no mesmo lugar em que os `subtaskDrafts` são gravados hoje. Verificação:
      `npm run build && npm run lint`
- [x] `ProjectDetail.tsx`: a mesma fiação do item anterior (é o segundo call site do formulário
      completo). Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: conferir o terceiro call site de `TaskFormFields` (feature 043) e decidir
      explicitamente — ou fiar igual, ou passar a seção desabilitada. Registrar a escolha em
      `## Notas`. Verificação: `npm run build`
- [x] `TaskViews.tsx`: `ExternalLinkChip` passa a receber `links: TaskExternalLink[]` e renderiza
      **um chip por link, até 3**, cada um com o ícone e o rótulo de `describeExternalLink` e o
      `title` = comentário daquele link; havendo mais que 3, um `+N` no fim, com os rótulos
      restantes no `title` dele (decisão de 2026-08-23). Lista vazia não renderiza nada. Atualizar
      os dois usos (`TaskListRow`, `KanbanCard`) e a prop que os alimenta. Verificação:
      `npm run build && npm run lint`
- [x] `TaskList.tsx` e `ProjectDetail.tsx`: carregar o mapa de links no `load()` (uma chamada
      `fetchExternalLinksForTasks` com os ids já carregados) e passá-lo por `TaskViews` até os
      cards; falha na consulta cai para mapa vazio, sem derrubar a página. Verificação:
      `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/TaskExternalLinksField.test.tsx` (arquivo novo): adicionar,
      editar comentário, remover e reordenar mexem no `onChange` do jeito esperado; URL sem
      protocolo acusa no blur e não no meio da digitação; URL repetida acusa; o estado vazio aparece
      com a lista vazia. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de fluxo em `TaskList` (arquivo novo `TaskList.external-links.test.tsx`): criar tarefa
      com dois links grava os dois **depois** do `createTask`, com o `task_id` novo e as `position`
      em ordem; editar uma tarefa carrega os links existentes no formulário; remover um link e
      salvar apaga só ele. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste dos chips: card com um link mostra o rótulo de sempre (GitHub continua saindo como
      "owner/repo#N"); com três links, saem **três** chips, cada um com o próprio rótulo e o próprio
      comentário no `title`; com cinco, saem três chips e um `+2`; sem link nenhum, não há chip.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Parar de escrever em `task.external_url`/`external_provider`: remover os dois campos de
      `emptyTask()`/`openEdit`/`payload` e do `TaskCreateRequest` **sem** mexer na coluna do banco,
      deixando um comentário em `src/types/tasks.ts` apontando para esta feature (o mesmo padrão que
      a 055 usou ao aposentar `project.notes`). Verificação: `npm run build && npm run lint && npm test`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada aqui. **2026-08-23**: `npm run build` OK; `npm run lint` 0 erros (81 avisos
      pré-existentes de `react-refresh/only-export-components`, nenhum nos arquivos novos);
      `npm test` **222 arquivos / 2385 testes / 0 falhas** (baseline antes da feature: 218 / 2314 —
      +4 arquivos e +71 testes); `npm run check:bundle` "Bundle budget OK" (teto de rota 160 KB
      gzip intacto). Migration validada à parte:
      `bash supabase/tests/task_external_links/run.sh` → "OK: 20260823100000_task_external_links.sql
      validada em Postgres 16."
- [x] **Migration aplicada e conferida no remoto (2026-09-20).** A
      `20260823100000_task_external_links.sql` **está no banco remoto** — `supabase migration list
      --linked` devolve `local=20260823100000 remote=20260823100000`, e o histórico inteiro (97
      migrations) está em sincronia, sem nenhuma pendente. O push foi feito pelo usuário em algum
      momento entre a nota de 2026-09-18 (que dizia o contrário) e hoje; a nota envelheceu, o banco
      não. Conferência (a)/(b) executada **por esta sessão** via `supabase db query` (só `select`):
      (b) — a consulta de órfãos veio **vazia**: toda `external_url` legada tem linha
      correspondente em `task_external_link`. **Cópia íntegra.**
      (a) — os números **não** batem, e isso é esperado: `task` com `external_url` não vazia = **4**,
      `count(distinct task_id)` em `task_external_link` = **7**. A quebra é por dado novo, não por
      falha: agrupando por origem, são **4 links em tarefas que tinham `external_url`** (os legados,
      copiados pela migration) e **3 links em tarefas sem `external_url`** (criados depois, pela UI
      nova da própria 085). A checagem (a) foi escrita supondo comparação imediata pós-push; como o
      push é de semanas atrás e a tela está em uso, o lado direito cresce sozinho. O invariante que
      continua valendo — e que é o que de fato prova a migração — é o (b).
      Resta só o (c), visual, que é do usuário.
      ~~`supabase db push` é do usuário (aplica em produção; ver `CLAUDE.md`), então a migration está
      escrita e validada em Postgres 16 descartável, mas **não aplicada**.~~
      **Antes do push** (para ter com o que comparar depois):
      `select count(*) from task where external_url is not null and btrim(external_url) <> '';`
      **Rodar**: `supabase db push`.
      **Depois do push**: (a) a contagem acima tem de bater com
      `select count(distinct task_id) from task_external_link;`
      (b) `select id, external_url from task t where external_url is not null
      and btrim(external_url) <> '' and not exists (select 1 from task_external_link l
      where l.task_id = t.id and l.url = t.external_url);` tem de vir **vazia**;
      (c) abrir no app uma tarefa que tinha link e conferir que ele está na seção "Links externos",
      com o campo de comentário vazio ao lado (o dado antigo não tinha comentário).
      Enquanto isso não acontece, a tela funciona mas nenhum link é gravado: a tabela não existe.
- [x] **APLICADA EM 2026-09-21 — `task.external_url` e `task.external_provider` removidas.**
      As duas condições foram cumpridas e conferidas no banco real antes de qualquer drop:
      (1) a migration da feature está no remoto; (2) a consulta de órfãos veio **vazia** — toda
      `external_url` legada tem linha em `task_external_link`. O usuário autorizou criar e aplicar.
      Migration `supabase/migrations/20260921110000_task_drop_external_columns.sql`, **uma instrução
      por coluna** como esta tarefa pedia (para um erro em qualquer uma aparecer sozinho no log, e
      não escondido num `alter` composto), validada em Postgres 16 descartável por
      `bash supabase/tests/drop_legacy_columns/run.sh` — que afirma, entre outras coisas, que
      `task_external_link` sai intacta, já que ela passa a ser a única fonte do link.
      `supabase db push` aplicado ao remoto.
      **Conferência pós-push:** nenhuma das duas colunas existe mais (0 em
      `information_schema.columns`); as 87 tarefas continuam 87 e os 7 links continuam 7.
      `npm run build`, `npm run lint` (0 erros), `npm run check:mcp` e a suíte completa
      (**264 arquivos / 2913 testes / 0 falhas**) passaram com as colunas já fora do banco — o que
      era esperado, porque o app não as lê desde a 085: `src/types/tasks.ts:150` só as cita num
      comentário explicando a ausência, e os testes de formulário afirmam que elas não entram no
      payload de `createTask`/`updateTask`. Nenhuma view, índice ou constraint dependia delas
      (conferido em `pg_depend` e `pg_index` antes do drop).
      ~~**BLOQUEADA.** Só depois de: (1) o~~
      usuário rodar `supabase db push` com a migration desta feature e confirmar; (2) o usuário
      abrir tarefas que tinham link e confirmar que os links estão na seção nova. Conferência:
      `select count(*) from task where external_url is not null` tem de bater com
      `select count(distinct task_id) from task_external_link`, e
      `select id, external_url from task t where external_url is not null and not exists (select 1
      from task_external_link l where l.task_id = t.id and l.url = t.external_url)` tem de vir
      vazia. Só então uma migration nova, com **uma instrução por coluna** e nada mais.

### Tarefas do pedido de 2026-08-23 ("todos com a gestão de ícones+preview")

- [x] `src/domain/tasks/externalLink.ts`: `describeExternalLink(url)` puro, devolvendo
      `{ iconKey, label }` — preserva o caso GitHub de hoje (`detectGitHubLink` → `owner/repo#N`,
      ícone `Github`), cai no host da URL como rótulo nos demais (`docs.google.com`), usa a string
      crua quando a URL não parseia, e corta o rótulo em 60 caracteres com `…`. É o ramo "nenhuma
      regra casa" que a `087` vai consumir — a mesma constante de corte e o mesmo fallback, uma vez
      só. Verificação: `npm run build`
- [x] Testar em `src/domain/tasks/__tests__/externalLink.test.ts`: issue do GitHub sai como
      `owner/repo#N`; repositório do GitHub (sem issue) cai no host; `https://www.figma.com/...` sai
      como `figma.com` (o `www.` sai); URL sem protocolo e string que não é URL não lançam; URL
      vazia devolve rótulo vazio sem quebrar; rótulo longo é cortado com `…`. Verificação:
      `npm test src/domain/tasks`
- [x] `TaskExternalLinksField.tsx`: cada linha ganha, ao lado dos campos, a **prévia do chip**
      daquele link (ícone + rótulo de `describeExternalLink`), recalculada no blur da URL — nunca a
      cada tecla, para o rótulo não tremer enquanto se digita. Verificação:
      `npm run build && npm run lint`
- [x] Estados da prévia, que a tela exige e o pedido não menciona: URL vazia mostra um marcador
      neutro ("A prévia aparece quando você colar o link"), não um chip fantasma; URL sem
      `http(s)://` mostra a prévia em estado apagado junto do aviso que já existe, em vez de sumir;
      rótulo longo é cortado sem estourar a linha. A prévia é decorativa —
      `aria-hidden` no ícone e o rótulo já lido pelo campo de URL, para o leitor de tela não ouvir a
      mesma coisa duas vezes. Verificação: `npm run build && npm run lint`
- [x] Botão "Configurar ícones" no rodapé da seção "Links externos", levando a `/tasks/link-icons` —
      **fica desabilitado com uma dica enquanto a `087` não existir**, ou é omitido; escolher e
      registrar em `## Notas`. É o que fecha "gestão de ícones" a partir de onde o usuário está
      olhando os links. Verificação: `npm run build && npm run lint`
- [x] Estender `src/pages/admin/tasks/__tests__/TaskExternalLinksField.test.tsx`: colar uma URL do
      GitHub e sair do campo mostra a prévia com `owner/repo#N`; a prévia da linha 2 não muda quando
      a URL da linha 1 muda (uma prévia por linha, não uma compartilhada); remover uma linha remove
      a prévia dela; a linha vazia mostra o marcador neutro. Verificação:
      `npm test src/pages/admin/tasks`

## Prompts
- 2026-08-23 — "- deve ser possível adicionar n links externos a uma tarefa, cada um com seu comentário, e todos com a gestão de ícones+preview"

## Notas

- **2026-09-18 — a esteira perguntou e NÃO aplicou.** A `/pipeline` apresentou a decisão do
  `supabase db push` com a aplicação como recomendada e esperou o minuto de timeout sem resposta.
  Diferente dos outros bloqueios, aqui a esteira **não** executa a recomendada sozinha: a CLAUDE.md
  manda confirmar com o usuário antes de qualquer `db push` (o banco é remoto, não há Supabase
  local), e essa regra ganha da regra de timeout. A feature fica em `in-progress/` até a palavra do
  usuário. Enquanto o push não roda, a tela de links funciona mas nada é gravado: a tabela
  `task_external_link` não existe no remoto.
- Migration nomeada `20260823100000_task_external_links.sql` — timestamp conferido contra
  `ls supabase/migrations/` (o último era `20260820140000_task_sort_order.sql`), sem colisão.
- A cópia do dado antigo filtra também `btrim(external_url) <> ''`, além de `is not null` como a
  tarefa dizia: o campo antigo era um `Input` livre e gravar `''` era possível, e uma linha de link
  com URL vazia é exatamente o que a própria feature manda descartar na UI.
- `supabase/tests/task_external_links/run.sh` tem um **controle negativo** antes da migration
  (inline, via `psql -c`, em vez de um arquivo `02_assert_before.sql` à parte, para manter a lista de
  arquivos que a tarefa pedia): prova que `task_external_link` não existia e que gravar link falhava
  com `undefined_table` — sem isso, as assertivas do `02` poderiam estar passando por causa dos
  stubs.
- `TaskExternalLinkDraft` ganhou um `id?` opcional, que a tarefa dizia não ter: é o mesmo formato
  de `SubtaskDraft` (`id?` presente = linha já gravada) e é o que dá chave de React estável às
  linhas já salvas, no idioma que `TaskSubtasksField` já usa (`key={s.id ?? \`draft-${i}\`}`). Quem
  grava continua ignorando o campo — a identidade de um link no banco é a URL (`unique (task_id,
  url)`).
- A **prévia do chip** (tarefas do pedido de 2026-08-23) foi escrita junto com o
  `TaskExternalLinksField`, e não depois: as duas mexem no mesmo layout de linha, e implementar a
  lista primeiro significaria desenhar a linha duas vezes. O `describeExternalLink` já existia
  quando a lista foi escrita, então nada ficou provisório.
- A prévia por linha vive num estado paralelo (`RowUiState[]`) mantido em sincronia com a lista
  controlada, e não em estado local de cada linha: é o que garante que a prévia só se mova no blur
  (nunca a cada tecla), que ela acompanhe o link ao reordenar e que sumir uma linha sumir a prévia
  dela. Quando o valor é trocado **por fora** (abrir outra tarefa, carregar os links do banco), as
  prévias são refeitas — um `emittedRef` distingue "mudou porque digitaram aqui" de "trocaram a
  lista".
- As setas ↑/↓ devolvem o foco ao botão na **posição de destino**. Sem isso, apertar ↑ duas vezes
  moveria o link vizinho na segunda vez (o foco fica na posição, não no item).
- "Configurar ícones": **escolhido o botão desabilitado com a dica "em breve"** em vez de omitir. O
  caminho da gestão de ícones fica visível de onde o usuário está olhando os links, e a `087` só
  precisa tirar o `disabled` e apontar para `/tasks/link-icons` — omitir deixaria a 087 ter de
  descobrir sozinha onde o botão deveria nascer.
  - **Estado de hoje (posterior a esta feature)**: a `087` entrou e fez exatamente isso — o botão
    está **habilitado** e abre `/tasks/link-icons` em outra aba (navegar por cima do formulário
    descartaria o que ainda não foi salvo), e a prévia de cada linha passou a resolver por
    `resolveLinkAppearance(url, rules)` em vez de `describeExternalLink` direto, para não mentir
    justamente quando a regra é nova. Anotado aqui porque a decisão acima descreve o dia em que foi
    tomada, não o código de agora.
- **`AgendaGrid.tsx` (terceiro call site do formulário): fiado igual às outras duas telas**, não
  com a seção desabilitada. A Agenda edita tarefas que já existem; uma seção que abrisse vazia numa
  tarefa com links e perdesse a edição ao salvar seria pior do que não existir. O que **continua
  fora de escopo** ali é o chip nos itens da agenda — nem a Agenda nem o Gantt mostram chip de link
  (decisão original da feature). Coberto por dois testes em `AgendaGrid.test.tsx`.
- O prop dos cards ficou sendo o **mapa** (`externalLinksByTask`), não a lista da linha: a linha
  aninhada da subtarefa é a mesma `TaskListRow` e precisa dos links dela: sem o mapa, subtarefa
  perderia os chips que já tinha com `task.external_url`. Mesmo formato de `subtasksByParent`.
- URL repetida é **descartada no salvar** (fica a primeira ocorrência), depois de já ter sido
  acusada na própria linha do formulário — em vez de bloquear o salvar inteiro por uma linha que o
  usuário provavelmente colou duas vezes sem querer.
- O gatilho da seção mostra o resumo num `<span>` irmão do rótulo, então o **nome acessível** do
  botão sai colado ("Links externosowner/repo#7"). É como o `CollapsibleField` da 080 já se comporta
  com Descrição/Subtarefas; não foi mexido aqui para não alterar o nome acessível de todos os
  gatilhos do painel numa feature que não é sobre isso. Os testes conferem o resumo por
  `toHaveTextContent`, não pelo nome acessível.
- `wipe_own_data` foi reescrita a partir da versão da `20260820120000_event_invite.sql` (a mais
  recente), só acrescentando `task_external_link` antes de `task`. Observação de passagem, **não
  corrigida aqui** por ser de outra feature: essa lista perdeu `note_link`, `note_canvas` e
  `task_shopping_item_link` quando a `20260816230000_medication.sql` a redefiniu sem eles — hoje
  essas três tabelas só somem no wipe pelo `on delete cascade` das FKs.
- **2026-09-18 — `TaskList.external-links.test.tsx` era intermitente na suíte completa** (passava
  8/8 sozinho, estourava o teto padrão de 5s quando os workers do Vitest disputam CPU). Não era
  regressão do código da feature: o arquivo monta a `TaskList` inteira em cada caso e **digitava**
  URLs de ~40 caracteres, e cada tecla remontava o painel denso. Endurecido em duas frentes, sem
  mexer no comportamento afirmado: (1) as escritas passaram a ser `click` + `paste` num helper
  `fill()` — que também é o que se faz de verdade com uma URL, e o que a tela observa é o mesmo
  (`change` com o valor final + `blur`); (2) `vi.setConfig({ testTimeout: 20_000 })` no arquivo,
  como folga para a variação de carga. O arquivo caiu de ~2,7s para ~1,5s e o caso mais pesado de
  ~1,4s para ~0,5s. Quem precisa provar comportamento **por tecla** (o aviso de protocolo que não
  pode acusar no meio da digitação) é o `TaskExternalLinksField.test.tsx`, que continua usando
  `type` e não foi tocado.

### Checagem de satisfação (2026-08-23)

Cada pedido do `prompt:` e de `## Prompts` contra o artefato que prova que foi cumprido:

| Pedido | Artefato |
| --- | --- |
| "os links externos devem ir para uma aba separada" | `TaskFormFields.test.tsx` → "a seção fica fechada por padrão e abre num clique, com a lista dentro" e "o campo único de link externo não existe mais no painel"; o teste de ordem dos blocos passou a exigir `Links externos` entre Tags e Subtarefas |
| "cada link terá também um comentário… um campo livre de comentário" | `TaskExternalLinksField.test.tsx` → "digitar URL e comentário escreve na linha certa"; `TaskList.external-links.test.tsx` → `saveExternalLinksForTask("novo-1", [{…, comment: "issue de origem", …}])`; no banco, `03_assert_behavior.sql` → "OK: unique barra link repetido…" (grava e lê `comment`) |
| "deve ser possível adicionar n links externos a uma tarefa" (2026-08-23) | `03_assert_behavior.sql` insere 3 links na mesma tarefa e confere a ordem por `position`; `TaskList.external-links.test.tsx` → "criar com dois links grava os dois depois do createTask" |
| "cada um com seu comentário" (2026-08-23) | mesmo teste acima (dois links, comentários independentes) + `TaskViews.test.tsx` → "cada um com o próprio rótulo e o próprio comentário no title" |
| "todos" (2026-08-23) | `TaskViews.test.tsx` → "com três links, saem três chips" e "com cinco links, saem três chips e um +2" |
| "…preview" (2026-08-23) | `TaskExternalLinksField.test.tsx` → "colar uma URL do GitHub e sair do campo mostra a prévia com owner/repo#N", "a prévia da linha 2 não muda quando a URL da linha 1 muda", "linha vazia mostra o marcador neutro" |
| "…gestão de ícones" (2026-08-23) | **Parcial por decisão escrita**: a resolução ícone+rótulo nasce aqui (`describeExternalLink`, coberta por 12 casos em `externalLink.test.ts`) e o botão "Configurar ícones" já existe no rodapé da seção, **desabilitado**. A tela onde o usuário edita as regras é a `todo/087`, que vai consumir `describeExternalLink` como o ramo "nenhuma regra casa" — decisão registrada em Decisões, não omissão |

Suíte completa depois de tudo: **222 arquivos / 2385 testes / 0 falhas**.

O arquivo **não vai para `done/`**: sobram duas tarefas que não são minhas — aplicar a migration
(`supabase db push` é do usuário) e o `drop column` bloqueado que só acontece depois da conferência.
Mesmo desfecho da `058` com `project.notes`.

### Reverificação (2026-09-18)

Rodada de manutenção: endurecimento do `TaskList.external-links.test.tsx` (ver Notas) e a seção
`## Como testar`, que faltava no arquivo, escrita e com a parte automatizada **executada como está
escrita lá**.

| Comando | Resultado |
| --- | --- |
| `npx vitest run src/domain/tasks/__tests__/externalLink.test.ts` | 25/25 |
| `npx vitest run src/api/__tests__/taskExternalLinks.test.ts` | 12/12 |
| `npx vitest run src/pages/admin/tasks/__tests__/TaskExternalLinksField.test.tsx` | 18/18 |
| `npx vitest run src/pages/admin/tasks/__tests__/TaskList.external-links.test.tsx` | 8/8 |
| `npx vitest run src/pages/admin/tasks/__tests__/ProjectDetail.external-links.test.tsx` | 4/4 |
| `npx vitest run src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx` | 50/50 |
| `npx vitest run src/pages/admin/tasks/__tests__/TaskViews.test.tsx -t "ExternalLinkChip"` | 8 passaram, 36 pulados |
| `npx vitest run src/pages/admin/tasks/__tests__/AgendaGrid.test.tsx -t "links"` | 2 passaram, 19 pulados |
| `bash supabase/tests/task_external_links/run.sh` | `OK: 20260823100000_task_external_links.sql validada em Postgres 16.` |
| `npm run build` | OK (`built in 17.52s`) |
| `npm run lint` | 0 erros, 88 avisos — todos `react-refresh/only-export-components` pré-existentes, nenhum em arquivo desta feature |
| `npm test` (suíte inteira) | **263 arquivos / 2899 testes / 0 falhas** |
| `npm run check:bundle` | `Bundle budget OK` |

Correção na linha "…gestão de ícones" da tabela acima: a `087` entrou desde então, então o botão
"Configurar ícones" **não está mais desabilitado** — ele abre `/tasks/link-icons` em outra aba
(`TaskExternalLinksField.test.tsx` → "o botão de configurar ícones leva à tela de regras, em outra
aba"), e tanto o chip do card quanto a prévia da linha resolvem por `resolveLinkAppearance(url,
rules)`, com `describeExternalLink` como o ramo "nenhuma regra casa" — exatamente o contrato
previsto em Decisões. O pedido "gestão de ícones" deixou de ser parcial.

O desfecho não muda: o arquivo **continua fora de `done/`** enquanto as duas tarefas do usuário
(aplicar a migration e, só depois da conferência, o `drop column`) não forem feitas. Sem o
`supabase db push`, a tabela `task_external_link` não existe no banco remoto e a verificação manual
do roteiro abaixo não tem como rodar.

## Como testar

### 1. Pré-requisitos

- **A migration desta feature ainda NÃO está aplicada.** `20260823100000_task_external_links.sql`
  está escrita e validada em Postgres 16 descartável, mas `supabase db push` é do usuário (aplica no
  banco remoto). **Enquanto ela não for aplicada, só a "Verificação automatizada" abaixo roda**: no
  app a seção aparece e é editável, mas nada é gravado e nenhum chip aparece — a tabela
  `task_external_link` não existe. Isso é o estado esperado, não defeito.
- Para a parte do banco: **Docker rodando** (`docker info` responde). O `run.sh` sobe um
  `postgres:16` descartável chamado `orbyva-task-external-links-pg` e o remove no fim; ele **não
  toca** no banco remoto.
- Para a parte manual: `npm run dev`, logado com um usuário qualquer, e a migration já aplicada.
  Tenha pelo menos **uma tarefa existente** (`/tasks`) e **um projeto com tarefas**
  (`/tasks/projects` → abrir um).
- A feature `087` (regras de ícone) não é pré-requisito: se a tabela `link_icon_rule` não existir,
  `useLinkIconRules` cai para lista vazia e todo link usa o rótulo por host (`describeExternalLink`).
  O que muda é só a aparência do ícone.

### 2. Verificação automatizada

Um comando por linha. "Passou" = `Test Files 1 passed` / `0 failed` em cada um.

```
npx vitest run src/domain/tasks/__tests__/externalLink.test.ts
npx vitest run src/api/__tests__/taskExternalLinks.test.ts
npx vitest run src/pages/admin/tasks/__tests__/TaskExternalLinksField.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/TaskList.external-links.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/ProjectDetail.external-links.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/TaskViews.test.tsx -t "ExternalLinkChip"
npx vitest run src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/AgendaGrid.test.tsx -t "links"
bash supabase/tests/task_external_links/run.sh
npm run build && npm run lint && npm test
```

O que cada um significa:

- `externalLink.test.ts` — as regras puras: `normalizeExternalLinkDrafts` (linha vazia sai, comentário
  sem URL sai, espaços aparados, `position` renumerada, duplicata reportada) e `describeExternalLink`
  (issue/PR do GitHub → `owner/repo#N`, resto → host sem `www.`, rótulo longo cortado com `…`).
- `taskExternalLinks.test.ts` — o I/O: **uma** consulta no lote, agrupamento por `task_id`, `user_id`
  em toda consulta, e `saveExternalLinksForTask` apagando só o que saiu e inserindo só o que entrou.
- `TaskExternalLinksField.test.tsx` — a lista editável: adicionar/remover/reordenar, aviso de
  protocolo **no blur** (e não no meio da digitação), aviso de duplicata na segunda linha, prévia do
  chip por linha e o botão "Configurar ícones".
- `TaskList.external-links.test.tsx` e `ProjectDetail.external-links.test.tsx` — o fluxo ponta a
  ponta nas duas telas: gravar **depois** do `createTask`, carregar os links ao editar, salvar a
  lista final sem o removido, e a falha da consulta em lote caindo para "sem chips" sem derrubar a
  página.
- `TaskViews.test.tsx -t "ExternalLinkChip"` — os chips do card: 1 link → 1 chip; 3 links → 3 chips
  com rótulo e `title` próprios; 5 links → 3 chips + `+2`; 0 links → nenhum chip; subtarefa mostra os
  links dela, não os da mãe.
- `TaskFormFields.test.tsx` — a seção no painel: fechada por padrão, resumo do gatilho ("N links" ou
  o rótulo do único), o campo antigo de link único **não existe mais**, e a ordem dos blocos com
  `Links externos` entre Tags e Subtarefas.
- `AgendaGrid.test.tsx -t "links"` — o terceiro call site do formulário (Agenda) carrega e grava a
  lista igual às outras duas telas.
- `run.sh` — imprime `OK: 20260823100000_task_external_links.sql validada em Postgres 16.` no fim.
  Ele prova, num Postgres descartável: schema + `unique (task_id, url)` + índice + FKs + as 4
  policies de RLS; a cópia do link antigo trazendo **exatamente** as tarefas com `external_url` não
  vazia; reaplicar a migration não duplicar; `wipe_own_data` apagando os links do usuário; e um
  controle negativo mostrando que antes da migration a tabela não existia (`undefined_table`).
- `npm test` — a suíte inteira, para garantir que nada adjacente quebrou.

### 3. Verificação manual, passo a passo

Só depois de `supabase db push` (ver tarefa "AGUARDA O USUÁRIO").

1. `/tasks` → **Nova tarefa**. O painel abre. Entre "Tags" e "Subtarefas" há o gatilho
   **"Links externos"**, fechado, sem resumo. *Esperado*: não existe mais nenhum campo solto "Link
   externo" no meio do formulário.
2. Clique no gatilho. *Esperado*: abre com o texto "Nenhum link ainda. Adicione o primeiro para
   guardar o endereço e por que ele importa." e um botão **"Adicionar link"**.
3. Clique em "Adicionar link", cole `https://github.com/owner/repo/issues/7` no campo de URL e saia
   do campo (Tab). *Esperado*: à direita da linha a prévia mostra o ícone do GitHub e o rótulo
   **`owner/repo#7`**; o gatilho da seção passa a resumir `owner/repo#7`.
4. No campo **Comentário** da mesma linha escreva `issue de origem`. *Esperado*: escreve livremente,
   sem validação nenhuma — é campo livre.
5. "Adicionar link" de novo, cole `https://docs.google.com/x`, Tab. *Esperado*: prévia
   `docs.google.com`; o resumo do gatilho vira **"2 links"**.
6. Dê título à tarefa e **Criar tarefa**. *Esperado*: a tarefa aparece na lista com **dois chips**
   ao lado do título — `owner/repo#7` e `docs.google.com`. Passar o mouse no primeiro mostra
   `issue de origem` (o comentário vai no `title`).
7. Clique no chip `owner/repo#7`. *Esperado*: abre a URL em outra aba e **não** abre o formulário da
   tarefa.
8. Abra a tarefa (clique no título) e abra "Links externos". *Esperado*: as duas linhas voltam com
   URL, comentário e na mesma ordem.
9. Use a seta **↑** da segunda linha. *Esperado*: as linhas trocam de lugar, as prévias vão junto com
   os links, e o foco fica na seta ↑ da **linha que se moveu** (apertar ↑ de novo não move o vizinho).
   Salve e confira que o chip que aparece primeiro no card é o de cima.
10. Remova uma linha (ícone ×) e **Salvar alterações**. *Esperado*: só aquele chip some do card; o
    outro continua, com o comentário dele.
11. Adicione 5 links numa tarefa e salve. *Esperado*: o card mostra **3 chips** e um **`+2`** no fim;
    o `title` do `+2` lista os rótulos que ficaram de fora.
12. Repita os passos 1–6 dentro de um projeto (`/tasks/projects` → abrir → nova tarefa) e na Agenda
    (`/tasks/agenda` → abrir uma tarefa existente). *Esperado*: mesma seção, mesmo salvamento. Na
    Agenda o **chip não aparece** nos itens do calendário — isso é decisão da feature, não falta.
13. No rodapé da seção, **"Configurar ícones"**. *Esperado*: abre `/tasks/link-icons` em **outra
    aba**, preservando o que está sendo editado.

### 4. Casos de borda e caminhos negativos

| Caso | O que fazer | Esperado |
| --- | --- | --- |
| URL sem protocolo | escreva `github.com/x` e saia do campo | aparece `Comece com https://` embaixo da linha; a prévia **continua**, só apagada. Voltar a digitar limpa o aviso |
| Aviso prematuro | comece a digitar `ht` e **não** saia do campo | nenhum aviso enquanto digita — a checagem é só no blur |
| URL repetida | cole a mesma URL em duas linhas | a **segunda** linha acusa `Este link já está na lista.`; a primeira fica limpa. Salvar mesmo assim grava **uma** vez (a primeira ocorrência) — o `unique (task_id, url)` não estoura |
| Linha em branco esquecida | "Adicionar link" e salvar sem preencher | a linha é descartada em silêncio; nenhum link vazio é gravado |
| Comentário sem URL | preencha só o comentário de uma linha | descartado junto com a URL vazia — comentário é atributo do link |
| Lista vazia | remova todos os links e salve | some o último chip do card; a seção volta ao estado "Nenhum link ainda" |
| Tarefa apagada | apague uma tarefa com links | os links somem junto (`on delete cascade`); conferível por `select count(*) from task_external_link where task_id = '<id>'` → 0 |
| Escopo de usuário | outro usuário abrindo a mesma lista | não vê nem grava link alheio — RLS por `user_id` nas 4 operações, coberto por `03_assert_behavior.sql` |
| Setas nas pontas | primeira linha / última linha | ↑ da primeira e ↓ da última ficam desabilitadas |
| Tabela fora do ar | (simulável só com a migration ausente) | a lista de tarefas **continua de pé**, sem chips e sem toast de erro — a falha do lote cai para mapa vazio |

### 5. Sinais de que quebrou

- **Nenhum chip em card nenhum, em todas as telas** → a migration não foi aplicada (a tabela não
  existe) ou a consulta em lote está falhando. Confira o console: a falha do lote é engolida de
  propósito, então ela **não** vira toast — o sintoma é a ausência silenciosa de chips.
- **A lista de tarefas some ou fica em branco ao carregar** → a falha do lote deixou de ser tolerada;
  é regressão da decisão "falha na consulta não derruba a lista".
- **Links somem ao salvar, ou salvam duplicados** → `saveExternalLinksForTask` está reescrevendo
  tudo em vez de aplicar o diff; olhe a ordem das chamadas (delete → insert → update).
- **Os links aparecem gravados mas sem `task_id`, ou erro "null value in column task_id"** ao criar
  tarefa nova → a gravação está acontecendo **antes** do `createTask`.
- **Abrir a tarefa B mostra os links da tarefa A** → o `openEdit` não está zerando/recarregando o
  rascunho.
- **A prévia treme a cada tecla, ou a prévia da linha 1 aparece na linha 2** → o estado paralelo
  `RowUiState[]` saiu de sincronia com a lista controlada.
- **O painel voltou a ter um campo "Link externo" solto** → a troca pelo `CollapsibleField` foi
  desfeita.
- **`run.sh` falha com "Cannot connect to the Docker daemon"** → é ambiente, não a feature: suba o
  Docker e rode de novo.
