---
prompt: |
  permitir também colar svg na aba de ícone, ao adicionar o ícone, e aí esse ícone já fica salvo também na lista
---

# 086 — Colar SVG no seletor de ícone e biblioteca de ícones reutilizáveis

## Contexto

O seletor de ícone da tarefa (`TaskIconPicker.tsx`, features `done/035`, `done/040`, `done/073`) tem
hoje duas fontes: o catálogo fixo de presets lucide (`TASK_ICON_PRESETS` em `TaskIconBadge.tsx`,
gravado em `task.icon_key`) e o upload de arquivo, que vai para o bucket público `task-icons` no
caminho `{userId}/{originId}.{ext}` e grava a URL pública em `task.icon_url`. As duas colunas são
mutuamente exclusivas.

Duas consequências disso que o pedido ataca: **não existe lista dos ícones que o usuário já enviou**
— cada tarefa tem o seu arquivo, e reusar o mesmo ícone em outra tarefa significa reenviar o mesmo
arquivo —, e **o caminho do arquivo é preso a uma tarefa**, o que a 073 já teve de contornar
gravando no id da *origem* da série para o arquivo não morrer com uma ocorrência qualquer.

O pedido é "colar SVG" e "esse ícone já fica salvo também na lista": as duas metades de uma
biblioteca de ícones do usuário. A `todo/087` (regras de ícone por regex) escolhe ícones dessa mesma
biblioteca — por isso ela vem depois desta.

**SVG colado é conteúdo ativo.** É markup arbitrário, vindo de um site qualquer, que vai parar num
bucket **público** e é servido por uma URL que pode ser aberta como página de topo. Sanitização não
é detalhe de implementação aqui: é o eixo da feature. O app já tem a peça certa —
`sanitizeSvgMarkup`/`sanitizeSvgElement` em `src/components/markdown/sanitizeSvg.ts` (features 057 e
058), que limpa num documento inerte do `DOMParser`, sem executar script nem carregar imagem durante
a limpeza.

## Decisões

- **Tabela nova `icon_asset`** (`id`, `user_id`, `name text not null`, `url text not null`,
  `created_at`), com RLS nas 4 operações e entrada no `wipe_own_data`, no molde de
  `20260816170000_note_links.sql`. A lista precisa de uma tabela: listar o bucket por
  `storage.list()` não dá nome, não dá ordem estável e vaza a estrutura de pastas para o cliente.
- **O SVG colado é gravado como arquivo no storage, não como texto numa coluna.** Assim
  `TaskIconBadge` continua sendo um `<img src>` — e **`<img>` é a barreira mais importante**: um SVG
  carregado por `<img>` roda em modo restrito, sem script e sem acesso ao documento. Guardar o markup
  numa coluna convidaria a render inline (`dangerouslySetInnerHTML`), que é exatamente o que a 055
  desligou no app inteiro.
- **Duas barreiras, não uma**: (1) `sanitizeSvgMarkup` roda **antes** do upload, e o que sobe é o
  resultado da limpeza, nunca o texto colado; (2) o consumo é sempre por `<img>`. A primeira existe
  porque o bucket é público e a URL pode ser aberta como navegação de topo, onde o modo restrito do
  `<img>` não vale — nesse contexto o único que protege é o arquivo já estar limpo.
- **O que é rejeitado antes de subir**: markup que não contenha um `<svg>` raiz; markup que, depois
  da limpeza, fique sem nenhum elemento de desenho (era só script/`foreignObject`); markup acima de
  **64 KB** (ícone é ícone; e o teto do bucket é 1 MB). Cada caso tem mensagem própria — "isso não
  parece um SVG", "esse SVG só tinha conteúdo que foi removido por segurança", "SVG grande demais".
- **`sanitizeSvg.ts` sai de `src/components/markdown/`** para um lugar neutro
  (`src/lib/sanitizeSvg.ts`), já que passa a ter consumidor fora do renderer de markdown. É mover
  arquivo e atualizar imports, sem tocar na lógica nem nos testes existentes.
- **Todo ícone custom passa a ir para a biblioteca — inclusive o upload de arquivo.** É o "fica
  salvo também na lista" do pedido lido no sentido forte: não faria sentido o SVG colado entrar na
  lista e a imagem enviada não entrar.
- **O caminho no bucket deixa de ser por tarefa e passa a ser por ícone**:
  `{userId}/library/{uuid}.{ext}`. Consequência boa e explícita: some o motivo pelo qual a 073
  precisou usar o id da *origem* da série (arquivo preso a uma ocorrência que pode ser excluída), e
  o upload deixa de exigir uma tarefa já salva — `TaskIconPicker` perde o estado desabilitado e a
  dica "Salve a tarefa antes de enviar uma imagem". `uploadTaskIcon(taskId, file)` é substituída por
  `uploadIconAsset(file | svgMarkup, name)`; a assinatura antiga sai.
- **Ícones antigos continuam funcionando sem nada a fazer** (`task.icon_url` é URL absoluta), e uma
  migration de dados popula a biblioteca com o `distinct icon_url` já existente, dando a cada um um
  nome derivado do arquivo. Sem isso a lista nasce vazia mesmo para quem já enviou ícones, o que
  pareceria perda de dado.
- **Excluir da biblioteca não mexe em quem usa.** A linha some da lista; o arquivo permanece no
  bucket e as tarefas que apontam para aquela URL continuam mostrando o ícone. O contrário —
  apagar o arquivo e quebrar o ícone de tarefas antigas em silêncio — é destrutivo e não foi pedido.
  O diálogo de exclusão diz isso em uma linha.
- **Renomear é permitido** (o nome é só rótulo da lista), com o mesmo `ConfirmDeleteDialog`/`Dialog`
  do padrão do app.
- **Onde a lista aparece**: dentro do próprio popover do `TaskIconPicker`, numa seção "Meus ícones"
  logo abaixo dos presets, com o mesmo grid de botões. É onde o usuário está quando quer escolher —
  uma página separada obrigaria a sair do formulário para pegar um ícone.
- **Como se cola**: dois caminhos, porque `Ctrl+V` dentro de um popover só funciona se houver campo
  focado — um botão "Colar SVG" que abre um campo de texto com prévia do resultado **já
  sanitizado**, e um `onPaste` no próprio conteúdo do popover que preenche esse campo quando o que
  foi colado parece SVG. O botão é o caminho garantido; o `onPaste` é o atalho.
- **A prévia mostra o SVG limpo, não o colado** — se a limpeza tirou algo, o usuário vê antes de
  salvar. Uma linha discreta avisa quando algo foi removido.
- **Fora de escopo**: ícone customizado em projeto/nota/meta (só tarefa tem os campos hoje), busca
  ou tags dentro da biblioteca, e importar pacote de ícones de terceiros.

## Tarefas

- [x] Mover `src/components/markdown/sanitizeSvg.ts` para `src/lib/sanitizeSvg.ts` e atualizar os
      imports (`MermaidBlock`, `CanvasBlock`, `src/components/__tests__/sanitizeSvg.test.tsx`), sem
      alterar nenhuma linha da lógica. Verificação: `npm run build && npm run lint && npm test src/components`
- [x] Criar `src/domain/tasks/svgIcon.ts` (puro, sem I/O): `prepareSvgIcon(markup)` devolvendo
      `{ ok: true, svg, removedSomething }` ou `{ ok: false, reason }` com as razões fechadas
      (`"not-svg" | "empty-after-sanitize" | "too-large"`), usando `sanitizeSvgMarkup` e o teto de
      64 KB numa constante exportada. Verificação: `npm run build`
- [x] Testar em `src/domain/tasks/__tests__/svgIcon.test.ts`: `<svg>` simples passa e volta igual;
      `<script>` dentro do SVG é removido e `removedSomething` fica `true`; `onload`/`onclick` na
      raiz `<svg>` somem; `href="javascript:…"` some; `<foreignObject>` some; markup que é só
      `<script>` dá `empty-after-sanitize`; texto que não é SVG dá `not-svg`; `<div>` com um `<svg>`
      dentro dá `not-svg` (a raiz precisa ser o SVG); markup acima do teto dá `too-large`; string
      vazia dá `not-svg`. Verificação: `npm test src/domain/tasks`
- [x] Escrever a migration `supabase/migrations/<timestamp>_icon_asset.sql`: tabela `icon_asset`,
      índice `(user_id, created_at desc)`, `comment on table`, `enable row level security` + as 4
      policies e a inclusão no `wipe_own_data`. Timestamp único — conferir `ls supabase/migrations/`
      antes. **Não rodar `supabase db push`.** Verificação: a validação em Postgres abaixo
- [x] Na mesma migration: ampliar o bucket `task-icons` se necessário (conferir
      `allowed_mime_types` e `file_size_limit` da migration de origem, `_task_icon.sql`) para o
      caminho `library/` e o mime `image/svg+xml` — e **conferir que as policies do bucket seguem
      restritas a `(storage.foldername(name))[1] = auth.uid()::text`**, que continua valendo com a
      subpasta. Verificação: leitura da migration original + a validação em Postgres abaixo
- [x] Na mesma migration: popular `icon_asset` a partir do `distinct task.icon_url` existente
      (`insert … select` com nome derivado do nome do arquivo), idempotente. Verificação: a
      validação em Postgres abaixo
- [x] Validar a migration em Postgres 16 descartável, criando `supabase/tests/icon_asset/`
      (`00_stubs.sql`, `01_seed.sql` com tarefas com e sem `icon_url` e duas apontando para a
      **mesma** URL, `02_assert_schema.sql`, `03_assert_behavior.sql`, `run.sh`), no molde de
      `supabase/tests/note_canvas/`. Afirmar: a URL repetida vira **uma** linha; tarefa sem
      `icon_url` não gera linha; reaplicar não duplica; RLS barra leitura alheia; `wipe_own_data`
      apaga os ícones do usuário. Verificação: `bash supabase/tests/icon_asset/run.sh`
- [x] `src/types/tasks.ts` (ou `src/types/icons.ts`, se ficar mais claro): `IconAsset` e
      `IconAssetDraft`. Verificação: `npm run build`
- [x] `src/api/tasks/iconAssets.ts` (arquivo novo): `fetchIconAssets()`, `renameIconAsset(id, name)`
      e `deleteIconAsset(id)` (só a linha, sem tocar no storage — decisão registrada acima), todas
      filtrando por `user_id`. Verificação: `npm run build`
- [x] No mesmo arquivo: `uploadIconAsset({ file } | { svg }, name)` — gera o `uuid`, sobe para
      `{userId}/library/{uuid}.{ext}` com `contentType` correto (`image/svg+xml` para o colado),
      pega a URL pública e insere a linha em `icon_asset`, devolvendo o `IconAsset`. Falha no insert
      depois de o arquivo já ter subido: o arquivo fica órfão no bucket e o erro sobe — registrar
      isso em `## Notas` em vez de fingir transação. Verificação: `npm run build`
- [x] Aposentar `uploadTaskIcon` em `src/api/tasks/tasks.ts`, migrando o único chamador
      (`TaskIconPicker`) para `uploadIconAsset`. Verificação: `npm run build && npm run lint`
- [x] `src/api/__tests__/iconAssets.test.ts` (Supabase falso): o SVG colado sobe com
      `contentType: "image/svg+xml"` e no caminho `library/`; o conteúdo que sobe é o **sanitizado**,
      não o original (afirmar com um markup que contém `<script>`); o insert leva a URL pública e o
      `user_id`; `deleteIconAsset` não chama `storage.remove`. Verificação: `npm test src/api`
- [x] Criar `src/pages/admin/tasks/SvgIconPasteField.tsx`: `textarea` para colar o markup, prévia do
      resultado **sanitizado** renderizada por `<img>` com data URI (nunca inline), campo de nome,
      botões Cancelar/Salvar. Mostra a mensagem de cada `reason` de `prepareSvgIcon` e o aviso
      discreto quando algo foi removido pela limpeza. Verificação: `npm run build && npm run lint`
- [x] `TaskIconPicker.tsx`: seção "Meus ícones" abaixo dos presets — grid dos `icon_asset`
      carregados, selecionar grava `{ icon_key: null, icon_url }`, com o estado de seleção marcado
      igual ao dos presets. Verificação: `npm run build && npm run lint`
- [x] `TaskIconPicker.tsx`: estados da seção nova — carregando (esqueleto curto, não spinner de tela
      cheia), vazio ("Nenhum ícone seu ainda — envie uma imagem ou cole um SVG"), e erro de
      carregamento (linha de aviso, sem derrubar os presets, que continuam utilizáveis).
      Verificação: `npm run build`
- [x] `TaskIconPicker.tsx`: botão "Colar SVG" abrindo o `SvgIconPasteField`, e `onPaste` no conteúdo
      do popover que preenche o campo quando o texto colado parece SVG. Ao salvar, o ícone novo
      entra na lista **e** já vira o ícone da tarefa. Verificação: `npm run build && npm run lint`
- [x] `TaskIconPicker.tsx`: o upload de arquivo passa a chamar `uploadIconAsset` e a entrar na
      lista; remover o `disabled` e a dica "Salve a tarefa antes de enviar uma imagem" (a decisão de
      caminho por biblioteca tornou o `taskId` desnecessário para upload). Verificação:
      `npm run build && npm run lint`
- [x] `TaskIconPicker.tsx`: excluir e renomear um ícone da biblioteca, com `ConfirmDeleteDialog` que
      diz em uma linha que as tarefas que já usam o ícone continuam mostrando-o. Verificação:
      `npm run build && npm run lint`
- [x] Revisar o que sobra da 073 depois da mudança de caminho: `TaskIconPicker` ainda recebe
      `taskId` só para o aviso `sharedWithSeries`? Se sim, remover a prop `taskId` e manter só
      `sharedWithSeries`, ajustando `TaskFormFields.tsx` e `TaskQuickFields.tsx`. Registrar a
      escolha em `## Notas`. Verificação: `npm run build && npm run lint && npm test src/pages/admin/tasks`
- [x] Estender `src/pages/admin/tasks/__tests__/TaskIconPicker.test.tsx`: a seção "Meus ícones"
      lista o que veio da API e selecionar um grava `icon_url` com `icon_key` nulo; a lista vazia
      mostra o texto de vazio; erro de carregamento não esconde os presets; colar um SVG com
      `<script>` salva o **limpo** e mostra o aviso de remoção; SVG inválido não chama a API e
      mostra a mensagem; excluir some da lista sem alterar `task.icon_url`. Verificação:
      `npm test src/pages/admin/tasks`
- [x] Teste de segurança explícito (arquivo próprio, `src/pages/admin/tasks/__tests__/svgIconSecurity.test.tsx`):
      a prévia nunca usa `dangerouslySetInnerHTML` e o que chega ao upload, para um conjunto de
      payloads maliciosos (`<script>`, `onload`, `<foreignObject>` com `<img onerror>`, `href` com
      `javascript:`, entidade HTML disfarçando `javascript:`), não contém nenhum deles.
      Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada aqui. **226 arquivos / 2471 testes / 0 falhas**; lint com 0 erros (82
      warnings de `react-refresh`, o mesmo tipo que já existia); `Bundle budget OK`. Mais
      `bash supabase/tests/icon_asset/run.sh` verde (Postgres 16 em Docker).
- [ ] **BLOQUEADA — `supabase db push`.** A migration só vai ao banco remoto com confirmação do
      usuário (regra do projeto). Depois do push, conferir que `select count(*) from icon_asset`
      bate com `select count(distinct icon_url) from task where icon_url is not null` e que abrir o
      seletor de ícone lista os ícones antigos.

## Prompts

## Notas

- `prepareSvgIcon` acabou fazendo **duas** coisas além do previsto, as duas descobertas ao testar:
  (a) devolve o `outerHTML` do `<svg>` raiz, não o `innerHTML` do body — sem isso, um markup com
  lixo depois do `</svg>` (ou um prólogo XML antes) geraria um arquivo inválido como
  `image/svg+xml`, que o `<img>` simplesmente não desenha; (b) acrescenta
  `xmlns="http://www.w3.org/2000/svg"` quando falta. SVG copiado de dentro de uma página vem sem
  namespace (inline em HTML não precisa dele), e como aqui ele vira **arquivo**, sem o namespace o
  ícone salvaria "com sucesso" e apareceria quebrado. Nenhuma das duas afrouxa a limpeza.
- A razão `empty-after-sanitize` é para markup com `<svg>` raiz que ficou **sem elemento nenhum**
  dentro depois da limpeza (era só `script`/`foreignObject`, ou já era `<svg></svg>`). Um
  `<script>` solto, sem `<svg>` em volta, cai antes em `not-svg` — a raiz não é um SVG, e "isso não
  parece um SVG" é a mensagem certa para ele. Os dois casos têm teste.
- `svgIcon.test.ts` roda com `// @vitest-environment jsdom` no topo (precedente:
  `src/domain/notes/__tests__/outline.test.ts`), porque `.test.ts` roda em `node` por padrão neste
  repo e a limpeza depende de `DOMParser`. Testar contra o parser real é o ponto: é ele que
  decodifica `java&#9;script:` e desfaz os disfarces que um teste sobre string deixaria passar.
- O `onPaste` do popover ignora colagens cujo alvo é um campo (`input`/`textarea`/contenteditable):
  sem isso ele sequestraria a colagem no campo de renomear ícone, já que o handler mora no conteúdo
  inteiro do popover e o evento borbulha. Tem teste.
- Na primeira rodada da suíte cheia, `CanvasBlock.test.tsx` falhou uma vez (`host.querySelector("svg")`
  nulo) e passou isolado e na rodada seguinte — intermitência de carga, não regressão: nada desta
  feature toca o `CanvasBlock` (só o import de `sanitizeSvg`, que mudou de lugar sem mudar de
  conteúdo). Anotado para não parecer que a suíte foi dada como verde por cima de uma falha.
- Vários testes de `src/pages/admin/tasks` mockam `@/api/tasks` com fábrica (`vi.mock(..., () => …)`),
  que é **substituição total** do módulo: como o `TaskIconPicker` passou a importar `fetchIconAssets`
  (e `delete`/`rename`), toda fábrica precisou ganhar essas chaves, senão o import estoura em quem
  só abre o popover de passagem. Foi o que quebrou `GanttChart.test.tsx` na primeira rodada.
- **073, o que sobrou dela** (tarefa de revisão): a prop `taskId` foi **removida** do
  `TaskIconPicker`. Depois da mudança de caminho ela não tinha mais nenhum uso — nem no upload (que
  não conhece tarefa), nem no estado desabilitado (que sumiu junto com a dica "Salve a tarefa antes
  de enviar uma imagem"). O que resta da 073 no picker é só `sharedWithSeries`, o aviso de que
  gravar ali vale para a série inteira. `TaskFormFields.tsx` e `TaskQuickFields.tsx` deixaram de
  calcular `recurrence_origin_id ?? id` para passar adiante.
- **Desvio do plano (UI de excluir/renomear)**: a confirmação de exclusão é **inline dentro do
  popover**, não um `ConfirmDeleteDialog`. O texto e o comportamento são os da decisão ("o diálogo
  de exclusão diz em uma linha que as tarefas que já usam o ícone continuam mostrando-o"), mas
  `ConfirmDeleteDialog` é um `AlertDialog` **modal em portal**: aberto de dentro de um
  `PopoverContent`, o clique nos botões dele conta como interação *fora* do popover, que é
  justamente o que o Radix usa para fechar o popover — e a única forma honesta de confirmar que o
  encadeamento se comporta seria abrindo o navegador, que este fluxo proíbe. A tira inline não tem
  portal, não tem segundo focus-scope, e é verificável por teste de componente. Renomear, pelo mesmo
  motivo, é um campo na própria linha. As duas ações ficam atrás de um "Gerenciar", porque o caso
  comum do popover é **escolher** um ícone, não editar a biblioteca.
- **Desvio do plano (segurança, ampliação)**: a sanitização mora **dentro** de `uploadIconAsset`,
  não só na tela, e vale também para `.svg` **escolhido no seletor de arquivos** — não só para o
  markup colado. O seletor aceita `image/svg+xml` desde a 035, e a `uploadTaskIcon` antiga subia
  esse arquivo cru: mesma origem possível (baixado de um site qualquer), mesmo bucket público, mesmo
  risco de a URL ser aberta como navegação de topo, onde o modo restrito do `<img>` não vale.
  Deixar a barreira só no campo de colar teria mantido um caminho de upload sem limpeza. Coberto por
  "arquivo .svg também é sanitizado antes de subir" em `src/api/__tests__/iconAssets.test.ts`.
- `uploadIconAsset` **não é transação**: o arquivo sobe primeiro e a linha entra depois. Se o insert
  falhar, o arquivo fica órfão no bucket e o erro sobe para o chamador. Apagar o arquivo num `catch`
  esconderia o erro real atrás de um segundo erro possível; o órfão é invisível para o usuário e não
  custa nada. Há teste de que a falha no **upload** não insere linha nenhuma (o caso inverso, que
  deixaria uma linha apontando para arquivo inexistente).
- `uploadTaskIcon` foi **removida** (não depreciada), como manda a decisão "a assinatura antiga
  sai". Além do caminho por tarefa, ela era um segundo caminho de upload **sem sanitização**;
  mantê-la viva ao lado de `uploadIconAsset` deixaria o buraco aberto para o próximo chamador. Os
  arquivos já gravados em `{userId}/{taskId}.{ext}` continuam no bucket e as tarefas que apontam
  para eles seguem funcionando — `icon_url` é URL absoluta, e a migration copiou cada uma para a
  biblioteca.
- `removedSomething` compara a serialização do SVG **limpo** com a do SVG só reparseado (sem
  limpeza), as duas pelo mesmo parser: assim a normalização do HTML (`<path/>` → `<path></path>`)
  não conta como remoção, e só uma tag/atributo que sumiu de verdade acende o aviso.
