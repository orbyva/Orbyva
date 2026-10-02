---
prompt: |-
  E faça isso no mobile:
  [...]
  Notas
  - Backlinks e menções. A web mostra quais notas apontam para a nota atual e quais notas citam uma
    tarefa ou entidade (BacklinksPanel.tsx, TaskMentionsSection.tsx, EntityNotesSection.tsx). Isso
    não existe no mobile.
---

# 199 — Backlinks e menções no mobile

## Contexto
- Web:
  - `BacklinksPanel` ("Mencionada em") mostra as notas com `[[título]]` e as notas ligadas às mesmas
    entidades por `note_link`.
  - `TaskMentionsSection` ("Referenciada em") mostra as notas e tarefas cujo texto traz
    `[Rótulo](orbyva-task:<id>)`.
  - `EntityNotesSection` mostra as notas ligadas a cada meta.
  - Em todos os casos, o `ilike` serve só de prefiltro, e o parser descarta marcas dentro de código.
- Mobile: só criava e removia `note_link` a partir da nota (`NoteLinksSection`). Não tinha consulta
  reversa nem o parser de `orbyva-task:`.

## Decisões
- As consultas ficam em `mobile/src/api/notes/mentions.ts`: `fetchNotesMentioningTitle`,
  `fetchNotesSharingEntity`, `fetchNotesLinkedTo`/`Many` e `fetchTaskMentions`. A confirmação pelo
  parser roda **dentro** da API, então a tela recebe só menções reais.
- `codeRanges` saiu de `domain/notes/wikiLinks.ts` para `lib/markdownCode.ts`, igual à web, para o
  parser de tarefa (`domain/tasks/taskRefs.ts`) usar o mesmo critério de código sem importar do
  domínio de notas.
- Onde aparece:
  - **"Mencionada em"** no fim da tela da nota. Ela recarrega 600 ms depois de o título mudar,
    porque renomear muda quem aponta para a nota.
  - **"Referenciada em"** no formulário de edição da tarefa, junto das "Notas ligadas a esta
    tarefa" (o que a web mostra no `TaskNoteButtons`). Sem nada para mostrar, a seção não aparece.
  - **"Notas"** em cada card da lista de metas, carregadas em lote como na web.
- Na web, tocar numa tarefa citada abre `/tasks?task=`; no mobile abre o formulário da tarefa.

## Tarefas
- [x] `mobile/src/lib/markdownCode.ts`, `lib/likePattern.ts`, `domain/tasks/taskRefs.ts`;
  `wikiLinks.ts` passa a importar `codeRanges`.
- [x] `mobile/src/api/notes/mentions.ts`.
- [x] Testes:
  - `api/__tests__/mentions.test.ts`, com um banco falso que aplica `eq`/`neq`/`in`/`ilike` de
    verdade. Cobre: wiki-link dentro de código e nota de outro usuário ficam de fora; curinga do
    LIKE é escapado; "mesmas coisas" confere o par tipo+id; o agrupamento por meta ignora nota
    sumida; "Referenciada em" ignora código e a própria tarefa e não liga para maiúsculas no id.
  - `domain/tasks/__tests__/taskRefs.test.ts`.
- [x] Componentes `components/notes/{MentionList,NoteBacklinksSection,EntityNotesSection}.tsx` e
  `components/tasks/TaskMentionsSection.tsx`, montados em `notes/[id].tsx`, `tasks/form.tsx` e
  `goals/index.tsx`.
- [x] `npx tsc --noEmit` e `npx vitest run` no `mobile/` (79 testes).

## Como testar
1. `cd mobile && npx vitest run src/api/__tests__/mentions.test.ts src/domain/tasks/__tests__/taskRefs.test.ts`
   roda 8 testes.
2. No app:
   - Crie a nota "Plano" e outra nota com "revisar o [[Plano]]". Abra "Plano": "Mencionada em" lista
     a outra nota.
   - Escreva `` `[[Plano]]` `` (entre crases) numa terceira nota: ela **não** aparece.
3. Na web, insira a marca de uma tarefa numa nota (botão de referenciar tarefa). No app, abra a
   tarefa: "Referenciada em → Notas" mostra a nota. Toque nela e a nota abre.
4. Vincule uma nota a uma meta (seção "Vínculos" da nota). Na lista de Metas, o card da meta mostra
   "Notas" com o título.
