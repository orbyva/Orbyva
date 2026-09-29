---
prompt: |
  a aba de links externos, precisa ser melhorada, e coloque uma seção para que eu configure os ícones pre-configurados, por exemplo, links do github vão aparecer com o ícone do github, e com o texto que deriva do link, esse regex, e o ícone precisa ser uma aba que será configurada.
---

# 087 — Ícone e rótulo de link externo por regra de regex configurável

## Contexto

Hoje o reconhecimento de link externo é **código**: `detectGitHubLink`
(`src/domain/tasks/externalLink.ts`) tem uma regex fixa de issue/PR do GitHub, e
`ExternalLinkChip` (`TaskViews.tsx:64`) tem um `if` que escolhe entre o ícone `Github` com o texto
`owner/repo#N` e um chip genérico "Link externo". Qualquer outro serviço — GitLab, Jira, Figma,
Linear, Notion — cai no genérico, e acrescentar um exige mexer no código.

O pedido é justamente inverter isso: as regras (regex → ícone → texto derivado do link) viram
**configuração do usuário**, numa tela própria. Depende de duas features desta mesma rodada:
`todo/085` (os links externos com comentário, que são o que a regra decora) e `todo/086` (a
biblioteca de ícones, que é de onde vem o ícone do GitHub que o app não tem hoje — `lucide` tem
`Github`, mas não Jira nem Figma).

Precedente de tela de configuração dentro do módulo de tarefas: `/tasks/tags` (`Tags.tsx`), com
`PageShell`, `ConfirmDeleteDialog`, `EmptyState` e `TableLoadingSkeleton`. Ela não está na sidebar —
chega-se por dentro do módulo. É o mesmo tratamento que esta tela recebe.

## Decisões

- **Tabela nova `link_icon_rule`**: `id`, `user_id`, `name text not null` (o nome da regra, ex.
  "GitHub issue"), `pattern text not null` (a regex), `label_template text` (o "texto que deriva do
  link"), `icon_key text` (preset lucide) **ou** `icon_url text` (ícone da biblioteca da 086),
  `position int not null`, `enabled boolean not null default true`, `created_at`. RLS nas 4
  operações + `wipe_own_data`, no molde de `20260816170000_note_links.sql`.
- **Ordem e conflito, fechados explicitamente**: as regras são avaliadas na ordem de `position`
  (crescente), e **a primeira que casa vence** — as seguintes nem são testadas. Duas regras que
  casam a mesma URL não é erro nem aviso: é o mecanismo pelo qual "GitHub issue" (específica) fica
  acima de "GitHub" (genérica). A ordem é editável por setas ↑/↓ na tela de configuração, e é o
  único lugar em que a precedência é decidida. Regra com `enabled = false` é pulada sem sair da
  lista — é o "desligar sem perder" que evita apagar uma regra só para testar outra.
- **Nenhuma regra casa → o comportamento de hoje, intacto**: ícone `ExternalLink` e rótulo derivado
  do **host** da URL (`github.com`, `docs.google.com`), que é mais informativo que o literal "Link
  externo" de hoje e não depende de configuração nenhuma. URL que nem parseia como URL → rótulo é a
  própria string cortada. **Esse fallback não é escrito aqui**: a `085` já o entrega como
  `describeExternalLink(url)` em `src/domain/tasks/externalLink.ts` (é o que alimenta a prévia por
  link do formulário dela), e `resolveLinkAppearance` **delega** a ele — duas implementações do
  mesmo texto divergiriam na primeira mudança de corte ou de tratamento de `www.`.
- **"Texto que deriva do link", fechado**: `label_template` é texto livre com `$1`…`$9` referindo
  os grupos capturados pela `pattern`. Ex.: pattern
  `^https?://(?:www\.)?github\.com/([^/]+)/([^/]+)/(?:issues|pull)/(\d+)` com template `$1/$2#$3`
  produz `owner/repo#123` — exatamente o que o chip mostra hoje, agora como dado e não como código.
  Regras de borda, todas decididas aqui:
  - grupo referenciado que **não existe** ou não capturou → substituído por string vazia;
  - template **vazio** ou que resultou em string vazia/só espaços → cai no **host** da URL, nunca
    num chip sem texto;
  - `$$` escapa um `$` literal;
  - o rótulo é cortado em 60 caracteres com `…` (é um chip dentro de um card).
- **A regex é sempre testada com a flag `i` e sem `g`.** Sem `g` porque `lastIndex` em regex
  reaproveitada entre chamadas produz falha intermitente — o clássico bug de regex global guardada
  em variável. As flags não são configuráveis: uma caixinha de flags é superfície de erro para
  ganho nenhum neste caso.
- **Defesa contra regex ruim (ReDoS e sintaxe inválida)**: `pattern` limitado a 200 caracteres;
  compilação validada com `try/catch` na hora de salvar, com a mensagem do erro na tela; e, em tempo
  de execução, regra que não compila é **pulada** em vez de derrubar a lista de tarefas — o dado
  pode ter vindo de antes de uma validação mudar. O casamento roda sempre contra uma URL (string
  curta), o que limita bastante o estrago de um backtracking patológico, mas o limite de tamanho é a
  parte que não custa nada.
- **Casamento puro, em `src/domain/tasks/linkIconRules.ts`**, sem React e sem I/O:
  `matchLinkIconRule(url, rules)` devolvendo `{ rule, label } | null` e `resolveLinkAppearance(url,
  rules)` devolvendo sempre algo (com o fallback de host embutido). É o que torna a regra testável
  sem montar tela, e é onde toda a semântica acima vive.
- **`detectGitHubLink` continua existindo, mas o chip deixa de chamá-lo.** Ele é usado por testes e
  é a documentação viva do formato; apagá-lo junto seria arrastar mudança sem pedido. O que sai do
  `ExternalLinkChip` é o `if` de GitHub, substituído por `resolveLinkAppearance`.
- **Regras semente por botão, não por migration.** Com a lista vazia, a tela oferece "Criar regras
  padrão" (GitHub issue/PR, GitHub repositório, GitLab, Jira, Figma, Notion, YouTube, Google Docs),
  que insere as regras como se o usuário as tivesse digitado — editáveis e apagáveis. Escrever no
  banco do usuário por migration decidiria por ele algo que é preferência.
- **Onde a tela mora**: rota `/tasks/link-icons`, fora da sidebar (como `/tasks/tags`), alcançada
  por um botão "Configurar ícones" dentro da seção "Links externos" do formulário (085) e por um
  link no cabeçalho de `/tasks/tags`, que é a outra tela de configuração do módulo.
  **Fechado em 2026-09-18**: fica a rota própria. O `prompt:` falava em "aba", e a alternativa seria
  uma aba dentro de uma tela de configurações do módulo de tarefas — que não existe hoje, e criá-la
  é trabalho novo. A `/pipeline` apresentou as duas opções ao usuário com a rota como recomendada e
  seguiu com ela depois do minuto de timeout sem resposta. Motivo: é o padrão que `/tasks/tags` já
  estabeleceu, e trocar depois é mover um arquivo. Se o usuário preferir a aba, é um planning novo.
- **Carregamento das regras**: hook `useLinkIconRules()` com cache em memória no módulo (as regras
  mudam raramente e são lidas por toda lista de tarefas), invalidado ao salvar/excluir/reordenar na
  tela de configuração. Falha ao carregar → lista vazia, ou seja, todo link cai no fallback: a
  aparência piora, a tela não quebra.
- **Prévia ao vivo na tela de configuração**: um campo "URL de teste" mostra, para a regra sendo
  editada, se ela casa e qual rótulo sai. Sem isso, escrever regex às cegas e só descobrir o
  resultado voltando à lista de tarefas é o caminho garantido para o usuário desistir do recurso.
- **Fora de escopo**: aplicar as regras aos links do módulo Conteúdo (`/links`, `ContentLink`) —
  outro módulo, outro pedido; regra por projeto; e importar regras de terceiros.

## Tarefas

- [x] Criar `src/domain/tasks/linkIconRules.ts` com os tipos puros da regra
      (`LinkIconRuleShape`: `pattern`, `label_template`, `icon_key`, `icon_url`, `position`,
      `enabled`) e `compileLinkIconRule(rule)` devolvendo a `RegExp` (flag `i`, sem `g`) ou `null`
      quando não compila. Verificação: `npm run build`
- [x] No mesmo arquivo: `applyLabelTemplate(template, match, url)` — substitui `$1`…`$9`, trata
      `$$`, transforma grupo inexistente/não capturado em vazio, cai no host quando o resultado fica
      vazio e corta em 60 caracteres com `…`. Verificação: `npm run build`
- [x] No mesmo arquivo: `matchLinkIconRule(url, rules)` (ordena por `position`, pula `enabled:
      false` e as que não compilam, devolve a **primeira** que casa) e `resolveLinkAppearance(url,
      rules)` (o mesmo, **delegando o fallback a `describeExternalLink` da `085`** em vez de
      reimplementar host/corte). Exportar no `src/domain/tasks/index.ts`. Verificação:
      `npm run build`
- [x] Testar em `src/domain/tasks/__tests__/linkIconRules.test.ts` — casamento e ordem: a regra de
      `position` menor vence quando duas casam; reordenar inverte o vencedor; regra desabilitada é
      pulada mesmo casando; regra com regex inválida é pulada sem lançar; lista vazia devolve
      fallback. Verificação: `npm test src/domain/tasks`
- [x] Estender o teste — rótulo: template com `$1/$2#$3` reproduz `owner/repo#123` para uma URL de
      issue do GitHub; `$7` inexistente vira vazio; template vazio cai no host; template que resulta
      em só espaços cai no host; `$$` vira `$`; rótulo longo é cortado com `…`; URL que não parseia
      não quebra e usa a string crua. Verificação: `npm test src/domain/tasks`
- [x] Estender o teste — borda de entrada: URL vazia; URL sem protocolo; casamento é
      case-insensitive (`GitHub.com`); `pattern` sem âncora casando no meio da URL (comportamento
      esperado e documentado); `pattern` acima de 200 caracteres é rejeitado pela validação.
      Verificação: `npm test src/domain/tasks`
- [x] Escrever a migration `supabase/migrations/20260823120000_link_icon_rule.sql`: tabela,
      índice `(user_id, position)`, `comment on table`, RLS + 4 policies + `wipe_own_data`.
      Timestamp único — conferir `ls supabase/migrations/` antes. **Não rodar `supabase db push`.**
      Verificação: a validação em Postgres abaixo
- [x] Validar a migration em Postgres 16 descartável, criando `supabase/tests/link_icon_rule/`
      no molde de `supabase/tests/note_canvas/`: schema conforme, RLS barra leitura/alteração
      alheia, `wipe_own_data` apaga as regras do usuário, reaplicar é idempotente. Verificação:
      `bash supabase/tests/link_icon_rule/run.sh`
- [x] `src/types/tasks.ts`: `LinkIconRule` e `LinkIconRuleDraft`. Verificação: `npm run build`
- [x] `src/api/tasks/linkIconRules.ts`: `fetchLinkIconRules()`, `createLinkIconRule`,
      `updateLinkIconRule`, `deleteLinkIconRule` e `reorderLinkIconRules(ids)` — todas filtrando por
      `user_id`. Verificação: `npm run build`
- [x] `src/hooks/useLinkIconRules.ts`: carrega uma vez, guarda em cache de módulo, expõe
      `invalidate()`; erro de carregamento resolve para lista vazia (com `console.error`, sem
      toast — é caminho de leitura de fundo em toda lista de tarefas). Verificação: `npm run build`
- [x] `src/api/__tests__/linkIconRules.test.ts` (Supabase falso): as consultas filtram por
      `user_id` e ordenam por `position`; `reorderLinkIconRules` grava as posições em sequência; o
      cache do hook não refaz a busca na segunda montagem e refaz depois de `invalidate()`.
      Verificação: `npm test src/api`
- [x] Criar a página `src/pages/admin/tasks/LinkIconRules.tsx` com `PageShell` e a lista de regras
      (nome, ícone, `pattern` em fonte monoespaçada, rótulo de exemplo, interruptor de
      `enabled`, setas ↑/↓, editar, excluir), no molde de `Tags.tsx`. Verificação:
      `npm run build && npm run lint`
- [x] Registrar a rota `/tasks/link-icons` em `src/routes.tsx` (dentro do grupo `tasks`, `lazy`
      como as demais) — **sem** entrada na sidebar, como `/tasks/tags`. Verificação:
      `npm run build && npm run check:bundle`
- [x] `LinkIconRules.tsx`: diálogo de criar/editar regra — nome, `pattern`, `label_template`,
      escolha de ícone (presets de `TASK_ICON_PRESETS` + biblioteca da 086, reusando o grid do
      `TaskIconPicker` em vez de um seletor novo). Verificação: `npm run build && npm run lint`
- [x] `LinkIconRules.tsx`: validação ao salvar — nome obrigatório, `pattern` obrigatório, `pattern`
      até 200 caracteres, `pattern` que não compila mostra a mensagem do erro do `RegExp` no campo
      (`role="alert"`), e um ícone é obrigatório (senão a regra não faz nada visível). Verificação:
      `npm run build`
- [x] `LinkIconRules.tsx`: campo "URL de teste" com prévia ao vivo dentro do diálogo — casou ou não,
      e qual rótulo sai, usando `resolveLinkAppearance` (a mesma função que a lista de tarefas usa,
      nunca uma segunda implementação). Verificação: `npm run build`
- [x] `LinkIconRules.tsx`: estado vazio com `EmptyState` + botão "Criar regras padrão" (GitHub
      issue/PR, GitHub repositório, GitLab, Jira, Figma, Notion, YouTube, Google Docs), definidas
      numa constante no domínio e inseridas como regras normais. Verificação: `npm run build`
- [x] `LinkIconRules.tsx`: carregamento (`TableLoadingSkeleton`), erro de carregamento (toast +
      possibilidade de tentar de novo) e exclusão com `ConfirmDeleteDialog`. Verificação:
      `npm run build && npm run lint`
- [x] `TaskViews.tsx`: `ExternalLinkChip` passa a usar `resolveLinkAppearance` com as regras do hook
      — o ícone vem de `TaskIconBadge` (preset ou URL, que já resolve os dois) e o texto do template.
      O `if` de GitHub sai; `detectGitHubLink` permanece no domínio. Verificação:
      `npm run build && npm run lint`
- [x] Botão "Configurar ícones" na seção "Links externos" do formulário (feature 085), levando a
      `/tasks/link-icons`, e link para a mesma tela no cabeçalho de `/tasks/tags`. Verificação:
      `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/LinkIconRules.test.tsx`: a lista mostra as regras na ordem de
      `position`; criar uma regra válida chama a API com o `pattern` e o template digitados;
      `pattern` inválido não chama a API e mostra o erro; a prévia da URL de teste mostra o rótulo
      certo; as setas reordenam e chamam `reorderLinkIconRules`; excluir pede confirmação; o botão
      de regras padrão insere a lista semente. Verificação: `npm test src/pages/admin/tasks`
- [x] Teste do chip com regras (`TaskViews`/`ExternalLinkChip`): com a regra do GitHub, um link de
      issue sai com o ícone e o texto `owner/repo#123`; sem regra nenhuma, sai o ícone genérico e o
      host; com duas regras que casam, vence a de `position` menor; regra com regex inválida no
      banco não quebra a renderização da lista. Verificação: `npm test src/pages/admin/tasks`
- [x] `TaskExternalLinksField.tsx` (085): a prévia por linha passa a usar `resolveLinkAppearance`
      com as regras do hook. Ela se anuncia como "Assim aparece no card" e, depois desta feature, o
      card passou a ser decorado por regra — deixá-la em `describeExternalLink` faria a prévia
      mentir exatamente quando a regra é nova. Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada aqui e o tamanho do chunk da rota nova anotado.
      **2026-08-23**: build OK; lint 0 erros (83 warnings pré-existentes de `react-refresh`);
      `npm test` **230 arquivos / 2558 testes** (baseline antes da feature: 226 / 2471 — os 87 novos
      são 32 em `domain/tasks/linkIconRules`, 16 em `api/linkIconRules` (API + cache do hook), 28 em
      `LinkIconRules.test.tsx`, 11 em `ExternalLinkChip.rules.test.tsx`); `check:bundle` OK, com a
      rota nova em **4,7 KB gzip** de 160 KB de teto (`LinkIconRules-*.js`).
      Único vermelho na rodada cheia: `notaSemSintaxe.test.tsx` estourando o `testTimeout` de 5s —
      intermitência conhecida e pré-existente sob carga; passa isolado (2,1s).
- [x] **Migration aplicada e regras em uso no remoto (2026-09-20).** A
      `20260823120000_link_icon_rule.sql` **está no banco remoto** (`supabase migration list
      --linked`: `local=remote=20260823120000`; zero migrations pendentes no projeto).
      Conferido por esta sessão via `supabase db query` (só `select`):
      - `link_icon_rule` tem **8 linhas**, e são exatamente o conjunto padrão, na ordem de
        `position`: GitHub issue/PR, GitHub repositório, GitLab, Jira (`atlassian.net/browse/`),
        Figma, Notion, YouTube e Google Docs. Ou seja, o usuário **já passou por `/tasks/link-icons`
        e criou as regras padrão** — a segunda perna desta tarefa está cumprida.
      - As regras **casam com dado real**. Rodando cada `pattern` contra os links de verdade em
        `task_external_link` com o operador `~` do Postgres: os **5 links do GitHub** (PRs em
        `AltaGrowth/allta` e `NinjaLovers/placai`) resolvem para `icon_key = github` pela regra de
        menor `position`; os **2 links do Temu** não casam com regra nenhuma e caem no fallback
        `describeExternalLink` da 085, como desenhado.
      Resta só o "olhar o chip na tela", que é confirmação visual do usuário — o motor de regras
      está provado contra o dado de produção.

## Prompts
- 2026-08-23 — "- deve ser possível adicionar n links externos a uma tarefa, cada um com seu comentário, e todos com a gestão de ícones+preview"
  (o grosso deste pedido virou tarefas na `085`; aqui ele só fixou que o fallback de aparência é o
  `describeExternalLink` da `085`, e não uma segunda implementação)

## Notas

- 2026-08-23 — `TaskIconBadge` ganhou um segundo catálogo, `LINK_ICON_PRESETS` (GitHub, GitLab,
  Figma, YouTube, quadro/Jira, Notion, documento, site, link genérico), em vez de esses ícones
  entrarem em `TASK_ICON_PRESETS`. O catálogo de tarefa é o popover de **toda linha** da Lista, do
  Kanban e do Gantt; engordá-lo com nove marcas para servir a uma tela de configuração seria pagar
  em todo lugar por um ganho num lugar só. `TaskIconBadge` resolve os dois catálogos (o desenho é o
  mesmo, venha de onde vier) e `TaskIconPicker` ganhou a prop `presets` — o seletor continua sendo
  **o mesmo componente**, com a biblioteca da 086 e o "colar SVG" de graça, como a decisão pedia.
  Isso é também o que faz `iconKey: "github" | "external"` de `describeExternalLink` continuar
  desenhável pelo chip depois da troca.
- 2026-08-23 — `externalLink.ts` (085) passou a exportar `externalLinkHostLabel` e
  `truncateExternalLinkLabel`, que eram privadas. É o mesmo motivo da decisão de delegar o fallback:
  o rótulo gerado por regra cai no host quando o template resulta vazio e é cortado pela mesma
  régua — reimplementar qualquer um dos dois criaria a segunda versão que a decisão proíbe.
- 2026-08-23 — efeito colateral conhecido e inofensivo na suíte: todo teste que renderiza cards de
  tarefa e mocka `@/api/tasks` (o índice) passa a imprimir
  `Não foi possível carregar as regras de ícone de link. AuthRequiredError` no stderr. O hook
  importa de `@/api/tasks/linkIconRules` (o módulo), que esses arquivos não mockam, então a busca
  real roda, falha na autenticação e **degrada para lista vazia** — que é exatamente o caminho que a
  decisão previu. Nenhum teste quebra por isso; quem precisar das regras num teste deve mockar
  `@/api/tasks/linkIconRules`, como faz `ExternalLinkChip.rules.test.tsx`.
- 2026-08-23 — desvio próprio (não pedido do usuário): a prévia por linha do formulário da 085
  ficou apontando para `describeExternalLink` enquanto o card passou a ser decorado por regra. Como
  ela se anuncia como "Assim aparece no card", isso é a prévia mentindo; virou tarefa no fim da
  lista em vez de ficar como dívida silenciosa.

## Checagem de satisfação (2026-08-23)

Feita com a lista de tarefas zerada **menos** a última, que está bloqueada no usuário
(`supabase db push`). Por isso o arquivo continua em `in-progress/`: o código está pronto e provado,
o banco remoto não foi tocado. Cada item do `prompt:` com o artefato que o comprova (todos testes
que passaram, nenhum navegador envolvido):

| Pedido (verbatim) | Artefato |
| --- | --- |
| "coloque uma seção para que eu configure os ícones pre-configurados" | rota `/tasks/link-icons` registrada e montando a tela — `LinkIconRules.test.tsx` › "resolve para uma rota registrada dentro do grupo `tasks`" e "o elemento casado monta a tela de regras"; fora da sidebar, como `/tasks/tags` — "não entra na sidebar" |
| "esse regex" | a `pattern` é dado do usuário, validada e persistida — `LinkIconRules.test.tsx` › "criar uma regra manda o pattern e o template digitados"; `api/linkIconRules.test.ts` › "cria a regra com o user_id do dono" |
| "links do github vão aparecer com o ícone do github" | `ExternalLinkChip.rules.test.tsx` › "com a regra do GitHub, a issue sai com o texto derivado do link" e "o ícone da regra pode vir da biblioteca do usuário, como `<img>`"; a semente pronta em `LinkIconRules.test.tsx` › "as sementes casam o que prometem, e a específica do GitHub vence a genérica" |
| "e com o texto que deriva do link" | `domain/tasks/linkIconRules.test.ts` › bloco "applyLabelTemplate — bordas do rótulo" (7 casos: `$1/$2#$3` → `owner/repo#123`, grupo inexistente, grupo opcional, template vazio, só espaços, `$$`, corte em 60) |
| "o ícone precisa ser uma aba que será configurada" | o ícone da regra sai do mesmo seletor da tarefa (presets + biblioteca da 086 + colar SVG), com catálogo próprio — `LinkIconRules.test.tsx` › "criar uma regra..." escolhe o preset Figma pelo popover; `TaskIconPicker.test.tsx` (38 testes) segue verde com a prop `presets` nova |
| "a aba de links externos, precisa ser melhorada" | a prévia do formulário passou a mostrar o mesmo que o card — `ExternalLinkChip.rules.test.tsx` › "prévia do formulário (085) com as regras da 087"; e o botão "Configurar ícones", que a 085 deixou desabilitado, agora leva à tela — `TaskExternalLinksField.test.tsx` › "o botão de configurar ícones leva à tela de regras, em outra aba" |
| `## Prompts` 2026-08-23 — "todos com a gestão de ícones+preview" (parte que coube aqui: o fallback é o `describeExternalLink` da 085, não uma segunda implementação) | `domain/tasks/linkIconRules.test.ts` › "lista vazia devolve o fallback de `describeExternalLink`" compara com a própria função; `externalLink.test.ts` (25 testes) segue verde depois de as duas ajudantes virarem exportadas |

Defesa contra regex ruim (entrada perigosa, tratada como caso de primeira classe):
regra que não compila é **pulada** em render (`ExternalLinkChip.rules.test.tsx` › "regra com regex
inválida no banco não quebra a renderização da lista"), barrada ao salvar com a mensagem do
`RegExp` (`LinkIconRules.test.tsx` › "regex que não compila não chama a API..."), barrada na API
(`api/linkIconRules.test.ts` › "regex que não compila não chega ao banco") e barrada no banco
(`supabase/tests/link_icon_rule/03_assert_behavior.sql` › teto de 200 caracteres e pattern vazia).

Migration validada sem tocar o banco remoto: `bash supabase/tests/link_icon_rule/run.sh` →
`OK: 20260823120000_link_icon_rule.sql validada em Postgres 16.` (controle negativo, schema,
reaplicação idempotente, degradação deliberada do `wipe_own_data` reparada pela reaplicação, e
comportamento: constraint, ordem/`position`, desligar sem perder, ícone sem FK, RLS, cascade, wipe).

**Reconferida em 2026-09-18** (rodada nova, depois das features 098/099/100 terem entrado no repo):
todos os comandos da seção `## Como testar` abaixo rodados de novo, todos verdes — suíte inteira
**263 arquivos / 2899 testes**, `build` OK, `lint` 0 erros / 88 warnings pré-existentes de
`react-refresh`, `check:bundle` OK com `LinkIconRules-*.js` em **4,2 KB gzip** de 160 KB, e
`run.sh` da migration OK em Postgres 16. Nada regrediu; a última tarefa segue bloqueada no usuário.

## Como testar

### 1. Pré-requisitos

- **A migration precisa estar aplicada**: `supabase/migrations/20260823120000_link_icon_rule.sql`
  cria `public.link_icon_rule`. Ela **ainda não foi ao banco remoto** (é a última tarefa, bloqueada
  em confirmação do usuário). Enquanto não for, a tela `/tasks/link-icons` abre no estado de erro
  ("Não foi possível carregar as regras.") e qualquer gravação falha — isso é ambiente, não defeito.
- A feature **085** (links externos por tarefa, `public.task_external_link`) também precisa estar
  aplicada, senão não há chip nenhum para decorar.
- **Docker** rodando, para a validação da migration em Postgres descartável.
- `npm install` feito; `npm run dev` no ar; logado com a sua conta (as regras são por `user_id`).
- Ter pelo menos uma tarefa com link externo: `/tasks` → **Nova tarefa** → seção **Links externos** →
  **Adicionar link** → `https://github.com/facebook/react/issues/123` → salvar.

### 2. Verificação automatizada

Um comando por linha; todos devem terminar sem nenhum `✗`/`FAIL`.

```
npx vitest run src/domain/tasks/__tests__/linkIconRules.test.ts
```
→ **32 testes**. Passou = o casamento por `position`, o "primeira que casa vence", a regra
desabilitada pulada, a regex inválida pulada sem lançar, e todas as bordas do rótulo
(`$1/$2#$3` → `owner/repo#123`, grupo inexistente, template vazio, `$$`, corte em 60) estão certos.

```
npx vitest run src/api/__tests__/linkIconRules.test.ts
```
→ **16 testes**. Passou = toda consulta filtra por `user_id`, a listagem ordena por `position`,
`reorderLinkIconRules` grava as posições em sequência, regex que não compila não chega ao banco, e o
cache de `useLinkIconRules` não refaz a busca na 2ª montagem mas refaz depois de `invalidate()`.

```
npx vitest run src/pages/admin/tasks/__tests__/LinkIconRules.test.tsx
```
→ **28 testes**. Passou = a rota `/tasks/link-icons` está registrada dentro do grupo `tasks` e
**não** entra na sidebar; a lista aparece na ordem de `position`; criar manda o `pattern` e o
template digitados; `pattern` inválido não chama a API e mostra o erro do `RegExp`; a prévia da URL
de teste mostra o rótulo certo; as setas chamam `reorderLinkIconRules`; excluir pede confirmação; e
o botão de regras padrão insere as 8 sementes (com a do GitHub específica vencendo a genérica).

```
npx vitest run src/pages/admin/tasks/__tests__/ExternalLinkChip.rules.test.tsx
```
→ **11 testes**. Passou = o chip do card usa as regras: issue do GitHub sai como `owner/repo#123`,
ícone da biblioteca do usuário sai como `<img>`, sem regra volta ao fallback de host, entre duas que
casam vence a de `position` menor, regra desabilitada não decora, regex inválida no banco não quebra
a lista, e falha ao carregar as regras degrada para o fallback.

```
npx vitest run src/pages/admin/tasks/__tests__/TaskExternalLinksField.test.tsx
```
→ **18 testes**. Passou = a prévia por linha do formulário mostra o **mesmo** rótulo que o card, e o
botão "Configurar ícones" leva a `/tasks/link-icons` em outra aba.

```
bash supabase/tests/link_icon_rule/run.sh
```
→ imprime `OK: 20260823120000_link_icon_rule.sql validada em Postgres 16.` (leva ~40 s: sobe um
Postgres 16 em Docker). Passou = schema/constraint/índice/FK conferem, a migration é idempotente ao
reaplicar, `wipe_own_data` passou a cobrir `link_icon_rule` sem perder as tabelas antigas, e a RLS
barra leitura/insert/update/delete de regra alheia. **Não toca o banco remoto.**

```
npm run build && npm run lint && npm test && npm run check:bundle
```
→ build OK; lint **0 erros** (88 warnings de `react-refresh` são pré-existentes do repo, não desta
feature); `npm test` **263 arquivos / 2899 testes** verdes; `check:bundle` termina com
`Bundle budget OK.` e lista `LinkIconRules-*.js` em ~4,2 KB de 160 KB de teto.

### 3. Verificação manual, passo a passo

1. Abra `/tasks/tags`. No cabeçalho há o link **"Ícones de link"** — clique. Esperado: vai para
   `/tasks/link-icons`, título **"Ícones de link"** e a explicação "A primeira regra que casa
   vence…". **A tela não está na sidebar** (é configuração do módulo, como `/tasks/tags`) — confira
   que a barra lateral não ganhou item novo.
2. Com a lista vazia, aparece o estado **"Nenhuma regra ainda"** com o botão **"Criar regras
   padrão"**. Clique. Esperado: 8 regras nascem na ordem `GitHub issue/PR`, `GitHub repositório`,
   `GitLab`, `Jira`, `Figma`, `Notion`, `YouTube`, `Google Docs` — nessa ordem, cada linha com
   ícone, o `pattern` em fonte monoespaçada e a linha "Rótulo: …".
3. Vá para `/tasks` e olhe a tarefa com o link do passo de pré-requisito. Esperado: o chip que antes
   dizia só "Link externo"/host agora mostra o **ícone do GitHub** e o texto **`facebook/react#123`**.
4. Volte a `/tasks/link-icons` e clique em **Nova regra**. Preencha Nome = `Meu Jira`, Expressão
   regular = `minhaempresa\.atlassian\.net/browse/([A-Z]+-\d+)`, Texto do rótulo = `$1`, e escolha
   um ícone pelo botão **"Escolher ícone da regra"** (o mesmo seletor da tarefa: presets, biblioteca
   da 086, enviar imagem, colar SVG). Em **URL de teste** cole
   `https://minhaempresa.atlassian.net/browse/ABC-42`. Esperado: a caixa de prévia diz **"A regra
   casou:"** e mostra o ícone escolhido com o texto **`ABC-42`**. Clique em **Criar regra**.
5. Na lista, use as setas **↑/↓** para subir `GitHub repositório` acima de `GitHub issue/PR`. Volte
   a `/tasks` e recarregue. Esperado: o mesmo link de issue agora mostra **`facebook/react`** (a
   genérica passou a vencer). Desfaça a ordem e confirme que volta a `facebook/react#123`.
6. Clique no interruptor da regra `GitHub issue/PR` para **desativar**. Esperado: a linha continua na
   lista com o rótulo "desativada" ao lado do nome; em `/tasks`, o chip cai para a regra seguinte que
   casar (ou para o host). Reative e confirme que volta.
7. Abra uma tarefa em edição, na seção **Links externos**. Esperado: a prévia de cada linha ("Assim
   aparece no card") mostra **exatamente** o mesmo ícone e texto do chip do card. O botão
   **"Configurar ícones"** abre `/tasks/link-icons` **em outra aba** (de propósito: navegar por cima
   descartaria o formulário não salvo).

### 4. Casos de borda e caminhos negativos

- **Regex que não compila**: no diálogo, digite `([a-z` em Expressão regular e saia do campo.
  Esperado: mensagem vermelha com o texto do próprio `RegExp` (`Invalid regular expression: …`)
  abaixo do campo; **Criar regra** não grava nada.
- **Pattern longa demais**: cole uma expressão com mais de **200 caracteres**. Esperado: "A expressão
  deve ter no máximo 200 caracteres." e nada é gravado (a mesma trava existe na API e no banco —
  `link_icon_rule_pattern_check`).
- **Sem ícone**: preencha nome e pattern mas não escolha ícone. Esperado: erro no campo Ícone; sem
  ícone a regra não faria nada visível.
- **Nome vazio / pattern vazia**: erro no campo correspondente, sem chamada à API.
- **Template que não resolve**: use `$7` numa regex com 2 grupos. Esperado: o `$7` vira **vazio**
  (não o literal `$7`); se sobrar só espaço, o rótulo cai no **host** da URL — nunca um chip sem
  texto. `$$` escreve um `$` literal.
- **URL de teste que não casa**: a prévia diz **"A regra não casou. Sem ela, o link aparece assim:"**
  seguido do ícone genérico e do host.
- **Nenhuma regra** (todas apagadas): todo link volta ao comportamento de antes da feature — ícone
  `ExternalLink` e o **host** (`github.com`, `docs.google.com`); URL que nem parseia mostra a string
  cortada. A lista de tarefas continua funcionando normalmente.
- **Excluir**: o botão de lixeira pede confirmação ("Excluir esta regra?"). Cancelar não apaga.
  Confirmar apaga só a regra — **os links das tarefas continuam lá**, só voltam ao ícone genérico.
- **Escopo por usuário**: as regras são por `user_id` com RLS nas 4 operações; outra conta não vê nem
  altera as suas (provado em `03_assert_behavior.sql`). Apagar a conta / `wipe_own_data` leva as
  regras junto.

### 5. Sinais de que quebrou

- Tela `/tasks/link-icons` no estado de erro "Não foi possível carregar as regras." com botão
  **"Tentar de novo"** → quase sempre a **migration não aplicada** (tabela inexistente), não um bug
  de código.
- Chips de link sumindo ou lista de tarefas em branco após criar uma regra → uma regex ruim estaria
  derrubando o render; o comportamento correto é a regra ser **pulada** em silêncio.
- Chip mostrando o literal `$1/$2#$3` em vez de `owner/repo#123` → o template não está sendo
  aplicado (`applyLabelTemplate` não foi chamado).
- Prévia do formulário divergindo do chip do card → alguém voltou a prévia para
  `describeExternalLink` em vez de `resolveLinkAppearance`.
- Reordenar não mudar quem vence depois de recarregar → `reorderLinkIconRules` não gravou, ou a
  listagem perdeu o `order("position")`.
- No console: `Não foi possível carregar as regras de ícone de link. AuthRequiredError` **durante os
  testes** é ruído conhecido e inofensivo (ver `## Notas`), não uma falha.
