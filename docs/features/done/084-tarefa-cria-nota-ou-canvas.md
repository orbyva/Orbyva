---
prompt: |
  adicionar, relação entre tarefa->nota->canva

  de modo que eu possa ir em tarefa -> criar nota, ou criar canva (somente ícone) simplificado, e aí eu vou pra uma nota, um desenho daquela tarefa. na tela de notas, o link fica feito, o projeto já preenchido etc
---

# 084 — Tarefa cria nota ou canvas, já vinculados

## Contexto

O módulo de Notas (features `done/055` a `in-progress/058`) já sabe conversar com o resto do app:
`note.project_id` é o vínculo primário com projeto, e `note_link` (056) é o vínculo polimórfico N:N
com qualquer entidade — **`"task"` já está no `check` do banco e em `NOTE_LINK_ENTITY_TYPES`**
(`src/types/notes.ts`), com rótulo ("Tarefa"), ícone (`CheckSquare`) e rota em
`src/domain/notes/noteLinkTargets.ts`. O que não existe é o caminho **de ida**: hoje só dá para
partir da nota e procurar a tarefa no `NoteLinksPanel`, nunca partir da tarefa.

Do outro lado, o formulário de tarefa é um painel denso (`done/080`, `TaskFormFields.tsx`), com uma
linha de "instrumentos" só-ícone (ícone, prioridade, marco, pontual) — é exatamente a fileira em que
dois botões só-ícone cabem sem custo de altura, que é o que o pedido chama de "somente ícone,
simplificado".

Canvas não é entidade separada: é uma nota com `kind = 'canvas'` (058). `CanvasEditor.tsx` já
renderiza o `ProjectPicker` e o `NoteLinksPanel`, então "o link fica feito, o projeto já preenchido"
aparece sozinho nos dois editores assim que a criação gravar as duas coisas.

## Decisões

- **O vínculo é `note_link` (`entity_type: "task"`), sem coluna nova em `task` e sem migration.**
  A tabela polimórfica da 056 foi feita exatamente para isto, `"task"` já é um tipo válido, e uma
  coluna `task.note_id` criaria um segundo mecanismo de vínculo tarefa↔nota concorrente com o que já
  existe. Esta feature **não tem migration** — é o sinal de que ela está encaixando, não inventando.
- **A relação é 1-para-N, não 1-para-1.** Uma tarefa pode ter várias notas e vários canvas (pauta,
  rascunho, diagrama). O `unique (note_id, entity_type, entity_id)` do banco só impede vincular a
  *mesma* nota duas vezes à mesma tarefa — que é o que se quer impedir.
- **Clicar com nota já vinculada NÃO cria outra silenciosamente.** Regra fechada:
  - **zero notas vinculadas** → cria e navega direto para o editor (é o fluxo do pedido, um clique);
  - **uma ou mais** → o botão abre um popover listando as existentes (clicar abre) mais um item
    "Criar outra nota" / "Criar outro canvas".
  Cada botão conta só o seu `kind`: o botão de nota ignora canvas e vice-versa — senão criar um
  canvas passaria a esconder o atalho de nota atrás de um popover.
- **Nota e canvas são botões separados, ambos só-ícone**, com os mesmos ícones que `Notes.tsx` já
  usa (`NotebookPen` para nota, `PenTool` para canvas), na linha de instrumentos do painel denso.
  Descartado um botão único com menu: são duas opções, e a 058 já rejeitou esconder o canvas atrás
  de um clique a mais pelo mesmo motivo (ele fica invisível para quem não sabe que existe).
- **Só em modo edição.** O `note_link` precisa de `entity_id`, e uma tarefa não salva não tem id.
  Em criação os dois botões ficam desabilitados com a dica curta "Salve a tarefa antes" — o mesmo
  padrão que `TaskIconPicker` já usa para o upload de imagem. Descartado salvar a tarefa
  implicitamente ao clicar: salvar por efeito colateral de um botão que fala de outra coisa é
  surpresa, e o formulário pode estar num estado inválido (título vazio).
- **O que a nota nasce com**: `title` = título da tarefa (cortado por `NOTE_TITLE_MAX`, que
  `normalizeNoteDraft` já aplica), `project_id` = `task.project_id` (o "projeto já preenchido"; nulo
  quando a tarefa não tem projeto → nota solta, que é caso normal), `content: ""`, e o `note_link`
  para a tarefa com `label` = título da tarefa (rótulo congelado, regra da 056). Canvas: idem, com
  `kind: "canvas"` e `canvas_data: { elements: [] }` — o mesmo payload que `Notes.tsx` já monta.
- **Nota de tarefa aparece na aba "Notas" do projeto (069) sem nada a fazer**, porque a aba filtra
  por `note.project_id` e a nota nasce com ele preenchido. É consequência da decisão acima, não um
  caminho separado — mas é comportamento que o usuário vai ver, então tem teste.
- **Série recorrente: o vínculo é da ocorrência, não da série.** Ao contrário do ícone (`done/073`),
  a nota é conteúdo, não marcador visual: uma pauta escrita na terça não vale para a ocorrência de
  quinta. Sem fan-out, sem aviso no botão.
- **Criação falha → nada fica pela metade.** `createNote` e `addNoteLink` são duas chamadas; se a
  segunda falhar, a nota já existe. Decisão: **não** apagar a nota (perder o que o usuário mandou
  criar é pior que um vínculo faltando); navegar assim mesmo e avisar por toast que o vínculo com a
  tarefa não foi gravado — o `NoteLinksPanel` do editor permite refazê-lo à mão.
- **`noteLinkHref("task", id)` continua devolvendo `/tasks`** (não existe rota de detalhe de
  tarefa). Melhorar isso é feature própria, fora daqui — registrado para não parecer esquecimento.
- **Tarefa excluída deixa vínculo órfão**, tolerado por decisão explícita da 056 (a UI mostra
  "referência removida"). Nada a implementar.

## Tarefas

- [x] Criar `src/domain/tasks/taskNoteDraft.ts` (puro, sem I/O): `buildTaskNoteDraft(task, kind)`
      devolvendo o `NoteDraft` (`title` do título da tarefa, `project_id` da tarefa, `content: ""`,
      `kind`, `canvas_data` só quando canvas) e `buildTaskNoteLinkDraft(noteId, task)` devolvendo o
      `NoteLinkDraft` (`entity_type: "task"`, `entity_id`, `label`). Exportar no
      `src/domain/tasks/index.ts`. Verificação: `npm run build`
- [x] Testar o domínio em `src/domain/tasks/__tests__/taskNoteDraft.test.ts`: nota de tarefa com
      projeto herda o `project_id`; tarefa sem projeto vira nota solta (`null`); canvas sai com
      `kind: "canvas"` e `canvas_data: { elements: [] }`; nota markdown sai com `canvas_data` nulo;
      título longo demais é cortado por `normalizeNoteDraft` sem estourar; título vazio cai em
      "Sem título". Verificação: `npm test src/domain/tasks`
- [x] Criar `fetchNotesLinkedToTask(taskId)` em `src/api/notes/noteLinks.ts` — ou confirmar que
      `fetchNotesLinkedTo("task", taskId)` já resolve e **não** criar função nova. Verificação:
      leitura do arquivo + `npm run build`
- [x] Criar `src/pages/admin/tasks/TaskNoteButtons.tsx`: dois botões só-ícone (`NotebookPen`,
      `PenTool`), com `ActionTooltip` e `aria-label` explícitos ("Criar nota desta tarefa" /
      "Criar canvas desta tarefa"), estado `disabled` quando não há `taskId`, e a dica "Salve a
      tarefa antes" no mesmo estilo `text-[10px] text-muted-foreground` do `TaskIconPicker`.
      Sem lógica de rede ainda — só a casca e os estados. Verificação: `npm run build && npm run lint`
- [x] Em `TaskNoteButtons.tsx`, implementar o clique com **zero** notas vinculadas: `createNote` +
      `addNoteLink` + `navigate(/notes/:id)`, com o botão em estado de carregamento (spinner
      `Loader2`, `disabled`) enquanto cria. Verificação: `npm run build`
- [x] Em `TaskNoteButtons.tsx`, carregar as notas já vinculadas à tarefa **só quando o componente
      monta com `taskId`** (uma consulta por abertura do formulário, não uma por botão) e separar
      por `kind`. Estado de carregamento não pode travar o botão em falso "zero" — enquanto carrega,
      o clique espera a lista antes de decidir criar ou abrir o popover. Verificação: `npm run build`
- [x] Em `TaskNoteButtons.tsx`, implementar o popover de "já existe": lista das notas (ou canvas)
      vinculadas com título e data de edição, cada uma navegando para `/notes/:id`, mais o item
      "Criar outra nota"/"Criar outro canvas". Contagem no `aria-label` do botão ("Notas desta
      tarefa — 2"). Verificação: `npm run build && npm run lint`
- [x] Tratamento de erro em `TaskNoteButtons.tsx`: falha em `createNote` → toast `destructive` com
      `getErrorMessage` e nenhum redirecionamento; falha só em `addNoteLink` → navega assim mesmo e
      avisa por toast que o vínculo não foi gravado (decisão registrada acima). Verificação:
      `npm run build`
- [x] Ligar `TaskNoteButtons` na linha de instrumentos de `TaskFormFields.tsx` (Bloco 4), depois do
      `TaskIconPicker`, passando `task={editing}` — sem criar linha nova e sem `FormLabel` próprio
      (é a fileira só-ícone). Verificação: `npm run build && npm run lint`
- [x] Criar `src/pages/admin/tasks/__tests__/TaskNoteButtons.test.tsx`: com zero vínculos, clicar em
      "Criar nota" chama `createNote` com o `project_id` da tarefa, chama `addNoteLink` com
      `entity_type: "task"` e navega para `/notes/<id>`; o mesmo para canvas, afirmando
      `kind: "canvas"`. Verificação: `npm test src/pages/admin/tasks`
- [x] Estender `TaskNoteButtons.test.tsx`: com uma nota já vinculada, o clique **não** chama
      `createNote` — abre o popover com o título da nota existente e o item "Criar outra nota";
      clicar na nota existente navega para ela; clicar em "Criar outra" cria a segunda.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Estender `TaskNoteButtons.test.tsx` com os estados de borda: em modo criação (`task` nulo) os
      dois botões estão `disabled` e a dica aparece; enquanto cria, o botão fica `disabled` com o
      spinner; erro de `createNote` vira toast `destructive` e não navega; erro só de `addNoteLink`
      navega e avisa; uma tarefa com canvas mas sem nota mantém o botão de nota em modo "cria
      direto" (as contagens são por `kind`). Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de integração em `src/pages/admin/tasks/__tests__/` (arquivo novo,
      `TaskFormFields.notes.test.tsx`): abrir o formulário de uma tarefa existente mostra os dois
      botões; abrir o de uma tarefa nova mostra os dois desabilitados. Verificação:
      `npm test src/pages/admin/tasks`
- [x] Teste do outro lado do vínculo, com o backend falso do módulo de notas
      (`src/pages/admin/notes/__tests__/`): a nota criada a partir de uma tarefa abre com o projeto
      já selecionado no `ProjectPicker` e com o chip "Tarefa — <título>" no `NoteLinksPanel`; o mesmo
      para o canvas, que renderiza `NoteLinksPanel` pelo `CanvasEditor`. Verificação:
      `npm test src/pages/admin/notes`
- [x] Teste da consequência na aba "Notas" do projeto (069): criada a nota de uma tarefa que tem
      projeto, ela aparece em `ProjectNotesSection` daquele projeto; criada a partir de tarefa sem
      projeto, **não** aparece em projeto nenhum. Verificação: `npm test src/pages/admin`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada aqui e o delta do chunk de rota de `/tasks` anotado (o módulo de notas é
      importado por API, não por componente pesado — se a rota engordar, é import estático indevido).
      **Resultado (23/08/2026):** build OK; lint 0 erros (81 warnings pré-existentes de
      `react-refresh/only-export-components`); `npm test` **218 arquivos / 2270 testes / 0 falhas**
      (baseline antes da 084: 214/2229 — os 41 novos são 11 de `taskNoteDraft`, 19 de
      `TaskNoteButtons`, 4 de `TaskFormFields.notes` e 7 de `notes-from-task`); `check:bundle` OK.
      **Delta de bundle:** o chunk que carrega `TaskFormFields` (`AgendaHourGrid-*.js`, rota de
      `/tasks`) foi de **14,0 KB → 15,3 KB gzip** (+1,3 KB), medido com o mesmo build sem e com o
      `TaskNoteButtons` ligado; teto da rota 160 KB. Nenhum `excalidraw`/`codemirror` entrou no
      chunk (conferido com `grep` no arquivo gerado) — o módulo de notas entra por API, como
      planejado.

## Prompts

## Notas

- Nenhuma função nova de API foi criada: `fetchNotesLinkedTo(entityType, entityId)`
  (`src/api/notes/noteLinks.ts`, feature 056) já é exatamente a consulta reversa que a 084 precisa
  — `fetchNotesLinkedTo("task", taskId)` devolve as notas da tarefa ordenadas por `updated_at desc`.
  Um `fetchNotesLinkedToTask` seria só um apelido, e apelido de uma linha vira duas implementações
  para manter quando a consulta mudar.
- O botão usa `PopoverAnchor`, não `PopoverTrigger`: quem decide entre criar e abrir a lista é o
  `onClick` (depende de quantas notas daquele `kind` existem), e um trigger abriria o popover mesmo
  quando o certo era criar direto.
- Ligar os botões no painel obrigou a envolver o `Harness` de `TaskFormFields.test.tsx` num
  `MemoryRouter` (o atalho navega para `/notes/:id`, e `useNavigate` exige Router acima) e a mockar
  `@/api/notes/noteLinks`+`@/api/notes/notes` lá — sem isso, 49 testes quebravam com
  "useNavigate() may be used only in the context of a <Router>". Os três call sites reais
  (`TaskList`, `ProjectDetail`, `AgendaGrid`) já são páginas roteadas.
- Falha ao **carregar** os vínculos cai em lista vazia (o botão volta a criar direto) em vez de
  travar o atalho: botão inerte sem explicação seria pior que criar uma nota a mais.
- O chip do `NoteLinksPanel` sai como **"Tarefa: <título>"** (dois-pontos), não "Tarefa — <título>"
  como a tarefa escrita aqui supôs: o formato é o da 056 (`NOTE_LINK_TYPE_LABEL[type] + ": "`) e
  vale para todos os tipos. O teste afirma o formato real; mudar a pontuação só do vínculo de
  tarefa deixaria o painel inconsistente.
- `buildTaskNoteDraft` recebe um `TaskNoteSource` estrutural (`Pick<Task, "id" | "title" |
  "project_id">`) em vez de `Task` inteira — é tudo que ele lê, e evita montar as ~30 colunas de
  `Task` em cada teste.
- **Checagem de satisfação (23/08/2026)** — cada pedaço do `prompt:` com o artefato que o comprova
  (`## Prompts` está vazio: nenhum pedido novo no meio da implementação):
  - "relação entre tarefa→nota→canva" → `taskNoteDraft.test.ts` › "vincula a nota à tarefa com
    entity_type 'task'" e `notes-from-task.test.tsx` › "abre com o vínculo da tarefa já feito no
    painel de Vínculos" (afirma `store.links[0] = {entity_type: "task", entity_id: "t1"}`).
  - "ir em tarefa → criar nota, ou criar canva" → `TaskFormFields.notes.test.tsx` › "abrir o
    formulário de uma tarefa existente mostra os dois botões prontos para usar";
    `TaskNoteButtons.test.tsx` › os dois testes de criação (nota e canvas).
  - "(somente ícone) simplificado" → `TaskFormFields.notes.test.tsx` › "os atalhos ficam na fileira
    só-ícone, sem rótulo próprio e sem ganhar linha nova" (botão sem texto, na mesma fileira do
    `TaskIconPicker`), e o clique único do caso "zero notas".
  - "e aí eu vou pra uma nota, um desenho daquela tarefa" → probe de rota em
    `TaskNoteButtons.test.tsx` (`/notes/note-1`, `/notes/note-2`) e `notes-from-task.test.tsx` ›
    "abre o editor de canvas…" (monta o `CanvasEditor`, `kind: "canvas"`, cena vazia).
  - "na tela de notas, o link fica feito" → chip "Tarefa: <título>" com `href="/tasks"` nos dois
    editores (`notes-from-task.test.tsx`, casos markdown e canvas).
  - "o projeto já preenchido" → `notes-from-task.test.tsx` › "abre com o projeto da tarefa já
    selecionado no ProjectPicker" (`aria-selected="true"`), mais o caso de tarefa sem projeto que
    cai em "Sem projeto".
  - "etc" (consequência na aba do projeto) → os dois testes de `ProjectNotesSection` em
    `notes-from-task.test.tsx`.
  - Suíte completa: 218 arquivos / 2270 testes / 0 falhas. O único "erro" da rodada é o
    `dispatchEvent` pós-teardown do focus-scope do Radix, em
    `MedicationQuickCreateDialog.reconcile.test.tsx` — pré-existente e fora desta feature.
