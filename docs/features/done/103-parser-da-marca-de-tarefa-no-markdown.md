---
prompt: |
  quero que exista formas de referenciar tarefas, no projeto, que serão rastreáveis. Então se eu digitar>

  TASK-> painel de ...

  isso deve já criar e vincular uma task, ou posso na hora vincular uma já existente

  ---
  Fatia desta feature (decidida no desenho de 2026-09-21):

  Qual marca fica gravada no texto? Resposta do usuário: "gostei, recomendado. o registro fica
  como orbyva-task:id" — ou seja `[Rótulo](orbyva-task:<id>)`, link markdown comum com esquema
  próprio, no espírito do `orbyva-wikilink-missing:` que as notas já usam. Resolve por **id**
  (sobrevive a renomear a tarefa), não colide com o parser de `[[…]]` e já é renderizável por
  qualquer consumidor de markdown. As alternativas foram recusadas: `TASK->Título` literal
  resolveria por título, e título de tarefa se repete (recorrência materializa dezenas com o
  mesmo nome); `[[task:<id>|Rótulo]]` exigiria abrir o regex dos wiki-links.

  O parser já nasce genérico (`PROJECT->`, `NOTE->`, `GOAL->` no futuro)? Resposta do usuário:
  "recomendado" — genérico por dentro, com o tipo como parâmetro, e **só** a marca de tarefa
  exposta agora. Reabrir o parser depois custa mais do que parametrizá-lo já.

  Decisões que valem para esta fatia: nenhuma tabela nova — a referência vive no texto e o
  backlink é derivado dele (mantém a decisão da feature 056); e o conteúdo persistido continua
  Markdown cru byte a byte, sem formato próprio.

  Esta feature entrega só o parser puro, sem UI: é o alicerce do editor (104), do chip (105) e
  das menções (106).
---

# 103 — Parser da marca de referência de tarefa no Markdown

## Contexto
Sem dependências — pode ser implementada em paralelo com a 102.

Para **nota**, o maquinário de referência no texto existe inteiro e está provado:
`src/domain/notes/wikiLinks.ts` parte o conteúdo em `[[Título]]`, devolve offsets, ignora bloco de
código cercado e código inline, e tem 30 testes em `src/domain/notes/__tests__/wikiLinks.test.ts`.
Para **tarefa** não existe nada: `noteLinkHref` manda `task` para `/tasks` genérico
(`src/domain/notes/noteLinkTargets.ts:44`).

Não confundir com o que já existe e **não** é isto: `note_link` (feature 056) é vínculo explícito
por painel, feito fora do texto; e a checklist do markdown (`- [ ] fazer x`,
`src/domain/notes/taskList.ts`) é marcação solta no corpo da nota, que **não** é linha de
`public.task` nenhuma. A referência desta feature é a terceira coisa: texto que aponta para uma
tarefa de verdade, por id.

A marca de tarefa **não pode** entrar em `[[…]]`: `WIKI_LINK_RE`
(`src/domain/notes/wikiLinks.ts:24`) casa qualquer `[[…]]`, então uma marca de tarefa nesse formato
seria lida como referência de nota pelo parser que já existe.

Há também uma dependência escondida: o cálculo de "que trechos são código" (`codeRanges`,
`inlineCodeRanges` e `FENCE_RE`, hoje **privados** em `wikiLinks.ts:27-75`) é lógica genérica de
Markdown, não de notas — e o parser de tarefa precisa exatamente dela.

## Decisões
- **A marca gravada é `[Rótulo](orbyva-task:<id>)`** — link markdown comum com esquema próprio.
  Resolve por id, então renomear a tarefa não quebra a referência, e qualquer renderizador de
  markdown já sabe o que fazer com ela. É a mesma família do `WIKI_LINK_MISSING_SCHEME`
  (`orbyva-wikilink-missing:`, `wikiLinks.ts:181`) que o projeto já usa.
- **Nada de tabela nova.** A referência vive no texto; o backlink é derivado lendo o texto. Mantém
  a decisão da 056, e é o que faz a marca sobreviver a export/import de markdown.
- **O conteúdo persistido continua Markdown cru, byte a byte.** Chip é decoração e render; nunca um
  formato próprio gravado no banco.
- **Genérico por dentro, só tarefa exposta.** O parser nasce como fábrica parametrizada pelo tipo
  de entidade (`orbyva-<tipo>:<id>`) e a 103 exporta **só** a instância de `task`. `PROJECT->`,
  `NOTE->` e `GOAL->` cabem depois sem reabrir o parser. (Resposta do usuário: a recomendada.)
- **`codeRanges` sai de `wikiLinks.ts` para um módulo compartilhado**, em vez de ser duplicado. O
  domínio de tarefa não pode depender do de notas (`noteLinkTargets.ts:1` já importa de
  `types/notes`, e a seta contrária fecharia um ciclo), e duplicar significaria dois parsers de
  cerca de código divergindo com o tempo. Os 30 testes de `wikiLinks.test.ts` são a rede: a
  extração passa se eles passarem **sem alteração**.
- **O id no texto é um uuid**, e o regex exige o formato. Link markdown comum
  (`[x](https://…)`) e esquema desconhecido não podem casar por engano.

## Tarefas
- [x] Extrair `FENCE_RE`, `inlineCodeRanges` e `codeRanges` de `src/domain/notes/wikiLinks.ts:27-75`
      para `src/lib/markdownCode.ts`, exportando `codeRanges(content): [number, number][]`. Mover
      junto os comentários que explicam a regra do CommonMark para código inline — eles são a razão
      de o algoritmo ser o que é. Verificação: `npm run build`
- [x] Fazer `wikiLinks.ts` importar `codeRanges` do módulo novo e apagar a cópia local. **Nenhum
      teste de `src/domain/notes/__tests__/wikiLinks.test.ts` pode ser tocado** — se algum precisar
      mudar, a extração alterou comportamento e está errada.
      Verificação: `npm test src/domain/notes`
- [x] `src/lib/__tests__/markdownCode.test.ts`: cobrir `codeRanges` diretamente, agora que é
      público — bloco cercado com crase e com til, cerca indentada até 3 espaços, bloco aberto e
      nunca fechado engolindo o resto, código inline com pares de crases de tamanhos diferentes
      (`` `a`b` ``), crase sem par não abrindo nada, e texto sem código nenhum devolvendo lista
      vazia. Verificação: `npm test src/lib`
- [x] `src/domain/refs/entityRefs.ts` — a fábrica genérica: `createEntityRefParser(entity: string)`
      devolvendo `{ scheme, href, parseHref, parse, at, plainSegments, ids, mentions }`. O esquema
      é `orbyva-<entity>:`; o regex casa `[rótulo](orbyva-<entity>:<uuid>)` com rótulo sem `[`,
      `]` nem quebra de linha (mesma recusa de colchete interno do `WIKI_LINK_RE`, e é ela que
      mantém o parser longe de link markdown aninhado). Verificação: `npm run build`
- [x] Ignorar código no `parse` da fábrica, usando `codeRanges`: marca dentro de bloco cercado ou
      de código inline é texto literal, não referência — quem mostra a sintaxe num exemplo não está
      linkando. Mesma regra, e mesma razão, do `parseWikiLinks` (`wikiLinks.ts:96`).
      Verificação: `npm run build`
- [x] `src/domain/tasks/taskRefs.ts` — a instância exposta: `TASK_REF_SCHEME`, `taskRefHref(id)`,
      `parseTaskRefHref(href)`, `parseTaskRefs(content)`, `taskRefAt(content, pos)`,
      `taskRefPlainSegments(plain)`, `taskRefIds(content)` e `mentionsTaskId(content, id)`, todas
      vindas de `createEntityRefParser("task")`. Tipo `TaskRefMatch { id, label, start, end }`,
      espelhando `WikiLinkMatch` (`wikiLinks.ts:13`). **Não** exportar a fábrica a partir daqui.
      Verificação: `npm run build && npm run lint`
- [x] Testes do caminho feliz em `src/domain/tasks/__tests__/taskRefs.test.ts`: uma marca sozinha
      devolve id, rótulo e offsets certos; duas na mesma linha saem na ordem de aparição;
      `taskRefPlainSegments` intercala prosa e referência preservando o texto entre elas;
      `taskRefIds` remove repetição mantendo a ordem; `mentionsTaskId` acha e não acha.
      Verificação: `npm test src/domain/tasks`
- [x] Testes dos caminhos negativos, que são o que impede falso positivo: link markdown comum
      (`[docs](https://exemplo.com)`) **não** casa; esquema desconhecido
      (`[x](orbyva-projeto:<uuid>)`) não casa no parser de tarefa; id que não é uuid
      (`[x](orbyva-task:123)`) não casa; marca dentro de bloco cercado e dentro de código inline é
      ignorada; rótulo vazio (`[](orbyva-task:<uuid>)`) casa e devolve `label: ""` — quem renderiza
      decide o fallback; colchete interno (`[a[b]](orbyva-task:<uuid>)`) não casa.
      Verificação: `npm test src/domain/tasks`
- [x] Teste de que o parser de nota e o de tarefa não se atrapalham: um conteúdo com
      `[[Nota]]` e `[Tarefa](orbyva-task:<uuid>)` na mesma linha — `parseWikiLinks` enxerga só o
      primeiro e `parseTaskRefs` só o segundo, com offsets corretos nos dois.
      Verificação: `npm test src/domain`
- [x] `npm run build && npm run lint && npm test` limpos, com a contagem de testes registrada nesta
      linha (anotar a contagem antes e depois, para provar que a extração de `codeRanges` não
      derrubou nada). **Antes**: 267 arquivos / 2946 testes, 0 falhas. **Depois** (já com as duas
      tarefas que a checagem de satisfação acrescentou): 270 arquivos / 2989 testes, 0 falhas
      (`exit=0`) — +3 arquivos e +43 testes, que são exatamente os 11 de `markdownCode.test.ts`,
      os 27 de `taskRefs.test.ts` e os 5 de `entityRefs.test.ts`. Nenhum teste existente sumiu
      nem mudou. `npm run build`: `built in 36.15s`. `npm run lint`: `88 problems (0 errors, 88
      warnings)` — mesma contagem da base, só warnings pré-existentes de `react-refresh`.
- [x] `src/domain/refs/__tests__/entityRefs.test.ts`: provar por teste a genericidade que a decisão
      exige, que hoje só tem script de conferência como prova — `createEntityRefParser("project")`
      dá esquema `orbyva-project:` e casa a marca desse tipo; duas instâncias não se enxergam (o
      parser de `task` não casa marca de `project` e vice-versa); nome de entidade inválido lança.
      Verificação: `npm test src/domain/refs`
- [x] Teste da superfície de `taskRefs.ts`: `createEntityRefParser` **não** aparece entre as
      exportações do módulo (a decisão "só tarefa exposta" vira asserção, não promessa no
      comentário). Verificação: `npm test src/domain/tasks/__tests__/taskRefs.test.ts`

## Prompts

## Notas

- **O uuid é checado por forma, não por versão RFC.** `entityRefs.ts` usa
  `[0-9a-fA-F]{8}-…-{12}` em vez de reaproveitar `looksLikeId` (`src/lib/ids.ts`), que exige
  versão 1–5 e variante `89ab`. Dois motivos: `looksLikeId` serve para esconder id de breadcrumb,
  não para validar referência; e um id `uuid` legítimo que não seja v4 (o nil
  `00000000-0000-0000-0000-000000000000` do próprio roteiro de teste, por exemplo) passaria a ser
  silenciosamente ignorado pelo parser. A forma já basta para recusar `123`, link markdown comum e
  esquema desconhecido, que é o que o caso negativo exige.
- **Dois extras pequenos, não pedidos nas tarefas, mas que o código precisava**: o tipo
  `TaskRefPlainSegment` (alias de `EntityRefPlainSegment`), porque `taskRefPlainSegments` precisa
  de um tipo de retorno nomeado; e `ENTITY_NAME_RE` na fábrica, que recusa nome de entidade fora de
  `[a-z][a-z0-9-]*` — sem isso o parâmetro `entity` entraria cru num `new RegExp`.
- **`codeRanges` saiu exportado sozinho.** `FENCE_RE` e `inlineCodeRanges` continuam privados em
  `src/lib/markdownCode.ts`; os outros três `FENCE_RE` do projeto (`outline.ts`, `wordCount.ts`,
  `taskList.ts`) **não** foram tocados — são regexes com escopo e semântica diferentes (varrem
  linha a linha para outro fim), e unificá-los não estava na feature.
- **Flakiness conhecida bateu aqui, e não é regressão desta feature.** Em duas execuções de
  `npm test` sob carga paralela, `src/pages/admin/tasks/__tests__/AgendaGrid.test.tsx` e
  `TaskList.form-panel.test.tsx` estouraram `testTimeout` ("If this is a long-running test, pass a
  timeout value…"). Rodados isolados, passaram limpos (21/21 e 4/4), e a execução final da suíte
  inteira fechou 269/269 arquivos e 2982/2982 testes com `exit=0`. Nenhum arquivo de teste alheio
  foi alterado por causa disso.
- **Duas tarefas a mais entraram na checagem de satisfação, por decisão minha (não houve pedido do
  usuário).** A rastreabilidade pedia artefato para dois itens do `prompt:` que só tinham script de
  conferência descartável como prova: "genérico por dentro, com o tipo como parâmetro" e "só a
  marca de tarefa exposta agora". Viraram teste de verdade em
  `src/domain/refs/__tests__/entityRefs.test.ts` e na superfície de exportação de
  `taskRefs.test.ts`.
- **Um teste meu falhou na primeira execução** (`end` esperado 51, real 52 no caso de rótulo
  vazio): erro de aritmética no teste, não no parser — a marca `[](orbyva-task:<uuid>)` tem 52
  caracteres. Corrigido no teste, com um `slice` a mais para o número não voltar a ser chute.

## Como testar

1. **Pré-requisitos**
   - Nenhuma migration, nenhum servidor, nenhuma variável de ambiente. Esta feature é domínio puro:
     não há tela nova para abrir e **nada consome o parser ainda** — quem consome é a 104 (editor),
     a 105 (chip) e a 106 (menções).
   - `npm ci` feito.

2. **Verificação automatizada** — é aqui que esta feature se prova; os passos manuais abaixo são
   só conferência de que nada quebrou por tabela. Comandos exatos, um por linha:
   - `npm test src/domain/tasks/__tests__/taskRefs.test.ts` — passou = **27 testes**, 0 falhas. É o
     caminho feliz (id, rótulo, offsets, ordem, `taskRefIds`, `mentionsTaskId`) e, principalmente,
     a **recusa** de link markdown comum, esquema desconhecido, id que não é uuid, colchete interno
     e marca dentro de código. Inclui os 3 casos de convivência com `[[wiki-link]]` e os 2 que
     travam a superfície do módulo (a fábrica genérica não pode vazar daqui).
   - `npm test src/domain/refs` — passou = **5 testes**, 0 falhas. É a prova de que o parser é
     mesmo parametrizado pelo tipo: `createEntityRefParser("project")` funciona sozinho, as duas
     instâncias não enxergam a marca uma da outra, e nome de entidade inválido lança.
   - `npm test src/lib/__tests__/markdownCode.test.ts` — passou = **11 testes**, 0 falhas. O cálculo
     de trechos de código continua correto agora que é compartilhado (cerca de crase e de til, cerca
     indentada até 3 espaços, cerca que não fecha com o caractere errado nem com tamanho menor,
     bloco aberto engolindo o resto, código inline com pares de tamanhos diferentes, crase sem par,
     texto sem código).
   - `npm test src/domain/notes/__tests__/wikiLinks.test.ts` — passou = **30 testes**, 0 falhas,
     **sem nenhuma alteração no arquivo de teste**. É a rede da extração de `codeRanges`. Para
     conferir que o arquivo está intacto: `git diff --stat src/domain/notes/__tests__/wikiLinks.test.ts`
     tem que sair vazio. Se você precisou editar esse arquivo, a extração está errada.
   - `npm run build` — passou = `built in …` sem `error TS`. Prova também que não há import circular
     entre `domain/tasks` e `domain/notes` (o `tsc -b` quebraria).
   - `npm run lint` — passou = `0 errors`. Os 88 warnings de `react-refresh` são pré-existentes e
     não vêm desta feature.
   - `npm test` — passou = **270 arquivos / 2989 testes**, 0 falhas (`exit=0`). Antes desta
     feature eram 267 / 2946; a diferença são exatamente os 43 testes novos.

3. **Verificação manual, passo a passo** — nada aqui tem UI própria: o objetivo é só provar que
   escrever a marca e mexer no `codeRanges` compartilhado não quebrou as notas.
   1. Abra uma nota qualquer em `/notes` e escreva à mão, no corpo:
      `Ver [painel de controle](orbyva-task:00000000-0000-0000-0000-000000000000)`.
      **Esperado nesta feature**: nada de especial acontece — o texto salva byte a byte como foi
      digitado e a prévia mostra um link markdown comum (que não navega para lugar nenhum, porque
      `orbyva-task:` não é esquema de navegação). O chip é a 105. (O parser **aceita** esse uuid:
      a checagem é de forma 8-4-4-4-12, não de versão RFC — ver Notas.)
   2. Ainda na nota, escreva `[[Alguma Nota]]` na linha seguinte. **Esperado**: o wiki-link continua
      funcionando exatamente como antes — vira link azul quando a nota existe e chip "criar nota"
      quando não existe. A extração de `codeRanges` não pode ter afetado isso.
   3. Escreva a marca dentro de um bloco de código cercado (três crases) e também entre crases
      simples. **Esperado**: continua texto literal nos dois casos, sem tratamento nenhum.
   4. Recarregue a página. **Esperado**: o conteúdo volta idêntico ao que foi digitado — nenhuma
      reescrita do Markdown, porque esta feature não grava formato próprio.

4. **Casos de borda e caminhos negativos** — todos cobertos em
   `src/domain/tasks/__tests__/taskRefs.test.ts`; dá para conferir lendo o arquivo em vez de rodar
   à mão:
   - `[docs](https://exemplo.com)`, `[relativo](/tasks/123)` e `[vazio]()` → zero referências. Se
     devolver alguma, o regex está aceitando qualquer link e a 105 vai transformar link normal em
     chip de tarefa.
   - `[x](orbyva-projeto:<uuid>)`, `[x](orbyva-wikilink-missing:<uuid>)` e
     `[x](nao-orbyva-task:<uuid>)` → zero referências (esquema de outra entidade).
   - `[x](orbyva-task:123)`, `[x](orbyva-task:)`, uuid sem hífen, uuid com um caractere a menos e
     uuid com sufixo colado → zero referências.
   - `[](orbyva-task:<uuid>)` → **uma** referência com `label: ""`, sem lançar. Quem renderiza
     decide o fallback.
   - `[a[b]](orbyva-task:<uuid>)` e rótulo quebrado em duas linhas → zero referências.
   - Marca dentro de bloco cercado ou de código inline → zero referências, e `mentionsTaskId`
     devolve `false` (menção em exemplo de sintaxe não é menção).
   - Conteúdo vazio, só com espaços, ou gigante sem nenhuma marca → zero referências, sem estourar.
   - `mentionsTaskId(conteúdo, "")` → `false`.

5. **Sinais de que quebrou**
   - Algum teste de `wikiLinks.test.ts` falhando: a extração de `codeRanges` mudou comportamento —
     é regressão nas notas, não detalhe de refactor.
   - `npm run build` acusando ciclo de import: `domain/tasks` está importando de `domain/notes` (ou
     o contrário). O módulo compartilhado `src/lib/markdownCode.ts` existe exatamente para evitar
     isso.
   - O parser casando link markdown comum: o regex não está ancorado no esquema `orbyva-task:`.
     O sintoma aparece só na 105, como link externo virando chip de tarefa — por isso o caso
     negativo é teste de primeira classe aqui.
   - Offsets errados aparecem como `start`/`end` que não recortam a marca: todo teste de offset
     confere com um `content.slice(start, end)`; se o slice não bater, quem consumir (104/105) vai
     substituir o pedaço errado do texto.
   - **Falso alarme conhecido**: se `npm test` acusar falha em
     `src/pages/admin/tasks/__tests__/AgendaGrid.test.tsx` ou `TaskList.form-panel.test.tsx` com a
     mensagem "If this is a long-running test, pass a timeout value…", é `testTimeout` sob carga
     paralela, não esta feature — rode o arquivo isolado antes de tratar como regressão.
