---
prompt: |
  quero que exista formas de referenciar tarefas, no projeto, que serão rastreáveis. Então se eu digitar>

  TASK-> painel de ...

  isso deve já criar e vincular uma task, ou posso na hora vincular uma já existente

  ---
  Fatia desta feature (decidida no desenho de 2026-09-21). É o coração do pedido: o gatilho.

  Em quais campos o `TASK->` vale? Resposta do usuário: "os dois que já têm editor" — descrição
  de tarefa/subtarefa (`TaskDescriptionField.tsx`, usado por `TaskFormFields.tsx`) e corpo da
  nota (`NoteEditor.tsx`). São os dois únicos lugares do app que montam o `MarkdownCodeEditor`,
  e os dois já registram o autocomplete e a navegação de `[[`. Um terceiro campo exigiria
  introduzir editor onde não existe.

  O que o gatilho abre? Resposta do usuário (em P2): "na hora de digitar, ele abre um pequeno
  componente para tanto linkar uma já existente, pelo título ou criar uma rapidamente".

  A tarefa nasce quando? Resposta do usuário: "já na escolha no pop-up". Custo aceito: desfazer
  o texto não apaga a tarefa criada.

  Qual projeto ela herda? Resposta do usuário: "o mesmo que o project-id está, se não null".

  Decisões que valem para esta fatia: reusar o `@codemirror/autocomplete` como gatilho, nunca
  popup próprio (mesma razão registrada no `slashMenu.ts`); a gravação passa por `createTask`, a
  mesma função dos formulários e da Orb, nenhum insert direto em `task`; e o gatilho é estreito —
  `TASK->` só dispara quando o que vem antes é espaço ou início de linha, mesma regra do `/`.
---

# 104 — `TASK->` no editor: vincular tarefa existente ou criar na hora

## Contexto
Depende de: 102, 103.

É o pedido literal do prompt-mãe: digitar `TASK-> painel de ...` num texto do app e sair dali com
uma tarefa criada e vinculada, ou com uma tarefa já existente vinculada.

O maquinário irmão existe e está provado para nota: `wikiLinkCompletionSource`
(`src/components/codemirror/wikiLinkCompletion.ts:29`) é a fonte de autocomplete do `[[`, pendurada
na linguagem markdown por `markdownSupport.language.data.of({ autocomplete })`; `wikiLinkNavigation`
(`src/components/codemirror/wikiLinkNavigation.ts:25`) decora o trecho e intercepta o clique; e
`handleCreateLinkedNote` (`src/pages/admin/tasks/TaskDescriptionField.tsx:54`) é o padrão de
"criou pelo editor, devolve o registro, o texto recebe o destino resolvido".

Os dois campos que recebem tudo isso são os dois únicos que montam o editor:
`TaskDescriptionField.tsx:116` (que `TaskFormFields.tsx:263` usa para tarefa **e** subtarefa) e
`NoteEditor.tsx:304`.

Dois detalhes do código já assentado que esta feature tem de respeitar: o filtro do autocomplete
embutido casa **com acento**, então título em PT-BR precisa do `foldForSearch` e de `filter: false`
no resultado (razão escrita em `slashMenu.ts:37-40`); e o clique tem de ser `pointerdown`, não
`click`, porque o formulário da tarefa vive num Dialog do Radix cujo trap de foco engole o `click`
(razão escrita em `wikiLinkNavigation.ts:45-47`).

## Decisões
- **O `TASK->` vale em dois campos: descrição de tarefa/subtarefa e corpo da nota.** São os dois que
  já montam o `MarkdownCodeEditor`; qualquer outro campo significaria introduzir editor onde não
  existe, e isso é escopo próprio. (Resposta do usuário.)
- **O "pequeno componente" que o usuário pediu é o popup do `@codemirror/autocomplete`** — a mesma
  fonte do `[[` e do `/`, não um portal próprio. Ele já entrega o que a resposta pede: linkar uma
  existente pelo título (as opções de baixo) ou criar rapidamente (a primeira opção). Popup próprio
  exigiria posicionar sobre o cursor à mão e refazer scroll, teclado e redimensionamento — razão já
  registrada em `slashMenu.ts:20-24`.
- **A primeira opção é sempre "Criar tarefa: `<texto digitado>`"**; abaixo dela, tarefas existentes,
  com as **abertas primeiro**. Posição fixa no topo para que criar seja um `Enter` previsível, sem
  depender de quantas tarefas casaram.
- **A tarefa nasce no momento da escolha**, não ao salvar o documento — é o que produz o id que a
  marca precisa. Custo aceito e explícito: desfazer o texto (Ctrl+Z) **não** apaga a tarefa criada.
  (Resposta do usuário: "já na escolha no pop-up".)
- **O projeto é herdado do contexto**: o `project_id` da nota que está aberta, ou o da tarefa que
  está sendo editada; não havendo, `null`. Perguntar o projeto num popup de digitação mataria a
  fluidez. (Resposta do usuário: "o mesmo que o project-id está, se não null".)
- **Gravação por `createTask`** (`src/api/tasks/tasks.ts:201`), a mesma porta dos formulários e da
  Orb (`src/api/orbActions.ts:48`). Nenhum insert direto em `task`.
- **Gatilho estreito**: `TASK->` só dispara quando o que vem antes é espaço ou início de linha.
  Mesma regra do `/` (`slashMenu.ts:32`), e pelo mesmo motivo — gatilho que abre no meio de uma
  palavra atrapalha mais do que ajuda.
- **Criar é assíncrono, mas o `apply` do autocomplete é síncrono — decidido nesta feature, porque o
  desenho não resolveu.** Escolher "Criar tarefa: X" **insere na hora o rótulo como texto simples**
  e guarda aquele intervalo num `StateField` que mapeia posições pelas mudanças seguintes; quando o
  id chega, o intervalo (já remapeado) vira `[X](orbyva-task:<id>)`. Duas alternativas foram
  descartadas: travar o editor até o `createTask` voltar (trava a digitação num fluxo cujo ponto é
  fluidez) e guardar o offset cru (a pessoa continua digitando, o texto anda, e a marca cairia no
  lugar errado). Falhando a criação, o rótulo **fica como texto simples** e um toast explica — nada
  de sumir com o que a pessoa escreveu.
- **Vincular tarefa existente é síncrono** e não precisa de nada disso: o `apply` é a string
  `[Título](orbyva-task:<id>)` direta.
- **No editor a referência é decoração, não chip.** Trecho colorido e clicável, como `.cm-wiki-link`
  faz hoje. O chip com status e prazo é da 105, no render fora do editor — mesma divisão que o
  `[[…]]` já tem (texto colorido no editor, link rico na prévia).
- **Fora desta rodada, de propósito** (registrado aqui para não voltar como dúvida): renomear a
  tarefa **não** reescreve o texto de quem a referenciou; não há `TASK->` no comentário de link
  externo (`task_external_link.comment`) nem dentro do chat da Orb; e menção não gera notificação
  nem e-mail.

## Tarefas
- [x] `src/components/codemirror/taskRefCompletion.ts` — o regex do gatilho:
      `TASK->` mais o que já foi digitado, só quando precedido de espaço ou início de linha e sem
      sair da linha. Espelhar a forma de `SLASH_QUERY_RE` (`slashMenu.ts:32`) e de
      `WIKI_LINK_PREFIX_RE` (`wikiLinkCompletion.ts:15`). Exportar o regex para poder testá-lo
      isolado. Verificação: `npm run build`
- [x] Testes só do gatilho, antes de haver popup: casa em `TASK->`, em `foo TASK->bar` e no começo
      da linha; **não** casa em `fooTASK->` (colado numa palavra) nem depois de quebra de linha no
      meio da consulta. É o teste que impede o menu de abrir onde não deve.
      Verificação: `npm test src/components/codemirror`
- [x] `taskRefCompletionSource(tasks: () => readonly Task[], onCreate)` em
      `taskRefCompletion.ts`, no molde de `wikiLinkCompletionSource` (`wikiLinkCompletion.ts:29`):
      `tasks` é **função**, não lista, porque o editor é montado uma vez e a lista muda embaixo
      dele. Resultado com `filter: false` e comparação por `foldForSearch` (`slashMenu.ts:44`) —
      sem isso "revisao" não acha "Revisão". Teto de 20 opções, como `WIKI_LINK_COMPLETION_LIMIT`.
      Verificação: `npm run build`
- [x] Ordenar e montar as opções: primeira sempre "Criar tarefa: `<texto digitado>`" (e, com a
      consulta vazia, ela é a única); depois as tarefas que casam, **abertas antes das concluídas**,
      cada uma com o título como `label` e `apply` igual a `[Título](orbyva-task:<id>)`. Rótulo
      truncado no popup se for muito longo. Verificação: `npm run build && npm run lint`
- [x] Testar a fonte de autocomplete: consulta vazia devolve só a opção de criar; consulta que casa
      duas tarefas devolve as duas com a aberta primeiro; consulta com acento e sem acento acham a
      mesma tarefa (`Revisão` × `revisao`); escolher uma existente aplica exatamente
      `[Título](orbyva-task:<id>)`; o teto de 20 é respeitado.
      Verificação: `npm test src/components/codemirror`
- [x] `src/components/codemirror/taskRefPending.ts` — o `StateField` que guarda os intervalos de
      rótulo aguardando id, com `map` aplicando as mudanças do documento (é isso que faz a marca
      cair no lugar certo mesmo se a pessoa continuar digitando). Efeitos para registrar e para
      resolver/cancelar um intervalo. Verificação: `npm run build`
- [x] Testar o `StateField` isolado, que é onde mora o risco: registrar um intervalo, aplicar uma
      inserção **antes** dele e conferir que o intervalo andou junto; aplicar uma inserção depois e
      conferir que não andou; apagar o texto do intervalo e conferir que ele é descartado em vez de
      apontar para o vazio. Verificação: `npm test src/components/codemirror`
- [x] Ligar a criação: escolher "Criar tarefa: X" insere `X` como texto simples, registra o
      intervalo, chama `createTask` (`src/api/tasks/tasks.ts:201`) com `title: X` e o `project_id`
      herdado do contexto, e ao voltar substitui o intervalo remapeado por
      `[X](orbyva-task:<id>)`. Verificação: `npm run build && npm run lint`
- [x] Caminho de erro da criação: `createTask` falhando deixa o rótulo como texto simples, descarta
      o intervalo pendente e mostra toast com `getErrorMessage`, no molde de
      `handleCreateLinkedNote` (`TaskDescriptionField.tsx:54-70`). O texto da pessoa **não** pode
      sumir. Verificação: `npm run build`
- [x] `src/components/codemirror/taskRefNavigation.ts` — decoração `.cm-task-ref` + handler de
      `pointerdown`, irmã de `wikiLinkNavigation.ts:25`. `pointerdown` e não `click` (o Dialog do
      Radix engole o `click`), `event.button !== 0 || event.altKey` sai fora (Alt+clique deixa
      editar o trecho), e o alvo vem de `taskRefAt` (103). Verificação: `npm run build`
- [x] Testar a navegação: clique simples sobre a marca chama o handler com o id certo; Alt+clique
      **não** navega; clique fora de qualquer marca não faz nada; marca dentro de bloco de código
      não é decorada nem clicável (herda do parser da 103).
      Verificação: `npm test src/components/codemirror`
- [x] Ligar em `src/pages/admin/tasks/TaskDescriptionField.tsx`: acrescentar
      `taskRefAutocomplete` e `taskRefNavigation` ao `editorExtensions` (hoje por volta de `:81`,
      junto de `wikiLinkAutocomplete`/`slashMenuAutocomplete`/`wikiLinkNavigation`), buscar as
      tarefas do usuário no mesmo molde do `useEffect` que já busca notas (`:40`), navegar para
      `/tasks?task=<id>` no clique (destino da 102) e herdar o `project_id` da tarefa em edição.
      Atualizar o `placeholder` do editor (`:119`), que hoje diz só "digite / para inserir, [[ para
      vincular uma nota…". Verificação: `npm run build && npm run lint`
- [x] Ligar em `src/pages/admin/notes/NoteEditor.tsx` (extensões por volta de `:124`, editor em
      `:304`): mesmas duas extensões, herdando o `project_id` da nota aberta, e mesmo ajuste de
      placeholder. Verificação: `npm run build && npm run lint`
- [x] Teste de ponta a ponta no campo de descrição, em
      `src/pages/admin/tasks/__tests__/`: digitar `TASK->` abre o popup; escolher uma tarefa
      existente grava a marca no valor do campo; escolher "Criar tarefa: X" chama `createTask` com
      o `project_id` da tarefa em edição e, resolvido, o valor do campo contém
      `[X](orbyva-task:<id>)`; `createTask` falhando deixa `X` como texto simples e mostra o toast.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste equivalente no editor de nota, cobrindo o que muda ali: o `project_id` herdado é o da
      **nota**, e é `null` quando a nota não tem projeto.
      Verificação: `npm test src/pages/admin/notes`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada nesta linha. `npm run build`: `built in 31.46s`, 0 erros de `tsc`.
      `npm run lint`: `88 problems (0 errors, 88 warnings)` — mesma contagem da base, só warnings
      pré-existentes de `react-refresh`. `npm test`: **276 arquivos / 3065 testes, 0 falhas**
      (base era 270 / 2989 — a feature somou **6 arquivos e 76 testes**: 32 de
      `taskRefCompletion.test.ts`, 13 de `taskRefPending.test.ts`, 15 de
      `taskRefNavigation.test.ts`, 5 de `useTaskRefExtensions.test.tsx`, 6 de
      `TaskDescriptionField.task-ref.test.tsx` e 5 de `NoteEditor.task-ref.test.tsx`).
      `npm run check:bundle`: `Bundle budget OK.`

## Prompts

## Notas

- 2026-09-22 — **A tripa comum dos dois campos virou um hook, `src/hooks/useTaskRefExtensions.ts`**,
  em vez de ser escrita duas vezes. As tarefas 12 e 13 pediam "acrescentar `taskRefAutocomplete` e
  `taskRefNavigation` ao `editorExtensions`" em cada arquivo, mas o que vai junto das extensões —
  carregar as tarefas, criar por `createTask` com o projeto do contexto, o toast do erro e o
  `navigate` para `/tasks?task=<id>` — é idêntico nos dois. Duas cópias divergiriam na primeira
  correção. Decisão minha, de engenharia; não houve pedido do usuário.
- 2026-09-22 — **`@/api/tasks/tasks` entra no hook por import dinâmico**, não estático. Aquele
  módulo arrasta a API de recorrência, a de medicação e o domínio de tarefas inteiro; com import
  estático o grafo de `NoteDetail` (rota `lazy()`) saltou de ~848 ms para ~1,5 s de carregamento,
  medido com um teste-sonda, e derrubou `notes-navigation.test.tsx`. A porta continua sendo
  `createTask`, como a decisão exige — só é carregada quando o `TASK->` é de fato usado.
- 2026-09-22 — **Um teste alheio ganhou timeout explícito**:
  `src/pages/admin/notes/__tests__/notes-navigation.test.tsx`, no caso "/notes/:id monta o editor
  da nota". Mesmo com o import dinâmico, os quatro módulos novos do `TASK->` somaram ~190 ms ao
  grafo daquela rota `lazy()` (848 ms → ~1,04 ms isolado), e o padrão de 1 s do `findBy` estourava
  sob a suíte inteira em paralelo. A assertiva é a mesma; só a janela de espera mudou, com o
  motivo escrito no próprio teste. Não é a flakiness conhecida de `AgendaGrid`/`form-panel`: esta
  tinha causa direta nesta feature.
- 2026-09-22 — **Dois extras pequenos, não pedidos nas tarefas, que o código precisava.**
  `safeTaskRefLabel` troca `[`/`]` por `(`/`)` e achata quebra de linha no rótulo: o parser da 103
  recusa colchete interno, então um título como `Revisar [urgente] contrato` produziria uma marca
  que nenhum consumidor reconhece — referência morta e silenciosa. E o regex do gatilho recusa um
  segundo `TASK->` dentro da consulta (`(?!TASK->)`), porque `matchBefore` usa `String.search`, que
  devolve a ocorrência mais à esquerda — sem isso, o segundo gatilho da linha filtraria pelo texto
  do primeiro.
- 2026-09-22 — **Com a consulta vazia a opção "Criar tarefa:" é oferecida mas não cria nada.** A
  tarefa 4 pede que ela seja a única opção nesse caso (é a âncora do menu), e o roteiro proíbe
  tarefa sem título; escolhê-la apenas fecha o popup e deixa o `TASK->` no texto.
- 2026-09-22 — **`taskRefNavigation` expõe `taskRefClickTarget` e `taskRefDecorations` como funções
  puras.** `posAtCoords` depende de layout de verdade, que jsdom não tem, então a regra do clique
  precisava sair do handler para poder ser afirmada — mesmo caminho que `livePreview.ts` já usa
  para as decorações. O handler de `pointerdown` continua testado de verdade, com um `EditorView`
  montado e a posição injetada: é o que prova que o gatilho é `pointerdown` e não `click`.
- 2026-09-22 — **`TaskDescriptionField` ganhou a prop `projectId`** (opcional, `null` por padrão) e
  `TaskFormFields` passa `form.project_id`. Sem isso não havia de onde herdar o projeto no campo de
  descrição; o editor de nota lê o `projectId` do próprio seletor, então a troca ainda não salva já
  vale.

## Como testar

Este roteiro só faz sentido com a **102** (destino `/tasks?task=<id>`) e a **103** (parser) já
implementadas — sem a 102 o clique não tem para onde ir, sem a 103 não há o que parsear. As duas
estão em `docs/features/done/`.

1. **Pré-requisitos**
   - Nenhuma migration, nenhuma variável de ambiente nova. `npm run dev`, login normal.
   - Ter pelo menos: um projeto com tarefas, uma tarefa **aberta** e uma **concluída** com títulos
     parecidos (para ver a ordenação — a concluída aparece depois e com o rótulo "concluída" ao
     lado), e uma tarefa com acento no título (ex.: "Revisão do contrato").
   - Ter uma nota **dentro de um projeto** e outra **sem projeto** (`/notes`).

2. **Verificação automatizada** — comandos exatos, um por linha (rodados nesta ordem ao fechar a
   feature):
   - `npm test src/components/codemirror` — passou = **7 arquivos / 142 testes**, 0 falhas. Cobre
     as três peças isoladas: o gatilho e a fonte de autocomplete (`taskRefCompletion.test.ts`, 32),
     o `StateField` dos rótulos pendentes (`taskRefPending.test.ts`, 13) e a decoração + clique
     (`taskRefNavigation.test.ts`, 15). Os outros 4 arquivos (82 testes) são do `[[`, do `/` e do
     live preview — estão aqui como rede de que nada foi quebrado ao lado.
   - `npm test src/hooks/__tests__/useTaskRefExtensions.test.tsx` — passou = **5 testes**, 0 falhas.
     É onde ficam provados o projeto herdado (`project_id` do contexto, `null` quando não há), a
     gravação por `createTask` e o toast do caminho de erro.
   - `npm test src/pages/admin/tasks/__tests__/TaskDescriptionField.task-ref.test.tsx` — passou =
     **6 testes**, 0 falhas. É o fluxo inteiro no campo de Descrição, com o CodeMirror, o popup e o
     teclado de verdade: o popup abre, `fooTASK->` **não** abre, escolher uma existente grava a
     marca, escolher "Criar tarefa: X" chama `createTask` com o projeto da tarefa em edição e a
     marca se forma quando o id chega, e `createTask` falhando deixa o texto e mostra o toast.
   - `npm test src/pages/admin/notes/__tests__/NoteEditor.task-ref.test.tsx` — passou = **5 testes**,
     0 falhas. O mesmo fluxo na nota, com o que muda ali: o projeto herdado é o **da nota**, e é
     `null` quando a nota não tem projeto.
   - `npm run build && npm run lint && npm run check:bundle` — passou = `tsc` sem erro, lint com
     **0 erros** (88 warnings de `react-refresh` pré-existentes) e `Bundle budget OK.`.
   - `npm test` — passou = **276 arquivos / 3065 testes**, 0 falhas.

3. **Verificação manual, passo a passo**
   1. Abra `/tasks`, edite uma tarefa que esteja **dentro de um projeto** e abra o campo Descrição.
      O placeholder já anuncia o gatilho ("…, TASK-> para vincular uma tarefa…"). Digite `TASK->`.
      **Esperado**: o popup abre, e a primeira opção é "Criar tarefa: " (consulta vazia), sem mais
      nada.
   2. Continue digitando `revisao` (sem acento). **Esperado**: a tarefa "Revisão do contrato"
      aparece na lista, abaixo da opção de criar. Se não aparecer, o `foldForSearch` não está sendo
      usado.
   3. Desça com a seta e escolha a tarefa existente com Enter. **Esperado**: o texto `TASK->revisao`
      some inteiro e no lugar fica `[Revisão do contrato](orbyva-task:<uuid>)`, já colorido e
      sublinhado. **Não** pode sobrar `TASK->` no texto.
   4. Clique nessa marca. **Esperado**: vai para `/tasks?task=<uuid>` e o Dialog daquela tarefa
      abre. (É a 102 fazendo o trabalho.)
   5. Volte, edite a descrição de novo e digite `TASK-> painel de controle`. Escolha a **primeira**
      opção ("Criar tarefa: painel de controle") com Enter. **Esperado**: o texto
      `painel de controle` aparece na hora como texto simples e, um instante depois, vira
      `[painel de controle](orbyva-task:<uuid>)`.
   6. Salve a tarefa, vá a `/tasks` e procure "painel de controle". **Esperado**: a tarefa existe,
      está **pendente** e **no mesmo projeto** da tarefa que você estava editando.
   7. Repita o passo 5 numa **nota sem projeto** (`/notes`). **Esperado**: a tarefa é criada com
      projeto vazio.
   8. Repita numa nota **com projeto**. **Esperado**: a tarefa herda o projeto da nota. Trocando o
      projeto no seletor da nota **antes** de criar, vale o projeto novo (o editor lê o seletor, não
      o valor gravado).
   9. Teste o gatilho estreito: digite `fooTASK->` (colado numa palavra). **Esperado**: o popup
      **não** abre.
   10. Escolha "Criar tarefa: X" e, **sem esperar**, suba o cursor e escreva uma linha nova acima.
       **Esperado**: quando o id chega, a marca se forma em volta do rótulo certo, não deslocada. É
       o caso que o `StateField` existe para resolver.

4. **Casos de borda e caminhos negativos**
   - Digite `TASK->` dentro de um bloco de código cercado (três crases) e escolha uma tarefa.
     **Esperado**: o popup abre normalmente, mas a marca resultante **não** fica clicável nem
     colorida (o parser da 103 ignora código).
   - Escolha "Criar tarefa:" com a consulta vazia (só `TASK->` digitado). **Esperado**: o popup
     fecha, **nenhuma** tarefa é criada e o `TASK->` continua no texto. Tarefa sem título não pode
     nascer.
   - Fique offline (DevTools → Network → Offline) e escolha "Criar tarefa: X". **Esperado**: `X`
     fica como texto simples e aparece um toast de erro ("Erro" / a mensagem da falha). O texto
     digitado **não** some.
   - Escolha "Criar tarefa: X", veja a marca formar, e dê Ctrl+Z até o texto sumir. **Esperado**: o
     texto volta atrás, mas a tarefa **continua existindo** em `/tasks` — é o custo aceito e
     declarado da decisão "nasce na escolha".
   - Escolha "Criar tarefa: X" e apague o rótulo **antes** de o id chegar. **Esperado**: nada é
     reinserido no texto quando a resposta volta (a tarefa fica criada, sem marca no documento).
   - Referencie a mesma tarefa duas vezes no mesmo texto. **Esperado**: as duas marcas funcionam,
     as duas clicáveis.
   - Digite `TASK->a` e, na mesma linha, `TASK->b`. **Esperado**: o popup filtra por `b` — o
     gatilho que vale é o último da linha.
   - Vincule uma tarefa cujo título tenha colchete (ex.: `Revisar [urgente] contrato`).
     **Esperado**: a marca fica `[Revisar (urgente) contrato](orbyva-task:<uuid>)` e continua
     clicável — colchete dentro do rótulo mataria a referência.
   - Alt+clique sobre uma marca. **Esperado**: o cursor entra no trecho para editar, sem navegar.

5. **Sinais de que quebrou**
   - Popup abrindo no meio de palavras (`fooTASK->`): o gatilho não está checando o caractere
     anterior.
   - Título com acento não encontrável digitando sem acento: `filter: false` + `foldForSearch` não
     foram aplicados — o filtro embutido do CodeMirror voltou a agir.
   - Sobra um `TASK->` no texto depois de escolher: o `from` do resultado do autocomplete voltou a
     apontar para depois da marca, em vez do começo dela.
   - Clique na marca não faz nada **dentro do Dialog de tarefa** mas funciona na nota: o handler
     está em `click` em vez de `pointerdown`; o trap de foco do Radix está engolindo o evento.
   - A marca se forma deslocada algumas letras: o intervalo pendente não está sendo remapeado pelas
     mudanças do documento.
   - Tarefa criada sempre sem projeto, mesmo a partir de nota com projeto: o contexto não está
     sendo passado para o `createTask`.
   - Tarefa duplicada a cada escolha: o efeito de resolução está rodando mais de uma vez para o
     mesmo intervalo.
   - O popup fecha sozinho enquanto você digita: o array de extensões voltou a ser recriado a cada
     render (é por isso que o hook devolve um `useMemo` de dependência vazia).
   - A página `/notes/:id` ficou visivelmente mais lenta para abrir: o import de
     `@/api/tasks/tasks` voltou a ser estático no hook.
