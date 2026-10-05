---
prompt: |-
  Pedido do usuário, verbatim (02/10/26):

  Eu queria também melhorar o front do mobile. To achando muito, sei lá. Deixar algo mais parecido com o web, sabe?
  Sim (fundação primeiro, telas em ondas, navegação por último)
  Vamos trabalhar só na melhora do front mobile
  pode arrochar

  Resposta P3 do planning: segunda onda é Produtividade (tarefas, agenda, notas).

  Fatia desta feature — onda 2: telas de Produtividade (tarefas, projetos, agenda, live, tags,
  convites, notas, compras, links) passam às primitivas e tokens, com a densidade aprovada na 203.
---

# 204 — Mobile, onda 2: Produtividade

## Contexto
Depende de 203 (teste-guarda, compartilhados migrados e densidade conferida com o usuário).

Telas: `app/(app)/tasks/` (`index`, `form`, `agenda`, `live`, `tags`, `link-icons`,
`event-invites`, `event-invite/[token]`, `projects/index`, `projects/[id]`, `projects/form`),
`app/(app)/notes/` (`index`, `[id]`, `form`, `folder-form`), `app/(app)/shopping/` (`index`, `form`,
`category-form`), `app/(app)/links/` (`index`, `form`). Componentes só delas: `TasksList`,
`TasksKanban`, `AgendaHourGrid`, `SubtaskFormRow`, `TaskIconBadge`, `TimeField`, `ColorDots`,
`tasks/TaskMentionsSection`, `NoteFolderPicker`, `NoteFolderTree`, `NoteLinksSection`,
`notes/*`, `MarkdownPreview`, `MermaidBlock`, `CanvasNote`.

Compras e links entram aqui por serem do mesmo grupo na sidebar do web.

## Decisões
- Mesma definição de "migrar" e mesma densidade da 203 (com o ajuste que o usuário tiver pedido
  lá).
- Cor de tarefa/tag/projeto escolhida pelo usuário é dado, não token: fica, com
  `// token-livre: cor escolhida pelo usuário` onde for literal de paleta de escolha
  (`ColorDots`).
- `MarkdownPreview`/`MermaidBlock`: tipografia da prévia sai da `TypeScale` (h1→`title`,
  h2→`heading`, corpo→`body`, código→`mono`); o tema do mermaid lê os tokens.
- Kanban continua em colunas horizontais (decisão da 098, 3e); só o visual muda.

## Tarefas
- [x] Migrar `tasks/index.tsx`, `TasksList`, `TasksKanban`, `TaskIconBadge` (linhas → `ListRow`,
      status/prioridade → `Badge`, abas Lista/Kanban/… → `Tabs`).
- [x] Migrar `tasks/form.tsx`, `SubtaskFormRow`, `TimeField`, `ColorDots`.
- [x] Migrar `tasks/agenda.tsx`, `AgendaHourGrid` e `tasks/live.tsx`.
- [x] Migrar `tasks/tags.tsx`, `tasks/link-icons.tsx`, `tasks/event-invites.tsx`,
      `tasks/event-invite/[token].tsx`, `tasks/TaskMentionsSection`.
- [x] Migrar `tasks/projects/index.tsx`, `[id].tsx`, `form.tsx`.
- [x] Migrar `notes/index.tsx`, `[id].tsx`, `form.tsx`, `folder-form.tsx`, `NoteFolderPicker`,
      `NoteFolderTree`, `NoteLinksSection`, `components/notes/*`.
- [x] Migrar `MarkdownPreview`, `MermaidBlock`, `CanvasNote` (tipografia pela `TypeScale`, cores
      pelos tokens; traços do canvas desenhados pelo usuário são dado).
- [x] Migrar `shopping/index.tsx`, `form.tsx`, `category-form.tsx` e `links/index.tsx`,
      `form.tsx`.
- [x] Acrescentar tudo acima a `MIGRATED` em `styleGuard.test.ts` e zerar as ocorrências.
- [x] Remover de `theme.ts` apelidos que tenham ficado sem uso (`rg` antes).
- [x] Rodar `cd mobile && npm test`, `npm run typecheck` e `npm run lint`.

## Prompts
- 02/10/26 — depois da conferência de densidade da 203: "Agora ficou bom demais. Bora avançar" (densidade da 203 vale aqui sem ajuste).

## Notas
- **Caminho**: os codemods da 203 rodaram em sequência nos 41 arquivos da onda (de ~580 ocorrências
  da guarda para 53); o resto foi à mão. Dois scripts novos: `codemod-empty-states.py` (estado
  vazio à mão → `EmptyState`, ícone pelo módulo) e `prune-unused-imports.py` (lê o `tsc` e tira o
  import morto). O `codemod-literal-colors.py` passou a fundir `themeColor` fixo + condicional num
  só (`cond ? "destructive" : "mutedForeground"`) — a primeira passada gerou atributo duplicado em
  `TasksList`/`TasksKanban`.
- **Cor com significado**: status de tarefa (`taskStatusTone`) e prioridade (`PRIORITY_TONE` em
  `domain/tasks/priority.ts`) viraram token. A cor de item da agenda, que estava duplicada em
  `agenda.tsx` e `AgendaHourGrid`, foi para `calendarItemColor` em `domain/tasks/calendar.ts`
  (tarefa pelo status, evento pela cor do projeto, `chart2` sem cor); `TASK_STATUS_COLORS` sumiu.
  Testes: `calendarItemColor.test.ts`, `priority.test.ts`, `semanticTone.test.ts`.
- **Cor de dado**: as cores iniciais de etiqueta, que vão para o banco, viraram constantes ao lado da
  paleta (`DEFAULT_TAG_COLOR`, `NEUTRAL_TAG_COLOR` em `domain/dimensions/listView.ts`), mantendo os
  valores de antes. Nenhum `// token-livre` foi preciso.
- **Prioridade continua bolinha**, não `Badge`: ao lado do título, um "Alta"/"Média" em texto
  disputaria largura com o título; a bolinha agora usa token (baixa `primary`, média `warning`,
  alta `destructive`). Status já aparece pela coluna do Kanban e pelo toque longo.
- **Tipografia**: `TypeScale.nano` (10/12) entrou só para a grade densa da agenda (bloco de 30 min,
  chip na célula do mês) — `micro` (11/14) cortaria o texto. `MarkdownPreview` segue a decisão
  (h1→`title`, h2→`heading`, h3→`bodyStrong`, corpo→`body`, código→`mono`); negrito e link wiki
  usam `weightStyle(700)` e código inline `MonoInline` (`typography.ts`), sem `fontFamily` na tela.
  Corpo da prévia passou de peso 500 para 400 (`body`).
- **Fundo de modal** da agenda: `SCRIM` em `domain/ui/color.ts` — tinta escura nos dois temas (no
  escuro `foreground` é claro e não serve de véu).
- **Campos que não são `TextInput`** (seletores de pasta/projeto/etiqueta, `TimeField`) usam
  `useInputStyle()`; `TimeField` ganhou o visual de campo por padrão, como o `DateField`.
- **Editor de nota** (título e corpo em `notes/[id]` e `notes/form`) manteve o layout de editor,
  só com fonte da `TypeScale`; não virou `Input` porque o corpo é área de escrita longa.
- **Timer** (`tasks/live`): Parar/Começar viraram `Button` (destrutivo e padrão, `lg`, com ícone).
- **Kanban**: só estilo mudou (37 linhas); nenhum handler de gesto/arraste foi tocado.
- **Header nativo** em Syne (`HeaderTitle`) nos stacks de tarefas, projetos, notas, compras e links.
- **`ListRow` não entrou** em `TasksList`/`TasksKanban`, pelo mesmo motivo da 203: linhas com
  subtarefas, ações e metadados não cabem no `ListRow`.
- **Apelidos de `theme.ts`**: nenhum pôde sair — ainda usados nas ondas 205–207.
- Verificação: `npm test` 30 arquivos / 364 testes verdes; typecheck limpo (com `noUnusedLocals`);
  guarda 93/93; prova da guarda: `fontSize: 15` no fim de `tasks/index.tsx` → falha em
  `tasks/index.tsx:447`, desfeito; `npx expo export --platform ios` gera o bundle (6,9 MB).
  `npm run lint` segue sem cobrir arquivo nenhum.
- 2026-10-05 — concluída na limpeza dos `.md` a pedido do usuário ("Pode concluir direto"); conferência no celular fica com o usuário (ver Como testar).

## Como testar

1. **Pré-requisitos**
   - 203 implementada e com a conferência de densidade respondida.
   - Conta com tarefas (com subtarefas, tags e projeto), notas em pastas, lista de compras e links.

2. **Verificação automatizada**
   - `cd mobile && npm test` — `styleGuard.test.ts` passa com as pastas `tasks`, `notes`,
     `shopping`, `links` e os componentes da onda em `MIGRATED`.
   - Prova de que a guarda morde: acrescente `fontSize: 15` num estilo de
     `app/(app)/tasks/index.tsx` → o teste falha naquela linha. Desfaça.
   - `npm run typecheck` e `npm run lint` sem erro.

3. **Verificação manual, passo a passo**
   1. Tarefas em lista → linhas com o mesmo desenho das transações de Finanças (mesma altura,
      recuo, tipografia); prioridade e status como badges.
   2. Troque para Kanban → colunas com cards da primitiva; arrastar entre colunas ainda funciona.
   3. Crie uma tarefa com subtarefa e horário → formulário igual ao de Finanças em campos e botões;
      a tarefa aparece na lista.
   4. Agenda (Mês / Semana / Dia) → grade com bordas e textos nos tokens; evento com a cor dele.
   5. Abra uma nota com títulos, lista, código e um bloco mermaid → títulos em Syne/semibold na
      mesma escala do resto do app; diagrama legível nos dois temas.
   6. Compras e Links → listas com `ListRow`, formulário com as primitivas.
   7. Repita 1, 4 e 5 no tema escuro.

4. **Casos de borda e caminhos negativos**
   - Tag com cor escolhida pelo usuário → mantém a cor dela, nos dois temas.
   - Nota vazia → estado vazio, não tela em branco.
   - Projeto sem tarefas → `EmptyState` com ação de criar.

5. **Sinais de que quebrou**
   - Kanban sem arrastar → o card trocou de componente e perdeu o handler de gesto.
   - Prévia de nota com fonte do sistema → `MarkdownPreview` ainda com `fontSize` próprio fora da
     guarda.
