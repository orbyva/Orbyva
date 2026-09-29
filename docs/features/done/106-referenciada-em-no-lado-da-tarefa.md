---
prompt: |
  quero que exista formas de referenciar tarefas, no projeto, que serão rastreáveis. Então se eu digitar>

  TASK-> painel de ...

  isso deve já criar e vincular uma task, ou posso na hora vincular uma já existente

  ---
  Fatia desta feature (decidida no desenho de 2026-09-21).

  "Rastreável" tem dois sentidos. O primeiro (o texto mostra o estado da tarefa) é a feature
  105. Este é o segundo: **a tarefa mostra onde é mencionada**. Sem ele o vínculo é de mão
  única — dá para ir do texto à tarefa, mas abrir a tarefa não conta onde ela foi citada, e aí
  "rastreável" fica pela metade.

  Decisão que vale para esta fatia: nenhuma tabela nova — a referência vive no texto e o
  backlink é **derivado** dele, lendo o markdown. Mantém a decisão da feature 056, que já faz
  isso para nota em `BacklinksPanel`.

  O `TASK->` vale em dois campos (descrição de tarefa/subtarefa e corpo da nota), então são
  exatamente esses dois lugares que podem conter menção.
---

# 106 — "Referenciada em": as menções no lado da tarefa

## Contexto
Depende de: 103.

Pode ser implementada em paralelo com a 104 e a 105 — ela só precisa do parser, não do editor nem
do chip. Na prática ela fica mais fácil de **avaliar** depois da 104, porque aí dá para criar
menções digitando em vez de escrever a marca à mão.

O padrão já está assentado para nota: `BacklinksPanel` (`src/pages/admin/notes/BacklinksPanel.tsx`)
mostra quem menciona a nota atual, e a mecânica é `ilike` como **prefiltro** no banco +
**parser confirmando** no cliente (`:41-44`: "O `ilike` é prefiltro; o parser é quem decide o que é
menção de verdade"). A consulta é `fetchNotesMentioning` (`src/api/notes/notes.ts:104`), que faz
`.ilike("content", '%[[' + escapeLikeValue(target) + ']]%')`.

Para tarefa há uma vantagem estrutural: a marca guarda **id**, não título. O prefiltro por
`%orbyva-task:<uuid>%` é praticamente exato, sem o falso positivo que buscar por título traz — e
sem a consequência que o `BacklinksPanel` assume por escrito (`:24`), de que renomear a nota derruba
os backlinks. Aqui renomear a tarefa não derruba nada.

As menções podem estar em dois lugares, que são exatamente os dois campos onde o `TASK->` vale:
`note.content` e `task.description`.

## Decisões
- **Nenhuma tabela nova.** O backlink é derivado do texto, lendo `note.content` e
  `task.description`. Mantém a decisão da 056 e é o que faz a menção sobreviver a export/import de
  markdown.
- **`ilike` é prefiltro, o parser decide.** Mesma divisão do `BacklinksPanel`: o banco reduz o
  conjunto, `mentionsTaskId` (103) confirma. É o parser que descarta marca dentro de bloco de
  código — sem ele, um exemplo de sintaxe numa nota entraria como menção real.
- **Duas fontes, duas listas, rotuladas.** "Notas" e "Tarefas" aparecem separadas, como o
  `BacklinksPanel` separa "menções" de "relacionadas". Misturar as duas numa lista só obrigaria o
  leitor a adivinhar de onde cada linha veio.
- **A própria tarefa não entra na lista.** Uma tarefa cuja descrição referencia ela mesma não é
  menção útil, é ruído — mesmo tratamento do `excludeNoteId` de `fetchNotesMentioning`
  (`notes.ts:106`).
- **O id é uuid e não tem curinga, mas o `escapeLikeValue` é usado assim mesmo.** `%`, `_` e `\`
  são curingas do LIKE; confiar no formato do id em vez de escapar é o tipo de atalho que fica
  errado no dia em que a marca aceitar outra coisa.
- **A seção é apresentacional e reusa o que existe.** `EntityNotesSection`
  (`src/pages/admin/notes/EntityNotesSection.tsx:16`) é o molde; o análogo entra no formulário de
  tarefa, junto das outras seções do Dialog de edição.
- **Só aparece quando há menção, e só em tarefa que já existe.** Numa tarefa sendo criada não há
  id, logo não há o que buscar; a seção não deve piscar vazia no formulário de "Nova tarefa".

## Tarefas
- [x] `fetchNotesMentioningTask(taskId)` em `src/api/notes/notes.ts`, ao lado de
      `fetchNotesMentioning` (`:104`): `.ilike("content", '%' + escapeLikeValue(TASK_REF_SCHEME +
      taskId) + '%')`, filtrando por `user_id` e ordenando por `updated_at` desc, como a irmã faz.
      Verificação: `npm run build`
- [x] `fetchTasksMentioningTask(taskId)` em `src/api/tasks/tasks.ts`: mesma consulta sobre
      `task.description`, excluindo a própria tarefa (`.neq("id", taskId)`) e filtrando por
      `user_id`. Verificação: `npm run build && npm run lint`
- [x] Testar as duas consultas com o Supabase falso, no molde dos testes de API que já existem:
      o filtro `ilike` é montado com o esquema **e** o id (não só o id, que casaria um id solto no
      texto); `user_id` está nas duas; a própria tarefa é excluída; erro do banco vira exceção com
      mensagem. Verificação: `npm test src/api`
- [x] `src/pages/admin/tasks/TaskMentionsSection.tsx` — a seção "Referenciada em": carrega as duas
      fontes em paralelo (`Promise.all`, como `BacklinksPanel.tsx:35`), **confirma cada candidato
      com `mentionsTaskId`** e mostra duas listas rotuladas ("Notas", "Tarefas"). Estado de
      carregamento e tratamento de erro com toast, no molde do `BacklinksPanel`.
      Verificação: `npm run build && npm run lint`
- [x] Linhas clicáveis: nota vai para `/notes/<id>`, tarefa vai para `/tasks?task=<id>` (destino da
      102). Nada de abrir o Dialog por cima do Dialog — navegar fecha o formulário atual.
      Verificação: `npm run build`
- [x] Estado vazio: sem menção nenhuma, a seção **não** é renderizada (nem título, nem "nenhuma
      menção"), para não encher o formulário de tarefa com espaço morto.
      Verificação: `npm run build`
- [x] Encaixar a seção no formulário de tarefa (`src/pages/admin/tasks/TaskFormFields.tsx`, junto
      das demais seções, depois da descrição), renderizando **só quando `editing`** — em "Nova
      tarefa" não há id. Verificação: `npm run build && npm run lint`
- [x] Testar a seção em `src/pages/admin/tasks/__tests__/TaskMentionsSection.test.tsx`: nota que
      cita a tarefa aparece na lista de Notas; tarefa que cita aparece na lista de Tarefas;
      candidato que o `ilike` trouxe mas cuja marca está **dentro de bloco de código** é
      descartado pelo parser e **não** aparece (é o teste que prova que o prefiltro não decide
      sozinho); sem menção a seção não renderiza; erro na carga mostra toast e não quebra o
      formulário. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de que renomear não derruba: uma nota cita a tarefa, o título da tarefa muda, a menção
      continua listada. É a diferença em relação ao `BacklinksPanel` das notas, e vale travar em
      assertiva. Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada nesta linha. `npm run build`: `built in 16.32s`, 0 erros de `tsc`.
      `npm run lint`: `88 problems (0 errors, 88 warnings)` — mesma contagem da base, só os
      warnings pré-existentes de `react-refresh`. `npm test`: **281 arquivos / 3124 testes, 0
      falhas** (base era 279 / 3102 — a feature somou **2 arquivos e 22 testes**: 10 de
      `src/api/__tests__/task-mentions.test.ts`, 9 de `TaskMentionsSection.test.tsx` e 3
      acrescentados a `TaskFormFields.test.tsx`, que foi de 50 para 53).
      `npm run check:bundle`: `Bundle budget OK.`

## Prompts

## Notas

- 2026-09-22 — **`escapeLikeValue` saiu de `src/api/notes/notes.ts` para `src/lib/likePattern.ts`.**
  As duas consultas desta feature montam prefiltro de texto, e as tarefas pediam `escapeLikeValue`
  nas duas; duas cópias de uma função de escape divergem na primeira correção, e escape é
  exatamente o tipo de coisa que não pode divergir. `fetchNotesMentioning` passou a importar do
  módulo novo, sem mudar comportamento — `notes-api.test.ts` continua 19/19, incluindo o caso
  `100% do_orçamento`. Decisão minha, de engenharia; não houve pedido do usuário.
- 2026-09-22 — **Enquanto carrega, a seção não renderiza nada** — em vez do "Procurando menções…"
  do `BacklinksPanel`, que a tarefa citava como molde. Motivo: lá o painel é uma área própria da
  página de nota; aqui é um bloco dentro do formulário de tarefa, que abre em toda edição. Um
  título "Referenciada em" que aparece e some em toda tarefa é o mesmo espaço morto que a decisão
  "só aparece quando há menção" existe para evitar, e seria indistinguível, para quem testa, do
  sintoma escrito em "Sinais de que quebrou" ("seção vazia e visível em toda tarefa"). O teste
  "não pisca a seção enquanto carrega" trava isso com a promessa suspensa na mão.
- 2026-09-22 — **A seção entra logo depois do campo Descrição**, entre o Bloco 2 e o Bloco 3 do
  formulário — leitura literal de "junto das demais seções, depois da descrição". É também onde ela
  faz sentido: a menção é sobre o mesmo texto que a Descrição edita, e o outro bloco somente-leitura
  do formulário ("Registros de tempo") está no fim, atrás de um gatilho colapsado, que esconderia
  uma informação que deveria estar à vista.
- 2026-09-22 — **`fetchTasksMentioningTask` é importada de `@/api/tasks` (o índice), não de
  `@/api/tasks/tasks`.** A implementação ficou onde a tarefa mandou (`tasks.ts`), mas o consumo
  passa pela porta de entrada única das telas, que é o que o próprio `tasks.ts` documenta no
  re-export de `taskRows`. Não há o custo de bundle da 104/105 aqui: quem monta a seção é o
  formulário de tarefa, que já vive no chunk que carrega `@/api/tasks` inteiro.
- 2026-09-22 — **13 arquivos de teste alheios ganharam as duas funções novas no `vi.mock`, e a
  medição é esta.** Antes: `npx vitest run src/pages/admin/tasks` passava 64/64 arquivos e 731
  testes, mas cuspia **41 `Unhandled Rejection` de `AuthRequiredError`** vindos de
  `fetchNotesMentioningTask`. A causa não é a seção: `Promise.all([a(), b()])` **avalia os dois
  argumentos antes** de anexar handler, e nos dublês exaustivos `fetchTasksMentioningTask` era
  `undefined` — o `b()` estourava `TypeError` de forma síncrona e deixava a promessa de `a()`
  pendurada sem ninguém escutando. Depois de completar os dublês: 64/64 arquivos, **735 testes, 0
  erros**. Nenhuma assertiva existente foi alterada — só a superfície do módulo dublado, que é o
  que muda quando um componente compartilhado ganha dependência. Os arquivos:
  `TaskList.orb-url-filters`, `TaskList.subtask-edit`, `TaskList.external-links`,
  `TaskList.form-panel`, `AgendaGrid`, `AgendaGrid.medication`, `ProjectDetail.subtask-edit`,
  `ProjectDetail.external-links`, `ProjectDetail.sort`, `ProjectDetail.tabs`,
  `ProjectDetail.due-regroup`, `TaskFormFields` e `TaskFormFields.notes`.
- 2026-09-22 — **O teste do bloco de código foi provado por experimento, não por leitura.**
  Removendo os dois `.filter((…) => mentionsTaskId(…))` do `TaskMentionsSection`, o arquivo foi de
  9/9 para `1 failed | 8 passed`, e só o caso "descarta o candidato cuja marca está dentro de bloco
  de código" quebrou. Estado restaurado e suíte verde de novo — é a prova de que o teste falharia
  se o parser deixasse de confirmar e o `ilike` virasse o filtro.
- 2026-09-22 — **A seção acrescenta 21 avisos de `not wrapped in act(...)` em
  `TaskFormFields.test.tsx`.** É a mesma classe dos 24 que `TaskExternalLinksField` e dos 7 que
  `TaskNoteButtons` já emitiam no mesmo arquivo: carga assíncrona resolvendo depois do `render` em
  teste que não espera por ela. Nenhum teste falha por isso, e silenciá-los exigiria reescrever
  assertivas alheias que não são desta feature.
- 2026-09-22 — **A própria tarefa é excluída no banco (`neq`), não no cliente.** Assim o candidato
  nem chega a ser parseado, e o caso fica travado em `task-mentions.test.ts` (`neq` = `['id',
  <id>]`) em vez de depender de um `filter` que alguém pode remover sem o teste perceber.

## Como testar

Este roteiro precisa da **103** implementada. Com a **104** pronta é muito mais confortável (dá
para criar as menções digitando `TASK->`); sem ela, escreva `[rótulo](orbyva-task:<id>)` à mão no
markdown, que é texto comum.

1. **Pré-requisitos**
   - Nenhuma migration. `npm run dev`, login normal.
   - Escolher uma tarefa-alvo e anotar o `id` dela
     (`select id, title from task limit 5`). Chame de **T**. O id **precisa** ser um uuid de
     verdade: o parser da 103 recusa qualquer outra forma, e uma marca com id inventado nunca vira
     menção.
   - Preparar: duas notas em `/notes` (uma que cita **T**, outra que não cita nada) e uma segunda
     tarefa cuja **descrição** cita **T**.

2. **Verificação automatizada** — comandos exatos, um por linha (rodados nesta ordem ao fechar a
   feature):
   - `npm test src/pages/admin/tasks/__tests__/TaskMentionsSection.test.tsx` — passou = **9
     testes**, 0 falhas. As duas listas rotuladas, os dois destinos de link, a nota citada duas
     vezes aparecendo uma só, o estado vazio que não renderiza nada, a seção que não pisca enquanto
     carrega, o toast do erro, o rename que não derruba — e, principalmente, **o candidato com a
     marca dentro de bloco de código sendo descartado** (a assertiva que prova que o parser, e não
     o `ilike`, é quem decide). Apagando os dois `.filter(… mentionsTaskId …)` do componente, este
     arquivo vai a `1 failed | 8 passed`: o teste tem dente.
   - `npm test src/api` — passou = **23 arquivos / 277 testes**, 0 falhas. Os 10 de
     `src/api/__tests__/task-mentions.test.ts` são desta feature: as consultas filtram por
     `user_id`, montam o `ilike` com o **esquema junto do id** (`%orbyva-task:<uuid>%`), escapam os
     curingas do LIKE, excluem a própria tarefa (`neq`), não vão ao banco com id vazio e
     transformam erro do PostgREST em `Error`.
   - `npm test src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx` — passou = **53 testes**, 0
     falhas (50 eram do painel; 3 são o encaixe desta feature): a seção aparece em tarefa que já
     existe, **não** aparece em "Nova tarefa" (e ali nem consulta nada), e some na tarefa que
     ninguém cita.
   - `npm test src/pages/admin/tasks` — passou = **64 arquivos / 735 testes**, 0 falhas, e **sem
     nenhum `Unhandled Rejection`** no rodapé. Esse zero é parte do resultado: a lista, a agenda e
     a página de projeto montam o mesmo formulário, e é aqui que se vê se a carga da seção deixou
     promessa solta.
   - `npm run build && npm run lint && npm run check:bundle` — passou = `tsc` sem erro, lint com
     **0 erros** (88 warnings de `react-refresh` pré-existentes) e `Bundle budget OK.`.
   - `npm test` — passou = **281 arquivos / 3124 testes**, 0 falhas.

3. **Verificação manual, passo a passo**
   1. Numa nota, escreva `Depende de [subir painel](orbyva-task:<id de T>)` e salve.
   2. Na descrição de **outra** tarefa, escreva a mesma marca e salve.
   3. Abra a tarefa **T** para edição em `/tasks`. **Esperado**: **logo abaixo do campo
      "Descrição"** aparece a seção "Referenciada em", com a nota sob "Notas" e a outra tarefa sob
      "Tarefas". Ela não pisca antes de carregar: ou já vem preenchida, ou não aparece.
   4. Clique na linha da nota. **Esperado**: vai para `/notes/<id>` e o formulário da tarefa fecha
      (a rota troca, então o Dialog sai junto).
   5. Volte, abra **T** de novo e clique na linha da tarefa. **Esperado**: a URL vira
      `/tasks?task=<id da outra tarefa>` e o Dialog **troca** para ela — sem Dialog sobre Dialog.
      Quem faz a troca é o efeito de `?task=` da 102.
   6. **Renomeie a tarefa T** e abra-a de novo. **Esperado**: a seção continua listando as mesmas
      duas menções. Esta é a diferença em relação aos backlinks de nota, que são por título e
      quebram no rename.
   7. Abra uma tarefa que ninguém cita. **Esperado**: **nenhuma** seção "Referenciada em" —
      nem título, nem texto de vazio.
   8. Clique em "Nova tarefa". **Esperado**: a seção não aparece (não há id ainda), e a aba Network
      não mostra consulta nenhuma de menção.

4. **Casos de borda e caminhos negativos**
   - Numa nota, ponha a marca de **T** dentro de um bloco de código cercado (três crases) e mais
     nada. Abra **T**. **Esperado**: essa nota **não** é listada. Se for, o `ilike` está decidindo
     sozinho e o parser não está confirmando. O mesmo vale para a marca entre crases simples
     (código inline) na descrição de outra tarefa.
   - Faça a descrição de **T** citar a própria **T**. **Esperado**: **T** não aparece na sua
     própria lista (o `neq` da consulta tira antes de chegar ao cliente).
   - Cite **T** duas vezes na mesma nota. **Esperado**: a nota aparece **uma** vez.
   - Apague a nota que citava **T** e reabra **T**. **Esperado**: a menção some da lista, sem erro.
   - Com dois logins, faça a conta B citar uma tarefa de A (colando o id). Abrindo a tarefa em A.
     **Esperado**: a nota de B **não** aparece — o filtro por `user_id` é o que garante isso, e
     antes dele o RLS.
   - Uma nota gigante (muitos parágrafos) citando **T** uma vez no fim. **Esperado**: aparece
     normalmente; o parser lê o conteúdo inteiro.
   - Derrube a rede (DevTools → Offline) e abra **T**. **Esperado**: toast vermelho "Erro ao
     carregar as menções" e o formulário inteiro continua utilizável — a seção some, nada mais.

5. **Sinais de que quebrou**
   - Notas aparecendo na lista sem conter a marca: o `ilike` está buscando só o id, sem o esquema
     `orbyva-task:` junto — aí qualquer texto que contenha aquele uuid casa.
   - A nota com a marca dentro de bloco de código aparecendo: o parser não está sendo chamado para
     confirmar; o prefiltro virou o filtro.
   - Seção "Referenciada em" vazia e visível em toda tarefa: o estado vazio não está escondendo a
     seção.
   - A seção aparecendo em "Nova tarefa": falta a condição de `editing`.
   - Menções sumindo depois de renomear a tarefa: a consulta está sendo montada por título em vez
     de por id — é o erro de copiar `fetchNotesMentioning` sem trocar a chave.
   - Lentidão ao abrir tarefas: as duas consultas não estão em `Promise.all`, ou estão rodando a
     cada render em vez de uma vez por tarefa.
   - `Unhandled Rejection` no rodapé de `npm test src/pages/admin/tasks`: alguma das duas funções
     sumiu do dublê de um teste que monta o formulário, e o `Promise.all` ficou com uma promessa
     sem dono (ver Notas).
