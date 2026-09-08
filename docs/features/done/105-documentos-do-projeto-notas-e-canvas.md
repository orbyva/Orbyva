---
prompt: |
  - permitir criar notas e canvas por projeto, então ao clicar em projetos, ter uma seção para ver todos os documentos daquele projeto (aparecem aqui as notas e canvas com referência a tarefa) mas uma nota/canva vai ter um escopo do projeto, e podem ser vinculadas a uma tarefa
  - permitir adicionar links/arquivos também ao projeto, isso pode ser vinculado nas tarefas também, então eu posso subir um documento por meiod e uma tarefa, e isso fica na base desse projeto
---

# 105 — Documentos do projeto: notas e canvas, inclusive os de tarefas

## Contexto

Esta feature cobre o **primeiro** item do pedido-mãe (o segundo vira as features 106 e 107).

A página do projeto já tem uma aba "Notas" (feature 069) que monta `ProjectNotesSection`. Ela lista
`fetchNotes({ projectId })` — ou seja, **só** as notas com `note.project_id` daquele projeto — em
lista somente-leitura, com um único botão "Nova nota" (sempre markdown). O pedido é maior que isso
em quatro pontos concretos:

1. **"ver todos os documentos daquele projeto (aparecem aqui as notas e canvas com referência a
   tarefa)"** — hoje uma nota vinculada por `note_link` a uma tarefa do projeto, ou vinculada ao
   próprio projeto por `note_link` (`entity_type: 'project'`, feature 056), **não aparece** se o
   `project_id` dela estiver vazio ou apontando para outro lugar. O `buildTaskNoteDraft` (feature
   084) copia o `project_id` da tarefa na criação, então o caso comum funciona por acidente — mas
   nota criada solta e vinculada à tarefa depois, ou tarefa que mudou de projeto depois, somem da
   aba. A lista precisa ser a **união** das três origens.
2. **"criar notas e canvas por projeto"** — a aba só cria markdown. Canvas (feature 058) só nasce
   em `Notes.tsx` ou pelo atalho da tarefa (`TaskNoteButtons`, feature 084).
3. A lista não distingue nota de canvas (um canvas aparece como uma nota de trecho vazio) nem diz
   **de qual tarefa** o documento veio — que é justamente o que o pedido quer ver ali.
4. A contagem do gatilho da aba (`countNotesByProject`) conta só o `project_id`, então passaria a
   discordar da lista.

Isto **não** é continuação da tarefa bloqueada da 058 (`drop column project.notes`): aquela é
limpeza de dado antigo, esta é comportamento novo. A 058 não é tocada aqui.

## Decisões

- **"Documentos do projeto" = união de três origens, deduplicada por `note.id`:** (a) notas com
  `note.project_id = P`; (b) notas com `note_link(entity_type='task', entity_id ∈ tarefas de P)`;
  (c) notas com `note_link(entity_type='project', entity_id = P)`. Canvas entra pelas mesmas três
  portas — canvas **é** uma nota (`note.kind`, decisão da 058), não uma entidade à parte.
- **Uma nota vinculada a uma tarefa de P mas com `project_id` de outro projeto aparece nos dois.**
  Não é bug: a referência à tarefa é o que a põe na lista de P, e o `project_id` é o que a põe na do
  outro. Esconder uma das duas seria mentir sobre um vínculo que existe. O item mostra a tarefa de
  origem, então dá para entender por que ela está ali.
- **A aba passa a se chamar "Documentos"; o valor na URL continua `notas`.** O rótulo muda porque a
  aba deixa de ser só notas (e a 106 vai pendurar "Links e arquivos" nela). O `?tab=` é contrato
  público desde a 069 (links salvos, voltar do navegador, testes), então o valor não muda —
  `?tab=documentos` é aceito como **alias** e resolve para a mesma aba.
- **Uma aba só, não duas.** O pedido fala em "uma seção para ver todos os documentos daquele
  projeto" e, no segundo item, numa "base desse projeto" — é um lugar só na cabeça do usuário. A
  aba "Documentos" hospeda a lista de notas/canvas (esta feature) e, depois, a base de links e
  arquivos (106/107). Descartado abrir uma sexta aba: a 069 existe justamente porque a `TabsList`
  já está no limite de largura em 360px.
- **Cabeçalhos internos voltam**, agora que a aba tem mais de uma seção — a 069 tirou o `<h2>`
  porque o gatilho da aba já era o título, o que deixa de valer quando a aba tem duas listas. O
  `showHeading` de `ProjectDocumentsSection` passa a ser usado com `true` dentro da aba.
- **`ProjectNotesSection` é renomeado para `ProjectDocumentsSection`** (arquivo, componente e
  teste). O nome antigo passaria a mentir, e o componente só tem um consumidor (`ProjectDetail`).
- **A união é montada em duas camadas: função pura no domínio + I/O na API.** A dedupe, a ordem e a
  anexação da tarefa de origem são regra testável sem banco (`src/domain/notes/projectDocuments.ts`);
  a API só busca. Padrão de camadas do `docs/stack.md`.
- **A busca de `note_link` não passa lista de ids de tarefa na URL.** `.in("entity_id", taskIds)`
  com um projeto de algumas centenas de tarefas gera uma URL de GET de dezenas de KB, que estoura
  limite de servidor. Em vez disso: uma consulta traz os `note_link` do usuário com
  `entity_type in ('task','project')` (poucas linhas — vínculo é criado a dedo) e o cruzamento com
  os ids das tarefas do projeto acontece em memória. É a mesma troca que `fetchNotesSharingEntity`
  já faz.
- **A contagem do gatilho é honesta: conta a união.** Não dá para contar união distinta com
  `head: true`, então `countProjectDocuments` faz as mesmas consultas selecionando **só ids**
  (`select("id")` / `select("note_id, entity_type, entity_id")`), nunca `*`. Continua barato e
  continua fora do caminho de montagem da aba, preservando o ganho da 069 (o conteúdo da aba só
  carrega quando a aba abre). Descartado passar os ids já carregados como prop: acoplaria a seção
  ao ciclo de carga da página, e a seção precisa funcionar montada sozinha (é assim que os testes
  dela existem hoje).
- **`countNotesByProject` é removido** junto com seu uso: deixar duas contagens que discordam é
  como uma regressão futura volta.
- **A tarefa de origem aparece como texto, não como link.** Não existe rota para uma tarefa
  específica (`src/routes.tsx` tem `/tasks`, `/tasks/projects/:id`, `/tasks/agenda`… nunca
  `/tasks/:id`). O rótulo sai do `note_link.label`, que a 056 congela no momento do vínculo, então
  funciona inclusive para tarefa apagada depois.
- **Estado de erro deixa de se disfarçar de estado vazio.** Hoje a seção mostra o toast e cai no
  `EmptyState` "Nenhuma nota neste projeto" — o usuário lê "não há documentos" quando o que houve
  foi falha de rede. Passa a ter um terceiro estado, com "Tentar de novo".
- **Nada de filtro por tipo, busca ou edição inline nesta aba.** A lista continua somente-leitura,
  com o link para o editor — quem escreve é o editor (decisão da 055, mantida).

## Tarefas

- [x] `src/types/notes.ts`: tipo `ProjectDocument` = `Note` + `sources: readonly ProjectDocumentSource[]`
      (`'project' | 'task' | 'link'`) + `taskLabel: string | null` (o rótulo congelado da tarefa de
      origem, `null` quando não veio de tarefa). Documentar que uma nota pode ter mais de uma
      origem. Verificação: `npm run build`
- [x] `src/domain/notes/projectDocuments.ts` (novo, puro, sem I/O): `mergeProjectDocuments({ projectNotes, linkedNotes, links, projectTaskIds, projectId })` → `ProjectDocument[]`
      deduplicado por `note.id`, ordenado por `updated_at desc` (empate: `title` em ordem
      alfabética, para a lista não tremer entre renders), com `sources` e `taskLabel` preenchidos.
      Verificação: `npm run build`
- [x] `src/domain/notes/__tests__/projectDocuments.test.ts` (novo): nota que é das três origens ao
      mesmo tempo aparece **uma** vez com as três em `sources`; vínculo órfão (tarefa fora do
      projeto / apagada) não entra; nota de outro projeto vinculada a uma tarefa deste **entra**,
      com `taskLabel`; ordem por `updated_at desc` com desempate estável; entrada vazia devolve
      `[]`. Verificação: `npm test src/domain/notes`
- [x] `src/api/notes/projectDocuments.ts` (novo): `fetchProjectDocuments(projectId)` — (1) notas do
      projeto, (2) `task.id` do projeto, (3) `note_link` do usuário com `entity_type in ('task','project')`,
      (4) as notas que faltam por id — sempre com `.eq("user_id", userId)` explícito, e delegando a
      composição a `mergeProjectDocuments`. Verificação: `npm run build`
- [x] `src/api/notes/__tests__/projectDocuments.test.ts` (novo): com o `supabase` mockado, afirma
      que **nenhuma** consulta manda lista de ids de tarefa em `.in("entity_id", …)` (é a decisão
      de URL que uma regressão desfaz sem querer), que todas filtram por `user_id`, e que a quarta
      consulta não acontece quando não sobra nota nenhuma para buscar. Verificação:
      `npm test src/api/notes`
- [x] `src/api/notes/projectDocuments.ts`: `countProjectDocuments(projectId)` — mesmas consultas,
      selecionando só ids (`select("id")` / `select("note_id, entity_type, entity_id")`), devolvendo
      o tamanho da união. Verificação: teste afirmando que nenhuma das consultas pede `*`
- [x] Remover `countNotesByProject` de `src/api/notes/notes.ts` e o teste que só cobria ela, depois
      de trocar o uso em `ProjectDetail`. Verificação: `npm run build && npm run lint`
- [x] Renomear `src/pages/admin/notes/ProjectNotesSection.tsx` → `ProjectDocumentsSection.tsx`
      (componente, props e import em `ProjectDetail.tsx`), e o teste
      `__tests__/ProjectNotesSection.test.tsx` → `ProjectDocumentsSection.test.tsx`, sem mudança de
      comportamento neste passo. Verificação: `npm run build && npm test src/pages/admin/notes`
- [x] `ProjectDocumentsSection`: trocar `fetchNotes({ projectId })` por `fetchProjectDocuments`,
      com o texto do `EmptyState` virando "Nenhum documento neste projeto" (descrição citando nota,
      canvas e o vínculo com tarefa). Verificação: `npm test src/pages/admin/notes`
- [x] `ProjectDocumentsSection`: terceiro estado, de erro — mensagem própria + botão "Tentar de
      novo" que rechama o `load()`, em vez de cair no estado vazio. Verificação: teste com a API
      rejeitando: aparece o erro, **não** aparece "Nenhum documento", e o retry refaz a chamada
- [x] `ProjectDocumentsSection`: cada item ganha o ícone do tipo (`NotebookPen` para markdown,
      `PenTool` para canvas, com `aria-label`) e, em canvas, "N elementos" via `canvasElementCount`
      no lugar do trecho de markdown — mesmo idioma de `Notes.tsx`. Verificação:
      `npm test src/pages/admin/notes`
- [x] `ProjectDocumentsSection`: badge "da tarefa <título>" quando `taskLabel` existe (texto, não
      link — não há rota de tarefa), truncado e com `title` completo. Verificação: teste com nota
      vinda só por vínculo de tarefa
- [x] `ProjectDocumentsSection`: botão "Novo canvas" ao lado de "Nova nota", criando
      `{ kind: 'canvas', canvas_data: { elements: [] }, project_id }` e navegando para
      `/notes/{id}` — mesmo payload que `Notes.tsx` monta. Os dois botões ficam fora do ar
      enquanto uma criação está no ar. Verificação: teste dos dois botões, inclusive o
      `canvas_data` enviado
- [x] `ProjectDocumentsSection`: falha ao criar não navega e mostra toast (já é o caso de "Nova
      nota"; garantir para o canvas), e o botão volta a ficar clicável. Verificação: teste com
      `createNote` rejeitando
- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: rótulo do gatilho vira "Documentos" (com a
      contagem de `countProjectDocuments`), o valor da aba continua `notas`, e `?tab=documentos` é
      aceito como alias que resolve para ela. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/ProjectDetail.tsx`: a aba passa a renderizar
      `<ProjectDocumentsSection showHeading />` — o cabeçalho volta porque a aba vai hospedar mais
      de uma seção (106). Atualizar o comentário do bloco, que ainda descreve a decisão da 069.
      Verificação: `npm run build`
- [x] `src/pages/admin/tasks/__tests__/ProjectDetail.tabs.test.tsx`: casos novos — o gatilho diz
      "Documentos" com a contagem da união; `?tab=documentos` abre a mesma aba que `?tab=notas`;
      `?tab=foo` continua caindo no Kanban; **as consultas de documentos continuam não acontecendo
      enquanto a aba não é aberta** (o ganho de carga da 069, que esta feature não pode desfazer).
      Verificação: `npm test src/pages/admin/tasks`
- [x] Conferir os testes que ainda falam de "Notas do projeto"/`countNotesByProject`
      (`ProjectDetail.*`, `Notes.*`, fluxos de navegação) e ajustar os que quebrarem. Verificação:
      `npm test`
- [x] `npm run build`, `npm run lint`, `npm test` e `npm run check:bundle` limpos, com a contagem de
      arquivos/testes registrada nas Notas. Verificação: os quatro comandos
- [x] Verificação do pedido literal, por teste e não no navegador: num projeto com (a) uma nota de
      `project_id`, (b) um canvas vinculado a uma tarefa do projeto e sem `project_id`, e (c) uma
      nota vinculada ao projeto por `note_link`, a aba "Documentos" mostra os três, cada um com o
      ícone do seu tipo, e o canvas mostra de qual tarefa veio. Verificação: teste de fluxo

## Prompts

## Notas

- **O título da seção virou "Documentos do projeto"** (era "Notas do projeto"), junto com o id do
  `<h2>` (`project-documents-heading`). Não estava escrito em nenhuma tarefa, mas manter "Notas do
  projeto" como cabeçalho dentro de uma aba chamada "Documentos" seria incoerente — e é a seção que
  as Decisões descrevem como dona de nota **e** canvas.
- **`countProjectDocuments` faz uma quarta consulta (só ids) para conferir se as notas dos vínculos
  existem.** Sem ela, um vínculo apontando para nota apagada (ou escondida pela RLS) inflaria o
  número do gatilho em relação à lista — exatamente a discordância que motivou tirar o
  `countNotesByProject`. Continua barato: `select("id")`, e só quando sobra id para conferir.
- **`notesCount` virou `documentsCount` em `ProjectDetail`**, para o nome não mentir depois da troca
  da fonte da contagem.
- **A verificação do pedido literal ganhou arquivo próprio**
  (`src/pages/admin/tasks/__tests__/ProjectDetail.documents.flow.test.tsx`): monta a página do
  projeto em `?tab=documentos` com a **API e o domínio de verdade** rodando contra um Postgres falso
  (o único duplo é o `supabase`). É o teste que prova o caminho inteiro sem navegador — as três
  origens juntas, os ícones, a badge da tarefa, a contagem do gatilho e a ordem.
- **Os testes de `ProjectDetail.*` que mockavam `@/api/notes/notes` ganharam o mock de
  `@/api/notes/projectDocuments`** — a página passou a importar a contagem de lá, e sem o mock cada
  um deles tentaria falar com o Supabase de verdade.
- **Fechamento (31/08/2026):** `npm run build` ✅, `npm run lint` ✅ (0 erros, 91 warnings de
  `react-refresh/only-export-components`, todos anteriores a esta feature), `npm run check:bundle` ✅
  ("Bundle budget OK") e a suíte inteira ✅ — **2939 testes em 924 arquivos, 0 falhas**.
  Arquivos novos desta feature: 5 (`domain/notes/projectDocuments.ts` + teste,
  `api/notes/projectDocuments.ts` + teste, `ProjectDetail.documents.flow.test.tsx`); testes novos:
  13 (domínio) + 13 (API) + 9 (seção) + 3 (aba) + 3 (fluxo).
- **A máquina estava sobrecarregada (load 44 em 10 núcleos) e a suíte inteira falhava por timeout**
  em ~8 arquivos pesados de jsdom (`TaskList.form-panel`, `notaSemSintaxe`, `AgendaGrid.*`…), todos
  fora do alcance desta feature e todos verdes quando rodados sozinhos. Com
  `--maxWorkers=4 --testTimeout=30000` a suíte fecha limpa. Fica o registro: o teto de 5 s do
  `testTimeout` padrão é apertado para esses arquivos nesta máquina — não é regressão.
