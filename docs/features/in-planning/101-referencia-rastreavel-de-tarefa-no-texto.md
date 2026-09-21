---
prompt: |-
  quero que exista formas de referenciar tarefas, no projeto, que serão rastreáveis. Então se eu digitar>

  TASK-> painel de ...

  isso deve já criar e vincular uma task, ou posso na hora vincular uma já existente
---

# 101 — Referência rastreável de tarefa dentro do texto

## Contexto
- Escrever `TASK-> painel de ...` num texto do app deve criar a tarefa e vinculá-la, ou vincular uma já existente, com o vínculo visível dos dois lados.
- Metade do maquinário já existe para **nota**: `[[Título]]` com autocomplete (`src/components/codemirror/wikiLinkCompletion.ts:30`), decoração clicável (`wikiLinkNavigation.ts:27`), preview (`NoteMarkdownPreview.tsx:50`) e backlinks (`BacklinksPanel.tsx:29`).
- Para **tarefa** não existe nada disso: `noteLinkHref` manda `task` para `/tasks` genérico (`src/domain/notes/noteLinkTargets.ts:44`) e a Orb linka tarefa criada como `/tasks?q=<título>` (`src/api/orbActions.ts:66`) — não há destino por id.
- Hoje só há vínculo explícito por painel (`note_link`, feature 056) e checklist solto no markdown (`src/domain/notes/taskList.ts`), que não é `task` de verdade.

## Definições
- Referência de tarefa: marca no Markdown apontando para uma linha de `public.task`, renderizada como chip com rótulo e estado.
- Rastreável: dois sentidos — o texto mostra o estado atual da tarefa; a tarefa mostra onde é mencionada.
- `TASK->`: gatilho de digitação (abre o autocomplete), não necessariamente o que fica gravado — ver P2.
- Base de conhecimento (`~/.claude/knowledge/orbyva/`): só tem material de MCP; nada sobre editor/referências. Desenho parte do código do próprio repo.
- Fora: renomear tarefa reescrevendo texto de terceiros; referência em comentário de link externo (`task_external_link.comment`); referência dentro do chat da Orb; notificação/e-mail de menção.

## Estrutura
- Frente A — parser puro: a marca no texto.
  - `src/domain/notes/wikiLinks.ts:37` — `WIKI_LINK_RE` casa qualquer `[[…]]`; uma marca de tarefa em `[[…]]` seria confundida com nota. Marca de tarefa nasce em módulo novo (`src/domain/tasks/taskRefs.ts`), com `parseTaskRefs`/`taskRefPlainSegments` espelhando a API já provada de `wikiLinks.ts` (offsets, ignorar bloco e código inline).
  - Módulo novo porque o domínio de tarefa não pode depender de notas e vice-versa — `noteLinkTargets.ts:1` já importa de `types/notes`.
- Frente B — gatilho e autocomplete no editor.
  - `src/components/codemirror/wikiLinkCompletion.ts:30` — fonte de `[[` → irmã `taskRefCompletion.ts` casando `TASK->` + consulta, com `filter: false` e `foldForSearch` (o `[[` casa com acento; título de tarefa em PT-BR precisa do fold do `slashMenu.ts:44`).
  - Primeira opção do popup é sempre "Criar tarefa: <texto digitado>"; as demais são tarefas existentes (abertas primeiro).
  - `src/components/codemirror/wikiLinkNavigation.ts:27` — decoração + `pointerdown` → irmã para a marca de tarefa; o `pointerdown` (e não `click`) é obrigatório dentro do Dialog do Radix.
- Frente C — criação na hora.
  - `src/api/tasks/tasks.ts:201` (`createTask`) — mesma porta que a Orb usa (`src/api/orbActions.ts:48`); nada de insert próprio.
  - Espelha `handleCreateLinkedNote` (`src/pages/admin/tasks/TaskDescriptionField.tsx:60`): cria, devolve o registro, e o texto recebe a marca já resolvida.
- Frente D — render fora do editor.
  - `src/pages/admin/notes/NoteMarkdownPreview.tsx:50` — reescrita de `[[…]]` antes do `react-markdown`; a marca de tarefa entra no mesmo ponto, com chip de estado no lugar de `<a>`.
  - `src/pages/admin/tasks/TaskDescriptionSnippet.tsx:23` — `stripMarkdown` engole link markdown e deixa só o rótulo (`src/lib/markdown.ts:12`): se a marca for link (P2), a segmentação tem de rodar **antes** do strip, ao contrário do `[[…]]`, que sobrevive a ele.
- Frente E — destino clicável (pré-requisito da rastreabilidade).
  - `src/pages/admin/tasks/TaskList.tsx:328` já lê `project`/`q`/`status`/`view`/`priority`/`tag`/`today` da URL; falta `task=<id>`, que abriria o Dialog de edição (`TaskList.tsx:1287`, estado em `:148`).
  - `supabase/functions/_shared/orb/navigation.ts:99` — tela `tasks` declara os filtros aceitos; `task` entra lá e a Orb ganha o link por id de graça.
- Frente F — "Referenciada em" (o lado da tarefa).
  - `src/pages/admin/notes/BacklinksPanel.tsx:29` — padrão já assentado: `ilike` como prefiltro + parser confirmando. Com id no texto (P2) o prefiltro é exato, sem o falso positivo que o título traz.
  - `src/pages/admin/notes/EntityNotesSection.tsx:16` — seção apresentacional reusável; o análogo "Mencionada em" entra no formulário/painel da tarefa e, se P1 mandar, numa aba de `ProjectDetail.tsx:856`.

## Decisões
- Reusar `@codemirror/autocomplete` como gatilho, nunca popup próprio — mesma razão registrada em `slashMenu.ts:20`.
- Gravação passa por `createTask`, a mesma função dos formulários e da Orb; nenhuma escrita direta em `task`.
- Nenhuma tabela nova nesta rodada: referência vive no texto, backlink é derivado (decisão da 056 mantida).
- O gatilho é estreito: `TASK->` só dispara quando o que vem antes é espaço/início de linha — mesma regra do `/` (`slashMenu.ts:32`).
- Conteúdo persistido continua Markdown cru byte a byte; chip é decoração/render, nunca formato próprio.

## Perguntas em aberto
### P1 — Em quais campos de texto o `TASK->` vale?
- Recomendada: descrição de tarefa/subtarefa (`TaskDescriptionField.tsx`) + notas (`NoteEditor.tsx:122`) — são os dois que já montam o CodeMirror com `[[`; um terceiro campo exigiria editor novo.
- **Resposta:**

### P2 — Qual marca fica gravada no texto?
- Recomendada: `[Rótulo](orbyva-task:<id>)` — link markdown comum com esquema próprio, no espírito de `WIKI_LINK_MISSING_SCHEME` (`wikiLinks.ts:196`): resolve por id, sobrevive a rename, não colide com o parser de `[[…]]` e já é renderizável por qualquer consumidor de markdown. Alternativas: `TASK->Título` literal resolvido por título (fiel ao que foi digitado, mas título de tarefa se repete — recorrência materializa dezenas com o mesmo nome); `[[task:<id>|Rótulo]]` (exigiria excluir o prefixo em `WIKI_LINK_RE`).
- **Resposta:**

### P3 — A tarefa nasce no momento da escolha no popup ou só quando o documento é salvo?
- Recomendada: no momento da escolha — é o que dá o id que a marca precisa, e é o que `handleCreateLinkedNote` (`TaskDescriptionField.tsx:60`) já faz para nota. Custo aceito: desfazer o texto não apaga a tarefa criada.
- **Resposta:**

### P4 — Qual projeto a tarefa criada inline herda?
- Recomendada: herdar do contexto (nota com `project_id`, ou a tarefa que está sendo editada) e cair em `null` quando não houver — perguntar o projeto num popup de digitação mataria a fluidez.
- **Resposta:**

### P5 — Para onde o clique na referência leva?
- Recomendada: `/tasks?task=<id>` abrindo o Dialog de edição já existente (`TaskList.tsx:1287`) — não há `/tasks/:id`, e criar página de detalhe de tarefa é escopo próprio, maior que esta rodada.
- **Resposta:**

### P6 — O chip mostra o estado da tarefa, e dá para concluir por ali?
- Recomendada: mostra estado (ícone por `status` + traço no concluído) e **não** conclui pelo chip nesta rodada — marcar concluída dentro de um texto que também é editável mistura dois modos no mesmo clique.
- **Resposta:**

### P7 — O parser já nasce genérico (`PROJECT->`, `NOTE->`, `GOAL->`) ou só `TASK->`?
- Recomendada: genérico por dentro (o tipo é parâmetro), com **só** `TASK->` exposto agora — `NOTE_LINK_ENTITY_TYPES` (`src/types/notes.ts`) mostra que o app já pensa polimórfico, e reabrir o parser depois custa mais que parametrizá-lo agora.
- **Resposta:**

### P8 — O que acontece quando a tarefa referenciada é apagada?
- Recomendada: chip "referência removida", sem tocar no texto — é o tratamento que a 056 já deu a vínculo órfão de `note_link`.
- **Resposta:**

## Prompts
(vazio até haver iteração nova)
