---
prompt: |
  colocar um acesso rápido à biblioteca de ícones, assim como componente para fazer o upload, pra eu conseguir , copiar e colar assets para o excalidraw

  ---
  Fatia desta feature (decidida no desenho de 2026-09-24). São três rodadas: **esta** extrai a
  biblioteca do popover de ícone de tarefa para um componente reusável; a 132 põe esse componente
  como painel de acesso rápido na tela do canvas; a 133 faz o asset ir para o clipboard no formato
  que o Excalidraw entende.

  A biblioteca da feature 086 (`public.icon_asset` + arquivos em
  `task-icons/{userId}/library/{uuid}.{ext}`) já existe inteira no banco e na API — o que falta é
  uma porta. Hoje ela só abre dentro do popover de ícone de uma tarefa (`TaskIconPicker`) e em
  `/tasks/link-icons`, sempre acoplada ao contrato `TaskIconValue`.

  Esta rodada é **só a extração**: grid, renomear, excluir, estados de vazio/erro, enviar imagem e
  colar SVG viram componentes próprios, e o picker de tarefa passa a compô-los. Nenhuma tela nova,
  nenhum I/O novo — quem usa o ícone de tarefa não pode notar diferença nenhuma.

  Decisões do desenho que valem aqui:
  - Reusar `icon_asset` e o bucket `task-icons`. Biblioteca paralela duplicaria upload,
    sanitização, RLS, wipe de conta e a linha do `wipe_own_data` para guardar a mesma coisa.
  - A sanitização de SVG **não** muda de lugar: continua dentro de `uploadIconAsset`
    (`src/api/tasks/iconAssets.ts:57-62`), não na tela. Se a limpeza dependesse de o chamador
    lembrar de chamá-la, uma tela nova reabriria o buraco por esquecimento.
  - O acesso avulso **não** herda o contrato `TaskIconValue`: fora do picker o asset não é valor de
    campo nenhum, é conteúdo a copiar.
  - Excluir continua removendo só a linha (`iconAssets.ts:159-166`) — a biblioteca não ganha
    "apagar arquivo".
  - "Asset" é o nome do conteúdo; "ícone" é herança da 086. Tabela, bucket e API continuam com o
    nome antigo.
  - Resposta do usuário sobre o teto de 1 MB do bucket: "recomendado" — mantém 1 MB nesta rodada e
    **mostra o motivo na recusa do upload**.
  - Resposta do usuário sobre o nome na UI: "orbyva assets".
---

# 131 — Biblioteca de assets reusável (extrair do popover de ícone)

## Contexto
Sem dependências — é a primeira da série 131 → 132 → 133.

Tudo o que a biblioteca faz hoje está dentro de um componente de 502 linhas que existe para
preencher um campo de tarefa: `src/pages/admin/tasks/TaskIconPicker.tsx`. O grid (`:414-435`), o
modo gerenciar com renomear e excluir (`:324-413`), os estados `ICON_LIBRARY_EMPTY` /
`ICON_LIBRARY_ERROR` / `ICON_DELETE_WARNING` (`:26-35`), o carregamento preguiçoso na abertura do
popover (`:98-119`), o `<input type=file>` (`:223-240`, `:492-498`) e o atalho de colar SVG
(`:211-221`) são todos reusáveis — mas estão presos ao `TaskIconValue` (`:21-24`) e ao gatilho do
badge da tarefa.

O picker é montado em sete telas (`TaskList`, `TaskViews`, `TaskFormFields`, `TaskQuickFields`,
`ProjectDetail`, `GanttChart`, `LinkIconRules`), e a suíte dele tem 764 linhas. A extração só vale
se o contrato externo (`value`, `onChange`, `sharedWithSeries`, `presets`, `triggerLabel`) sair
idêntico e a suíte continuar verde sem reescrita de asserção.

## Decisões
- **Os componentes novos moram em `src/components/assets/`**, não em `src/pages/admin/tasks/`: a
  partir da 132 quem monta a biblioteca é a tela de canvas (`notes`), e componente compartilhado
  entre dois módulos é `src/components/` pela convenção de camadas do `docs/stack.md`.
- **O hook importa `@/api/tasks/iconAssets` direto, nunca o barril `@/api/tasks`.** O barril
  reexporta a API de tarefas, de recorrência e de links externos; importá-lo de um componente que a
  tela de Notas vai montar arrastaria esse grafo inteiro para o chunk de `/notes`. É a mesma
  armadilha já registrada nas Notas da feature 105.
  - Consequência direta: `vi.mock("@/api/tasks")` em `TaskIconPicker.test.tsx:22` deixa de
    interceptar as quatro funções da biblioteca. O arquivo de teste precisa mockar também
    `@/api/tasks/iconAssets` — sem isso a suíte vai ao Supabase de verdade e quebra.
- **A recusa por tamanho/tipo passa a ser checada antes do upload**, em regra pura
  (`src/domain/tasks/assetUpload.ts`), com mensagem em português dizendo o limite e o tamanho do
  arquivo. Hoje um arquivo de 3 MB sobe até o bucket para voltar com a mensagem crua do Supabase em
  inglês. O teto continua 1 MB (resposta do usuário: "recomendado") — a mudança é só **dizer o
  motivo**, e o lugar é a UI porque a barreira de segurança continua no `uploadIconAsset`.
- **`SvgIconPasteField` muda de pasta, não de comportamento.** Ele já é isolado e já é a metade
  "colar" do pedido; vai para `src/components/assets/` junto com o resto, com os imports dos dois
  testes existentes atualizados. `prepareSvgIcon` e `SVG_ICON_REJECTION_MESSAGES` **não** se mexem:
  continuam em `src/domain/tasks/svgIcon.ts`.
- **Título é prop, não constante do componente.** No popover de tarefa ele continua "Meus ícones"
  (é ali que a pessoa escolhe o ícone da tarefa); na biblioteca avulsa da 132 ele é
  **"Orbyva Assets"** (resposta do usuário à pergunta do nome). Rótulo é de UI; tabela, bucket e
  API seguem com o nome de ícone.
- **`AssetLibrary` não decide o que um clique significa.** Ela recebe `onSelect`; no picker isso é
  "vira o ícone da tarefa", na 133 será "copia para o clipboard". Sem `onSelect` os itens não são
  clicáveis — é o que impede a 132 de nascer com botão que não faz nada.
- **O carregamento preguiçoso é preservado como prop `enabled`.** O picker aparece em toda linha da
  Lista, do Kanban e do Gantt: buscar a lista na montagem seria uma consulta por card. Continua
  valendo "busca uma vez por abertura bem-sucedida; erro libera nova tentativa".

## Tarefas
- [x] `src/domain/tasks/assetUpload.ts` — regra pura do upload: `ASSET_MAX_BYTES` (1 MB),
      `ASSET_ACCEPT_MIMES` (o mesmo conjunto do `accept` de `TaskIconPicker.tsx:495` e do
      `EXTENSION_BY_MIME` de `src/api/tasks/iconAssets.ts:44-48`) e
      `assetUploadRejection(file: { size: number; type: string }): string | null`, devolvendo a
      frase pronta ("Este arquivo tem 3,2 MB — o limite é 1 MB." / "Formato não aceito: envie PNG,
      JPEG, WebP ou SVG."). Sem I/O, sem React. Verificação: `npm run build`
- [x] Testar a regra em `src/domain/tasks/__tests__/assetUpload.test.ts`: arquivo de 1 MB exato
      passa, 1 MB + 1 byte é recusado com o tamanho na frase, mime fora da lista é recusado,
      `image/svg+xml` é aceito, arquivo válido devolve `null`.
      Verificação: `npm test src/domain/tasks/__tests__/assetUpload.test.ts`
- [x] `src/components/assets/useAssetLibrary.ts` — hook com o estado da lista e as quatro
      operações, importando **`@/api/tasks/iconAssets`** direto. Assinatura:
      `useAssetLibrary({ enabled }: { enabled: boolean })` →
      `{ assets, loading, error, busyId, uploadFile, uploadSvg, rename, remove, adopt }`.
      Preservar o `loadedRef` de `TaskIconPicker.tsx:91-119` (busca uma vez; erro libera a próxima)
      e o `cancelled` do efeito. Verificação: `npm run build`
- [x] Mover `src/pages/admin/tasks/SvgIconPasteField.tsx` → `src/components/assets/SvgIconPasteField.tsx`
      e atualizar os quatro importadores (`TaskIconPicker.tsx:18`,
      `__tests__/SvgIconPasteField.test.tsx`, `__tests__/svgIconSecurity.test.tsx`,
      `__tests__/TaskIconPicker.test.tsx:13`). Nenhuma linha do componente muda.
      Verificação: `npm test src/pages/admin/tasks/__tests__/SvgIconPasteField.test.tsx src/pages/admin/tasks/__tests__/svgIconSecurity.test.tsx`
- [x] `src/components/assets/AssetUploadControls.tsx` — "Enviar imagem" (botão + `<input type=file>`
      escondido com `accept` vindo de `ASSET_ACCEPT_MIMES`), "Colar SVG" (abre o
      `SvgIconPasteField`) e o estado `uploading`. Antes de chamar a API, roda
      `assetUploadRejection`: recusado vira toast com a frase e **não** chega ao bucket.
      Exportar também `pastedSvgFromEvent(e): string | null`, o extrato de
      `TaskIconPicker.tsx:211-221` (ignora foco em input/textarea/contentEditable, usa
      `looksLikeSvgMarkup`), para o host ligar no `onPaste` do container.
      Verificação: `npm run build && npm run lint`
- [x] `src/components/assets/AssetLibrary.tsx` — composição: cabeçalho com `title` + alternador
      "Gerenciar"/"Concluir", esqueleto de carregamento (`TaskIconPicker.tsx:310-319`), linha de
      erro (`ICON_LIBRARY_ERROR`), vazio (`ICON_LIBRARY_EMPTY`), grid de `<img>` (`:414-435`) e
      lista de gerenciar com renomear/excluir + confirmação com `ICON_DELETE_WARNING`
      (`:324-413`). Props: `title`, `enabled`, `selectedUrl?`, `onSelect?`, `onUploaded?`,
      `emptyHint?`. As três constantes de texto passam a morar aqui (saem de
      `TaskIconPicker.tsx:26-35`) e o teste do picker passa a importá-las deste arquivo. Ícone
      renderizado **sempre** por `<img>`, nunca inline — é a segunda barreira da 086.
      Verificação: `npm run build && npm run lint`
- [x] Recompor `TaskIconPicker.tsx` em cima de `AssetLibrary` + `AssetUploadControls`: o arquivo
      fica com o gatilho, o grid de presets, o `onSelect` que grava `icon_url` limpando `icon_key`,
      o "Remover ícone" e o aviso `sharedWithSeries`. O contrato externo (`value`, `onChange`,
      `sharedWithSeries`, `presets`, `triggerLabel`) **não muda** — as sete telas que montam o
      picker não podem ser tocadas. Verificação: `npm run build && npm run lint`
- [x] Ajustar `src/pages/admin/tasks/__tests__/TaskIconPicker.test.tsx`: acrescentar
      `vi.mock("@/api/tasks/iconAssets")` com as quatro funções (o `vi.mock("@/api/tasks")` de
      `:22` continua para os links externos) e trocar os imports das constantes e do
      `SVG_ICON_REMOVED_WARNING` para os caminhos novos. **Nenhuma asserção de comportamento pode
      ser reescrita** — se um `it` precisar mudar de expectativa, a extração quebrou algo.
      Verificação: `npm test src/pages/admin/tasks/__tests__/TaskIconPicker.test.tsx`
- [x] `src/components/assets/__tests__/AssetLibrary.test.tsx` — a biblioteca **fora** do popover,
      montada direta: com `enabled=false` não busca nada; ligando `enabled` busca uma vez e lista
      os assets; lista vazia mostra `ICON_LIBRARY_EMPTY`; erro mostra `ICON_LIBRARY_ERROR`;
      "Gerenciar" abre renomear e excluir, e a confirmação de excluir traz `ICON_DELETE_WARNING`;
      renomear chama `renameIconAsset` e atualiza a linha sem refazer a busca; sem `onSelect` os
      itens não são botões clicáveis. Verificação: `npm test src/components/assets`
- [x] `src/components/assets/__tests__/AssetUploadControls.test.tsx`: arquivo de 2 MB vira toast com
      a frase do limite e **não** chama `uploadIconAsset`; arquivo `.txt` idem, com a frase de
      formato; PNG de 10 KB chama `uploadIconAsset({ file })` e entrega a linha criada em
      `onUploaded`; colar markup de SVG na área abre o campo já preenchido; colar texto que não
      parece SVG não abre nada. Verificação: `npm test src/components/assets`
- [x] Fechar a rodada: `npm run build && npm run lint && npm test && npm run check:bundle`, com a
      contagem de arquivos/testes antes e depois registrada nesta linha (a base era 279 arquivos /
      3102 testes ao fim da 105). `check:bundle` tem de continuar `Bundle budget OK.` — nenhum
      componente novo pode importar Excalidraw nem o barril `@/api/tasks`.
      Verificação: `npm run build && npm run lint && npm test && npm run check:bundle`
      **Rodado (2026-09-24)**: 287 arquivos / 3173 testes antes → **290 arquivos / 3195 testes,
      0 falhas** depois (`npx vitest run --maxWorkers=3`; ver Notas sobre o paralelismo padrão).
      Lint `0 errors, 88 warnings` — idêntico à base. `npm run build` verde e
      `npm run check:bundle` → `Bundle budget OK.`, sem chunk novo de `/notes` ou `/tasks`.

## Prompts

## Notas

Desvios do desenho, decididos na implementação (nenhum pedido do usuário no meio — por isso estão
aqui e não em `## Prompts`):

- **`useAssetLibrary` não expõe `uploadFile`/`uploadSvg`.** Quem chama `uploadIconAsset` é
  `AssetUploadControls`, que é onde a recusa (`assetUploadRejection`) e o toast já moram — e é o que
  a própria tarefa do teste pedia ("PNG de 10 KB chama `uploadIconAsset({ file })`"). O hook expõe
  `adopt(asset)`, que é por onde a linha criada entra na lista. Ter as duas metades chamando a mesma
  API daria dois donos para a mesma operação.
- **`AssetLibrary` ganhou a prop `library` (o controlador) além de `enabled`.** O `PopoverContent`
  do Radix **desmonta os filhos ao fechar**: com o estado da lista dentro da biblioteca, cada
  abertura do popover refaria a busca e perderia o ícone recém-enviado — exatamente o contrário do
  que dois testes da 086 afirmam ("o ícone salvo passa a aparecer na lista ao reabrir o popover, sem
  nova busca"). O picker cria o controlador **acima** do popover e passa; quem monta a biblioteca
  numa tela que não desmonta (a 132) continua passando só `enabled`.
- **`AssetLibrary` monta `AssetUploadControls` dentro dela**, num fragmento — é o que faz as duas
  metades compartilharem o mesmo controlador sem contexto nem prop drilling de estado. O DOM sai
  idêntico ao de antes (fragmento não cria nó, então o `space-y-2.5` do popover continua valendo
  entre a seção e a linha de botões). O "Remover ícone", que é do picker, entra por `uploadTrailing`.
- **`pastedSvgFromEvent` mora em `src/components/assets/pastedSvg.ts`**, não em
  `AssetUploadControls.tsx`. Exportar uma função de um arquivo de componente acende
  `react-refresh/only-export-components` — a base do lint é `0 errors, 88 warnings` e ficaria 89. O
  próprio aviso da regra diz o que fazer: "use a new file to share functions between components".
- **O modo "Gerenciar" agora reseta ao fechar o popover.** Antes ele morava no `TaskIconPicker`
  (fora do popover) e sobrevivia ao fecha-e-abre; agora é estado de view da `AssetLibrary`, que
  desmonta junto. Nenhum teste cobria, e reabrir em modo de **escolha** é o caso comum — mas é a
  única diferença observável do picker nesta rodada, então fica registrada.
- **27 arquivos de teste de `src/pages/admin/tasks/__tests__` passaram a mockar
  `@/api/tasks/iconAssets`** além do barril. É consequência direta da decisão de importar o
  submódulo: o `vi.mock("@/api/tasks")` deles deixou de interceptar a biblioteca. Sem isso,
  `TaskFormFields.test.tsx` e `TaskQuickFields.series-icon.test.tsx` falhavam de verdade e os outros
  25 iriam ao Supabase real ao abrir o popover. As quatro funções saíram das fábricas do barril, que
  ninguém mais importa de lá.
- **Flakiness do paralelismo padrão (ambiente, não a feature).** `npm test` derruba ~4 testes por
  timeout, com conjunto **diferente** a cada rodada (`ProjectDetail.external-links` + três
  `TaskList.*` numa; os dois `TaskDescriptionField.*` na seguinte) — todos passam sozinhos e todos
  passam juntos com `npx vitest run --maxWorkers=3`. Por isso o roteiro de avaliação abaixo usa
  `--maxWorkers=3`.

## Como testar

Rodada de refatoração: o que esta feature entrega é **a biblioteca funcionando igual, montável fora
do popover**. O acesso rápido na tela do canvas é a 132; copiar para o Excalidraw é a 133.

1. **Pré-requisitos**
   - Nenhuma migration nova (`public.icon_asset` e o bucket `task-icons` já existem desde a 086).
   - `npm run dev`, login normal.
   - Ter pelo menos dois assets na biblioteca — se não tiver, o próprio roteiro cria no passo 3.
   - Ter um arquivo PNG com mais de 1 MB à mão (para o caso de borda) e um `.txt` qualquer.

2. **Verificação automatizada** — um comando por linha. `--maxWorkers=3` não é preciosismo: com o
   paralelismo padrão esta máquina derruba ~4 testes por timeout, sempre outros (ver Notas).
   - `npx vitest run --maxWorkers=3 src/domain/tasks/__tests__/assetUpload.test.ts` — passou (8
     testes) = a regra de recusa decide certo nas bordas, inclusive 1 MB exato, e as frases saem
     com o tamanho do arquivo.
   - `npx vitest run --maxWorkers=3 src/components/assets` — passou (14 testes) = a biblioteca
     renderiza fora do popover, busca uma única vez, lista, renomeia sem refazer a busca, exclui com
     aviso, e o upload grande/de formato errado vira toast **sem** chamar `uploadIconAsset`.
   - `npx vitest run --maxWorkers=3 src/pages/admin/tasks/__tests__/TaskIconPicker.test.tsx` —
     passou (38 testes) = os testes da 035/086 continuam verdes **sem asserção reescrita** (o diff
     do arquivo não toca nenhuma linha com `it(`, `describe(` ou `expect`). É este comando que prova
     que a extração não mudou o comportamento do ícone de tarefa.
   - `npx vitest run --maxWorkers=3 src/pages/admin/tasks` — passou (67 arquivos / 747 testes) = as
     sete telas que montam o picker não quebraram ao lado.
   - `npm run build && npm run lint && npm run check:bundle` — passou = `tsc` sem erro, lint
     `0 errors, 88 warnings` (os de `react-refresh` são pré-existentes; 88 é a base, não 0) e
     `Bundle budget OK.`.

3. **Verificação manual, passo a passo**
   1. Abra `/tasks` e clique no `+i` (ou no ícone atual) de qualquer tarefa. **Esperado**: o popover
      abre com o grid de presets, a seção "Meus ícones" e os botões "Enviar imagem" e "Colar SVG" —
      exatamente como antes desta feature.
   2. Clique num ícone da lista. **Esperado**: o popover fecha e o badge da tarefa passa a mostrar
      aquele ícone (a tarefa grava `icon_url` e limpa `icon_key`).
   3. Reabra o popover e clique em "Gerenciar". **Esperado**: a mesma lista vira linhas com lápis e
      lixeira.
   4. Renomeie um asset e clique em "Salvar". **Esperado**: o nome novo aparece na hora, sem a lista
      recarregar (e continua lá ao reabrir o popover).
   5. Clique na lixeira de um asset. **Esperado**: aparece a pergunta com a frase "Sai só da lista —
      as tarefas que já usam este ícone continuam com ele.".
   6. Confirme a exclusão. **Esperado**: o asset some da lista e a tarefa que já usava aquele ícone
      **continua mostrando o ícone** (o arquivo não é apagado do bucket).
   7. Clique em "Enviar imagem" e escolha um PNG pequeno. **Esperado**: ele entra na lista e já vira
      o ícone da tarefa aberta.
   8. Clique em "Colar SVG", cole um markup de SVG e salve. **Esperado**: a prévia sai por `<img>` e
      o ícone entra na lista.
   9. Com o popover aberto e nenhum campo focado, dê `Ctrl+V` com um markup de SVG na área de
      transferência. **Esperado**: o campo "Colar SVG" abre já preenchido (o atalho continua vivo,
      agora por `pastedSvgFromEvent`).
   10. Feche e reabra o popover depois de enviar um ícone. **Esperado**: o ícone novo continua na
       lista e **não** há nova requisição de `icon_asset` — o carregamento é um por picker, não por
       abertura. (Diferença conhecida: se você tinha clicado em "Gerenciar", ao reabrir a lista
       volta no modo de escolha — ver Notas.)
   11. Abra `/tasks/tags` → "Configurar ícones" (`/tasks/link-icons`) e abra o seletor de ícone de
       uma regra. **Esperado**: a mesma biblioteca, com os presets de marca na frente — o segundo
       consumidor do picker continua igual.

4. **Casos de borda e caminhos negativos**
   - **Arquivo grande**: "Enviar imagem" com um PNG de mais de 1 MB → toast "Este arquivo tem
     X,Y MB — o limite é 1 MB.", e **nada** sobe para o bucket (confira na aba Network: não há
     requisição para `storage/v1/object/task-icons`).
   - **Formato errado**: escolher um `.txt` (troque o filtro do seletor para "todos os arquivos") →
     toast "Formato não aceito: envie PNG, JPEG, WebP ou SVG.", sem chamada à API.
   - **SVG malicioso**: colar um SVG com `<script>` → ou a recusa aparece no campo, ou o que é salvo
     está limpo; o arquivo salvo nunca contém `<script>`. (`svgIconSecurity.test.tsx` é a prova
     automatizada.)
   - **Biblioteca vazia** (conta nova): a seção mostra "Nenhum ícone seu ainda — envie uma imagem ou
     cole um SVG." e os presets continuam funcionando.
   - **API fora do ar** (desligue a rede e abra o popover): aparece "Não foi possível carregar seus
     ícones." numa linha, os presets continuam clicáveis, e reabrir o popover tenta de novo.

5. **Sinais de que quebrou**
   - Popover de ícone abrindo vazio ou com erro em tela que antes funcionava → o mock/import de
     `@/api/tasks/iconAssets` ficou pela metade (no teste: o arquivo mocka só o barril
     `@/api/tasks`, que desde a 131 não intercepta mais a biblioteca).
   - Toda linha da lista de tarefas disparando uma requisição de `icon_asset` no Network ao carregar
     a tela → o `enabled` do carregamento preguiçoso se perdeu na extração (era uma consulta por
     card, o motivo de o `loadedRef` existir).
   - `npm run check:bundle` reclamando do chunk de `/notes` ou de `/tasks` → algum componente novo
     importou o barril `@/api/tasks` (ou pior, o Excalidraw).
   - Ícone da tarefa sumindo depois de excluir o asset da lista → voltou a apagar o arquivo do
     bucket, que é justamente o que a 086 decidiu não fazer.
