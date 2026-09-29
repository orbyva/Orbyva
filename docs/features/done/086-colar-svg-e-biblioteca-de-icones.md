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
- [x] **Migration aplicada (2026-09-20); conferência com ressalva registrada.** A
      `20260823110000_icon_asset.sql` **está no remoto** (`supabase migration list --linked`:
      `local=remote=20260823110000`; nenhuma migration pendente no projeto). A conferência abaixo
      foi executada por esta sessão via `supabase db query` — leia o resultado logo após o SQL:

      ```sql
      select count(*) from icon_asset;
      select count(distinct icon_url) from task
       where icon_url is not null and btrim(icon_url) <> '';
      ```

      dão o **mesmo** número (o `btrim(...) <> ''` não é detalhe: é exatamente o filtro da cópia de
      dados da migration — sem ele, uma `icon_url` só com espaço entraria na contagem e faria
      parecer que a cópia perdeu uma linha), e que abrir o seletor de ícone numa tarefa lista os
      ícones antigos na seção "Meus ícones". Roteiro completo de avaliação em `## Como testar`.

      **Resultado (2026-09-20): os números NÃO batem — `icon_asset` = 1, `count(distinct icon_url)`
      = 3.** Apurado, e não é perda de dado do usuário:
      - As 3 `icon_url` em uso são 2 do **esquema antigo** (`{userId}/{taskId}.svg`, arquivos
        enviados em 17/08 17:30 e 19/08 19:36) e 1 do **esquema novo** (`{userId}/library/{uuid}.svg`,
        de 31/08 11:48).
      - A única linha de `icon_asset` é a do esquema novo, nome "conta", criada 31/08 11:48:01 —
        quatro segundos antes da tarefa que a usa. É um **upload pela UI nova**, não a cópia da
        migration.
      - Os 2 ícones legados **não estão** na biblioteca, embora a cópia devesse pegá-los: as duas
        `icon_url` já estavam em `task` quando a migration rodou (arquivos de 17 e 19/08, migration
        de 23/08), e o SQL de fato aplicado contém o bloco de cópia — conferido em
        `supabase_migrations.schema_migrations` (19 statements, `with candidates` e
        `insert into public.icon_asset` presentes). Ou seja: a cópia rodou.
      - Sobram duas explicações, e o banco sozinho não desempata (não há log de auditoria): (i) as
        duas linhas foram inseridas com os nomes automáticos "Ícone 1"/"Ícone 2" e **o usuário as
        apagou** da biblioteca — plausível, porque nome de uuid não diz nada e apagar é o gesto
        natural; (ii) a cópia falhou silenciosamente num caso que o harness
        `supabase/tests/icon_asset/run.sh` não cobre.
      - **Impacto: nenhum sobre o que está na tela.** `task.icon_url` está intacta e as duas tarefas
        seguem exibindo seus ícones — a própria migration documenta que excluir a linha da
        biblioteca não apaga o arquivo. O efeito é só os dois ícones antigos não aparecerem em
        "Meus ícones" para reuso; reenviá-los pelo seletor recria a entrada.
      - **RESPONDIDO pelo usuário em 2026-09-21: "Sim, apaguei."** Fecha a apuração na hipótese
        (i): a cópia da migration **funcionou**, inseriu as duas linhas com os nomes automáticos
        "Ícone 1"/"Ícone 2", e o usuário as apagou da biblioteca depois — gesto natural, já que
        nome derivado de uuid não diz nada na lista. **Não há bug de migration e o harness
        `supabase/tests/icon_asset/run.sh` não precisa de caso novo.** A divergência de contagem
        (1 × 3) é, portanto, estado esperado de uma biblioteca que o usuário curou: ela reflete o
        que ele quis manter, não o que a migration copiou. Nota histórica, não pendência.

## Prompts

## Notas

- **2026-09-18 — a esteira perguntou e NÃO aplicou.** Mesma situação da 085: a `/pipeline`
  apresentou o `supabase db push` como decisão recomendada, o minuto de timeout passou sem resposta,
  e a esteira **não** executa essa opção sozinha — a CLAUDE.md manda confirmar com o usuário antes
  de tocar no banco remoto, e isso ganha da regra de timeout. Fica em `in-progress/`. As duas
  migrations pendentes não conflitam e são aplicadas na ordem do timestamp: `20260823100000` (085,
  links externos) e depois `20260823110000` (086, `icon_asset`).
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
- A seção `## Como testar` foi escrita depois das tarefas, numa passada de fechamento: o arquivo
  nasceu antes de a seção virar obrigatória no fluxo. O roteiro descreve o que foi **entregue**
  (inclusive os desvios registrados acima — a confirmação inline em vez de `ConfirmDeleteDialog`, o
  botão "Gerenciar", a sanitização do `.svg` escolhido no seletor), não o que o plano previa.

## Como testar

### 1. Pré-requisitos

- **A migration desta feature ainda NÃO está aplicada no banco remoto.**
  `supabase/migrations/20260823110000_icon_asset.sql` está escrita e validada em Postgres 16
  descartável, mas `supabase db push` é do usuário (ver a última tarefa, bloqueada). **Enquanto ela
  não for aplicada, só a "Verificação automatizada" abaixo roda.** No app, o popover do seletor abre
  e os presets funcionam, mas a seção "Meus ícones" mostra a linha `Não foi possível carregar seus
  ícones.` e qualquer upload falha com toast — a tabela `icon_asset` não existe. Isso é o estado
  esperado antes do push, não defeito. (Atenção: nesse estado o **arquivo chega a subir** para o
  bucket antes de o insert falhar, deixando órfão em `{userId}/library/` — ver a nota sobre
  `uploadIconAsset` não ser transação.)
- Para a parte do banco: **Docker rodando** (`docker info` responde). O `run.sh` sobe um
  `postgres:16` descartável chamado `orbyva-icon-asset-pg` e o remove no fim; ele **não toca** no
  banco remoto.
- Para a parte manual: `npm run dev`, logado com um usuário qualquer, e a migration já aplicada.
  Tenha pelo menos **uma tarefa existente** em `/tasks`.
- Tenha à mão um SVG para colar. Use este, que é de propósito "sujo" (o `<script>` e o `onload`
  devem sumir):

  ```
  <svg viewBox="0 0 24 24" onload="alert(1)"><script>alert(2)</script><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>
  ```

  E este, limpo, para o caso sem aviso de remoção:

  ```
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor"/></svg>
  ```

- A feature `087` (regras de ícone por link) **não é pré-requisito**, mas reusa o mesmo
  `TaskIconPicker` em `/tasks/link-icons`: se a `087` estiver no ar, a biblioteca e o "Colar SVG"
  aparecem lá também, com outro catálogo de presets.

### 2. Verificação automatizada

Um comando por linha. "Passou" = `Test Files 1 passed` / `0 failed` em cada `vitest`.

```
npx vitest run src/domain/tasks/__tests__/svgIcon.test.ts
npx vitest run src/api/__tests__/iconAssets.test.ts
npx vitest run src/pages/admin/tasks/__tests__/SvgIconPasteField.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/TaskIconPicker.test.tsx
npx vitest run src/pages/admin/tasks/__tests__/svgIconSecurity.test.tsx
bash supabase/tests/icon_asset/run.sh
npm run build && npm run lint && npm test && npm run check:bundle
```

O que cada um significa:

- `svgIcon.test.ts` (23 testes) — a barreira pura, rodando em `jsdom` (`// @vitest-environment
  jsdom` no topo) porque a limpeza depende do `DOMParser` real: `<script>`, `onload`/`onclick` na
  raiz e `<foreignObject>` somem e acendem `removedSomething`; `<svg>` que ficou sem desenho dá
  `empty-after-sanitize`; texto comum, `<script>` solto, `<div><svg></div>` e texto antes do `<svg>`
  dão `not-svg`; prólogo XML e comentário antes do `<svg>` passam; o teto de 64 KB é medido em
  **bytes**; SVG sem `xmlns` ganha o namespace (senão o arquivo não desenha no `<img>`).
- `iconAssets.test.ts` (12 testes) — o I/O, com Supabase falso: o SVG colado sobe com
  `contentType: "image/svg+xml"` e caminho `{userId}/library/{uuid}.svg`; **o que sobe é o markup
  sanitizado, não o colado** (afirmado com um payload que tem `<script>`); **um arquivo `.svg`
  escolhido no seletor também é sanitizado**; markup inválido nem chega ao bucket; o insert leva a
  URL pública e o `user_id`; falha no upload não insere linha; e `deleteIconAsset` **não** chama
  `storage.remove`.
- `SvgIconPasteField.test.tsx` (10 testes) — o campo: a prévia sai por `<img src="data:…">` com o
  SVG **limpo**, `viewBox` sobrevive à limpeza, o aviso de remoção só acende quando algo saiu,
  `onSave` recebe o limpo (nunca o colado), e a mensagem de recusa aparece no **blur**/ao salvar,
  não a cada tecla.
- `TaskIconPicker.test.tsx` (38 testes) — o popover: a lista só é buscada quando ele **abre**;
  selecionar um ícone da biblioteca grava `icon_url` com `icon_key` nulo; vazio/carregando/erro têm
  cada um o seu estado, e o erro **não derruba os presets**; "Colar SVG" abre o campo e o `onPaste`
  do popover o abre já preenchido, sem sequestrar a colagem quando há campo focado; salvar põe o
  ícone na lista **e** o adota na tarefa; "Enviar imagem" funciona **sem tarefa salva** (a dica
  antiga sumiu) e o upload não leva id de tarefa nenhum; excluir pede confirmação e não altera o
  `icon_url` da tarefa; renomear troca só o rótulo.
- `svgIconSecurity.test.tsx` (19 testes) — o teste de segurança explícito: para cada payload
  malicioso (`<script>`, `onload`, `<foreignObject>` com `<img onerror>`, `href="javascript:"`,
  entidade HTML disfarçando `javascript:`), nenhum nó perigoso chega ao documento da página e nada
  disso aparece no que vai ao upload; nenhum arquivo do caminho do ícone usa
  `dangerouslySetInnerHTML`; e o ícone salvo é sempre exibido por `<img>`.
- `run.sh` — imprime `OK: 20260823110000_icon_asset.sql validada em Postgres 16.` no fim. Prova, num
  Postgres descartável: um **controle negativo** (antes da migration a tabela não existe,
  `wipe_own_data` não a conhece); schema + `unique (user_id, url)` + índice + FK + as 4 policies de
  RLS; a cópia do dado antigo trazendo **3** linhas do seed de 4 tarefas com `icon_url` não vazia (as
  duas que apontam para a **mesma** URL viram uma só; a de `icon_key` puro e a de `icon_url = '   '`
  não geram linha); reaplicar a migration não duplicar; o reparo do bucket (degradado de propósito
  para `image/png`/50 KB e reparado para incluir `image/svg+xml` e 1 MB); excluir a linha **não**
  apagar o objeto do bucket nem alterar as tarefas que usam a URL; a policy do bucket continuar
  presa ao dono com `library/` no caminho; e `wipe_own_data` apagar a biblioteca do usuário sem
  tocar na do vizinho.
- `npm run build && npm run lint && npm test && npm run check:bundle` — a suíte inteira e os
  orçamentos, para garantir que nada adjacente quebrou. Referência da rodada em que este roteiro foi
  escrito (2026-09-18): **263 arquivos / 2899 testes / 0 falhas**; lint com **0 erros** e 88
  warnings de `react-refresh` (o mesmo tipo que já existia antes da feature); `Bundle budget OK`. O
  número sobe conforme outras features entram — o que importa é `0 failed`.

### 3. Verificação manual, passo a passo

Só depois de `supabase db push` (ver a última tarefa, bloqueada).

1. `/tasks` → abra uma tarefa existente (clique no título). No formulário, clique no seletor de
   ícone (o `+i`, ou o ícone atual). *Esperado*: o popover abre com o grid de presets e, abaixo de
   uma linha divisória, o rótulo **"Meus ícones"**.
2. Repare na seção "Meus ícones". *Esperado*: se você já tinha enviado ícones antes desta feature,
   eles **já estão lá** (a migration copiou cada `icon_url` distinto). Nunca enviou nenhum? Aparece
   `Nenhum ícone seu ainda — envie uma imagem ou cole um SVG.`
3. Clique em **"Colar SVG"**. *Esperado*: os botões dão lugar ao campo **"Markup do SVG"**, com a
   prévia vazia dizendo `A prévia aparece quando você colar o SVG` e um campo **"Nome na lista"**.
4. Cole o SVG **sujo** dos pré-requisitos no campo de markup. *Esperado*: a prévia desenha um
   círculo e, ao lado, em âmbar: `Parte do conteúdo foi removida por segurança — confira a prévia
   antes de salvar.`
5. Escreva `Círculo` em "Nome na lista" e clique em **"Salvar ícone"**. *Esperado*: o popover fecha
   e o ícone da tarefa passa a ser o círculo.
6. Abra o seletor de novo. *Esperado*: o círculo está na seção "Meus ícones", com a borda de
   selecionado (é o ícone em uso). Salve a tarefa e recarregue a página: o ícone continua.
7. Confira que o arquivo salvo é o **limpo**: abra a URL do ícone numa aba (botão direito na imagem
   → copiar endereço). *Esperado*: o navegador desenha o círculo e **nenhum `alert` dispara**; vendo
   o código-fonte, não há `<script>` nem `onload`.
8. Abra **outra** tarefa e o seletor dela. *Esperado*: o mesmo círculo está na lista — é esse o
   ponto da biblioteca. Clique nele. *Esperado*: vira o ícone desta tarefa também, **sem reenviar
   arquivo nenhum**.
9. Atalho de colar: com o popover aberto e **nenhum campo focado**, dê `Ctrl+V` (ou `Cmd+V`) com o
   SVG limpo dos pré-requisitos na área de transferência. *Esperado*: o campo de colar abre **já
   preenchido**, com a prévia do quadrado e o texto `Prévia do ícone que será salvo.` (sem aviso de
   remoção, porque nada foi tirado).
10. **Enviar imagem sem tarefa salva**: `/tasks` → **Nova tarefa**, e antes de salvar clique no
    seletor de ícone → **"Enviar imagem"**. *Esperado*: o seletor de arquivos abre normalmente —
    **não** há mais botão desabilitado nem a dica "Salve a tarefa antes de enviar uma imagem".
    Escolha um PNG. *Esperado*: ele entra na lista "Meus ícones" e já vira o ícone da tarefa em
    rascunho.
11. **Gerenciar**: com pelo menos um ícone na lista, clique em **"Gerenciar"** (o link pequeno à
    direita de "Meus ícones"). *Esperado*: o grid vira uma lista de linhas, cada uma com miniatura,
    nome e dois botões (lápis e lixeira). Clicar em **"Concluir"** volta ao grid.
12. **Renomear**: no modo Gerenciar, clique no lápis de um ícone, troque o nome e clique em
    **"Salvar"**. *Esperado*: o rótulo muda na linha. Reabra o popover: o nome novo persiste, e o
    ícone das tarefas que o usam **não muda** (o nome é só rótulo da lista).
13. **Excluir**: clique na lixeira de um ícone que **está em uso** por alguma tarefa. *Esperado*: a
    linha vira uma confirmação inline — `Excluir "<nome>"? Sai só da lista — as tarefas que já usam
    este ícone continuam com ele.` — com "Cancelar" e "Excluir". Confirme. *Esperado*: some da
    lista; volte para `/tasks` e a tarefa **continua mostrando o ícone**.
14. Se a `087` estiver no ar, repita os passos 3–6 em `/tasks/link-icons` (seletor de ícone de uma
    regra). *Esperado*: mesma seção "Meus ícones", mesmo "Colar SVG", presets diferentes (marcas).

### 4. Casos de borda e caminhos negativos

| Caso | O que fazer | Esperado |
| --- | --- | --- |
| Não é SVG | cole `olá mundo` no campo e saia dele (Tab) | `Isso não parece um SVG — cole o markup começando em <svg>.`; nada é enviado |
| Aviso prematuro | comece a digitar `<sv` e **não** saia do campo | nenhum aviso enquanto digita — a checagem é no blur (ou ao clicar em Salvar) |
| SVG dentro de HTML | cole `<div><svg viewBox="0 0 8 8"><circle r="3"/></svg></div>` | `not-svg` — a raiz precisa ser o próprio `<svg>`, senão gravaríamos HTML arbitrário como `image/svg+xml` |
| Só conteúdo perigoso | cole `<svg><script>alert(1)</script></svg>` | `Esse SVG só tinha conteúdo que foi removido por segurança — não sobrou desenho nenhum.` |
| SVG grande demais | cole um markup acima de **64 KB** | `SVG grande demais — o limite é 64 KB.` (o tamanho é medido antes do parse) |
| Nome vazio | salve um SVG colado sem preencher "Nome na lista" | entra na lista como **"Ícone colado"**; upload de arquivo sem nome usa o nome do arquivo sem extensão |
| SVG sem `xmlns` | cole o SVG sujo dos pré-requisitos (ele não tem `xmlns`) | o ícone **desenha** na tarefa — a preparação acrescenta o namespace, sem o qual o arquivo salvaria "com sucesso" e apareceria quebrado |
| Arquivo `.svg` pelo seletor | "Enviar imagem" e escolha um `.svg` baixado de um site | sobe **sanitizado**, igual ao colado (não há caminho de upload sem limpeza) |
| Colagem no campo de renomear | modo Gerenciar → lápis → `Ctrl+V` dentro do campo | o texto vai para o **campo**; o atalho do popover não sequestra a colagem |
| Cancelar a exclusão | lixeira → "Cancelar" | nada é chamado; o ícone continua na lista |
| Escopo de usuário | outro usuário abrindo o seletor | vê só a própria biblioteca — RLS por `user_id` nas 4 operações, coberta por `03_assert_behavior.sql` |
| Biblioteca fora do ar | (simulável só com a migration ausente) | a linha `Não foi possível carregar seus ícones.` aparece e **os presets continuam utilizáveis** |
| Ícone antigo (pré-086) | usuário que já tinha ícones enviados | continuam funcionando sem nada a fazer (`icon_url` é URL absoluta) **e** aparecem na lista, com nome derivado do arquivo — nome de arquivo que é uuid vira `Ícone N` |

### 5. Sinais de que quebrou

- **"Meus ícones" sempre com `Não foi possível carregar seus ícones.`** → a migration não foi
  aplicada (a tabela `icon_asset` não existe) ou a RLS está barrando. Confira com
  `select count(*) from icon_asset`.
- **O ícone salva "com sucesso" mas aparece quadrado vazio/quebrado** → o `xmlns` deixou de ser
  acrescentado, ou o que subiu não é o `outerHTML` do `<svg>` raiz. Abra a URL do arquivo direto: um
  SVG sem namespace não desenha em `<img>`.
- **Abrir a URL do ícone dispara `alert`, ou o DevTools mostra `<script>` dentro do arquivo** →
  **regressão de segurança grave**: a sanitização saiu do caminho do upload. É exatamente o que
  `iconAssets.test.ts` e `svgIconSecurity.test.tsx` existem para impedir.
- **Excluir um ícone da lista quebra o ícone de tarefas antigas** → alguém acrescentou
  `storage.remove` no `deleteIconAsset`; a decisão é apagar **só** a linha.
- **O upload volta a pedir tarefa salva ("Salve a tarefa antes de enviar uma imagem")** → o caminho
  do bucket voltou a ser por tarefa; a `taskId` foi reintroduzida no picker.
- **A lista se enche de duplicatas do mesmo arquivo** → o `unique (user_id, url)` sumiu, ou a cópia
  de dados da migration rodou sem o `on conflict do nothing`.
- **Abrir qualquer tela de tarefa dispara uma busca de ícones por card (rede cheia de requisições)**
  → a busca deixou de ser feita só na abertura do popover.
- **Teste de `src/pages/admin/tasks` falhando com "fetchIconAssets is not a function"** → algum
  `vi.mock("@/api/tasks", () => …)` com fábrica (substituição **total** do módulo) ficou sem as
  chaves novas; ver a nota sobre `GanttChart.test.tsx`.
- **`run.sh` falha com "Cannot connect to the Docker daemon"** → é ambiente, não a feature: suba o
  Docker e rode de novo.
