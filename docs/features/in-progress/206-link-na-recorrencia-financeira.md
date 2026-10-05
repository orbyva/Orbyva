---
prompt: |-
  permitir adicionar um link em uma recorrência, que aí eu consigo por exemplo colocar o link de onde
  se faz o pagamento

  Escopo: a fatia vertical inteira de "link na recorrência" — coluna no banco, contrato (tipo, select,
  payload), domínio, campo no formulário, âncora clicável na lista (desktop e mobile) e leitura pela
  Orb. Uma feature só; o pedido é um.

  - **Uma** URL livre por recorrência, opcional, numa coluna `link_url text` nullable de
    `public.recurring_transaction` — não tabela filha: o pedido é singular e
    `trip_itinerary_activity.link_url` é a convenção do projeto para "um link na linha".
  - Nome `link_url` e rótulo "Link" genéricos: "por exemplo o link de onde se faz o pagamento" diz que
    pagamento é um uso do campo, não o campo.
  - Se um dia virar N links com comentário, o caminho é o padrão da 085 (`task_external_link`), não
    `jsonb` — fica registrado para não re-decidir.
  - Migration única `20261005120000_recurring_transaction_link_url.sql`, timestamp nunca repetido
    (timestamp duplicado já quebrou o bookkeeping do CLI). `supabase db push` aplica no banco
    **remoto** — não há Supabase local neste projeto — e só roda com confirmação explícita do
    usuário.
  - Nenhuma política de RLS nova, nenhum índice, `wipe_own_data` intacto: RLS do Postgres é por
    **linha** e as 4 políticas de `recurring_transaction` (`user_id = auth.uid()`) já cobrem coluna
    nova; a tabela já está na lista do wipe — isto é coluna, não tabela.
  - `Recurring.link_url` **opcional** no tipo (há selects que seguem sem a coluna:
    `supabase/functions/home-bundle/index.ts:9`, `supabase/functions/_shared/orb/tools/timeline.ts:181`);
    `RecurringCreateRequest.link_url` **obrigatório**, porque `updateRecurringApi` monta payload por
    lista branca e campo opcional tornaria "apagou o link" indistinguível de "não mandou".
  - `normalizeRecurringLink`, `isHttpLink` e a constante `RECURRING_LINK_HINT` em
    `src/domain/recurring/links.ts`, puros e sem React — é o que o Vitest testa direto.
  - Campo "Link" no `RecurringFormDialog`, depois de "Descrição", validado **no submit** por
    `setFormError` com a frase já usada no app ("Comece com https://"); o payload grava sempre
    normalizado, nos dois ramos (`isSplit` e fixo).
  - Âncora com ícone `ExternalLink` na célula de **Descrição** da lista, nas duas versões (tabela
    desktop e cartões mobile), em **nova aba** — é o "eu consigo" do pedido: abrir o link sem entrar
    na edição. A busca da lista **não** passa a casar o link.
  - `query_recurring` passa a devolver `link_url` e a coluna entra no schema da Orb **fora** de
    `defaultColumns`; `description`/`inputSchema` das tools ficam intactos (contrato de ordem/prefixo
    do catálogo serializado, `docs/stack.md`). `propose_create` kind `recurring` **não** ganha entrada
    de link: a Orb lê o link, não grava.
  - Chrome/automação de navegador fora da implementação e da verificação: a prova é Vitest de domínio,
    Vitest de API com Supabase falso, Vitest de componente com assert na saída real, Vitest da Orb com
    `fakeDb`, `npm run build`, `npm run check:mcp` e uma chamada real ao PostgREST conferindo o status.
---

# 206 — Link na recorrência financeira

## Contexto
Sem dependências.

Recorrência não tem onde guardar "onde se paga isso": hoje o link vira parte da descrição ou é
procurado de novo todo mês. Esta feature abre a coluna `link_url`, faz o campo atravessar tipo, API e
os cinco construtores de `RecurringCreateRequest`, põe o campo no formulário, a âncora clicável na
lista (desktop e mobile) e o campo na leitura da Orb.

O arquivo `supabase/migrations/20261005120000_recurring_transaction_link_url.sql` **já existe no
disco** — foi escrito antes de o implementador ser interrompido. O conteúdo foi conferido e está
correto e completo (`add column if not exists link_url text` + `comment on column`, sem RLS, sem
índice, sem `wipe_own_data`): a primeira tarefa é só conferir, não reescrever. O `supabase db push`
continua pendente de confirmação do usuário.

## Decisões

### Banco e contrato
- Uma coluna `link_url text` nullable em `public.recurring_transaction`, não tabela filha: o pedido é
  singular e `trip_itinerary_activity.link_url`
  (`supabase/migrations/20260804120000_improve_md_features.sql:10`) é a convenção do projeto para "um
  link na linha".
- Nome `link_url` genérico — pagamento é um uso do campo, não o campo.
- Se um dia virar N links com comentário, o caminho é o padrão da 085 (`task_external_link`), não
  `jsonb`. Registrado para não re-decidir.
- Migration única, `20261005120000_recurring_transaction_link_url.sql`: timestamp livre (o último
  arquivo antes dela é `20261002110000`) e nunca repetido. O arquivo já está escrito no disco.
- `supabase db push` só com confirmação explícita do usuário: aplica no banco remoto.
- Nenhuma política de RLS nova, nenhum índice, `wipe_own_data` intacto.
- `Recurring.link_url` opcional no tipo (selects que seguem sem a coluna em `home-bundle/index.ts:9` e
  `_shared/orb/tools/timeline.ts:181`); `RecurringCreateRequest.link_url` obrigatório (a lista branca
  de `updateRecurringApi` precisa distinguir "apagou" de "não mandou").
- `normalizeRecurringLink`/`isHttpLink` em `src/domain/recurring/links.ts`, puros e sem React.
- Paridade com o app Expo em `mobile/` fora desta rodada: o Expo duplica types/api/UI de recorrência e
  o projeto resolve isso em feature própria ("… no mobile", 193–200).
- Chrome fora da implementação e da verificação.

### Formulário
- Campo depois de "Descrição", dentro da `FormSection "Classificação"` de
  `src/pages/admin/finance/components/RecurringFormDialog.tsx:293-321`: é o bloco de identificação da
  recorrência, onde o link pertence.
- `FormField label="Link" optional` + `Input placeholder="https://…"`, espelhando
  `src/pages/admin/travel/components/TripEditActivityDialog.tsx:465-480`.
- Validação bloqueante no submit, dentro de `handleCreate`, via `setFormError` — e não aviso no blur
  como em `TaskExternalLinksField`: neste formulário todo campo inválido para o submit, e o erro
  aparece no `errorSummary` do `FormDialogShell` (`role="alert"`).
- Mensagem "Comece com https://", a mesma frase de
  `src/pages/admin/tasks/TaskExternalLinksField.tsx:14`, mas **sem importar daquele módulo**:
  `TaskExternalLinksField` arrasta `resolveLinkAppearance`, `useLinkIconRules` e `TaskIconBadge`
  (regras de ícone da 087) para Finanças por uma string. A constante `RECURRING_LINK_HINT` vai para
  `src/domain/recurring/links.ts`, ao lado de `normalizeRecurringLink`, e o teste assere a mesma
  frase. *(Decisão tomada no ataque, não no planning — o planning só fixava a frase.)*
- O link vai normalizado nos dois ramos do payload de `handleCreate` (`isSplit` e fixo). O ramo fixo
  passa por `applyFixedYearFields`, que faz spread do `rec` — então a normalização tem que ser
  aplicada ao objeto, não depender do spread.
- `FormField` recebe `htmlFor` e o `Input` o `id` correspondente, para o label ficar associado ao
  campo e o teste poder achá-lo por `getByLabelText(/Link/)`. *(Decisão tomada no ataque: `FormField`
  não associa label e controle sozinho — `src/components/FormField.tsx:28`.)*
- Sem máscara, sem `type="url"` e sem auto-prefixo `https://`: o projeto valida protocolo com
  mensagem, não corrige a URL do usuário.
- O mesmo dialog serve criar e editar (`Recurring.tsx`) e é embutido em `TaskRecurrenceRules.tsx` — o
  campo aparece nos três sem mudança de contrato.

### Lista
- Âncora na célula de **Descrição** (`src/pages/admin/finance/components/RecurringTable.tsx:325-338`),
  ao lado do nome, não na coluna "Ações" (`:290`, `w-[148px]` com 5 botões: renovar, editar,
  arquivar/restaurar, excluir e pagar).
- Mesma âncora na linha do nome da versão mobile
  (`src/pages/admin/finance/components/RecurringTableMobile.tsx:98-121`).
- Ícone `ExternalLink` genérico (`lucide-react`) + `title="Abrir link"` + `aria-label` citando a
  descrição, espelhando `src/pages/admin/travel/components/TripItineraryTab.tsx:1047-1058`. Sem
  `resolveLinkAppearance`, sem `useLinkIconRules`, sem `TaskIconBadge` — as regras de ícone da 087
  ficam para outra rodada.
- `target="_blank"` + `rel="noreferrer"`: abre em nova aba, como o roteiro de viagem.
- Condição de renderização é `item.link_url?.trim()`, não só `item.link_url`: linha legada com
  `"   "` não vira ícone quebrado.
- Sem `e.stopPropagation()` no `onClick` da âncora: a `TableRow` da recorrência não tem handler de
  clique (o expandir é um botão próprio, `RecurringTable.tsx:541`), ao contrário da linha do roteiro
  de viagem. *(Decisão tomada no ataque, conferindo o componente.)*
- `filterRecurringBySearch` (`src/domain/recurring/listView.ts:87-99`) **não** passa a casar o link:
  busca é por descrição/categoria.
- Home/`home-bundle` e `RecurringDueAlerts` ficam fora: o widget do Home e o painel de vencimentos são
  resumos agrupados, sem linha por recorrência onde a âncora caberia.
- `RecurringTableMobile.tsx` é a versão responsiva **web**, não o Expo.

### Orb
- `query_recurring` devolve `link_url` (`supabase/functions/_shared/orb/tools/finance.ts:279-330`),
  porque é o que responde "onde eu pago a luz?".
- A coluna entra na lista `columns` de `recurring_transaction` em
  `supabase/functions/_shared/orb/schema.ts:159-172`, **fora** de `defaultColumns` (`:158`) — a lista
  padrão de `query_data` não cresce.
- `description` e `inputSchema` de `query_recurring` ficam intactos: o catálogo serializado é contrato
  de ordem/prefixo com o Gemini (`docs/stack.md`), e mudar texto de tool invalida cache de prefixo.
- `propose_create` kind `recurring` não ganha entrada de link: propriedade nova no `inputSchema`
  cresce o catálogo serializado. `orbActions.ts` grava `link_url: null` e a escrita do link pela Orb
  fica fora desta rodada.
- `supabase/functions/_shared/orb/tools/timeline.ts:181` **não** muda: a linha do tempo não tem onde
  mostrar link e o select de lá é outro.
- `src/domain/orb/results.ts:276-300` (cartões do chat da Orb) **não** muda nesta rodada: o cartão de
  recorrência já leva para `/finance/recurring`, onde a âncora está. *(Decisão tomada no ataque — o
  planning não citava `results.ts`; registrado aqui para não parecer esquecimento.)*
- Nenhuma Edge Function é redeployada por esta feature por conta própria: `_shared/orb` é consumido
  pelo `orb-agent` e pelo servidor MCP (`mcp/orbMcpServer.ts`, mesmo registro). Deploy da função, se o
  usuário quiser, é pedido dele.

## Tarefas

### Banco
- [x] Conferir que `20261005120000` é único: `ls supabase/migrations/ | grep 20261005` só deve mostrar
      `20261005120000_recurring_transaction_link_url.sql`. **O arquivo já existe no disco** (escrito
      antes de o implementador ser interrompido) com
      `alter table public.recurring_transaction add column if not exists link_url text;` e o
      `comment on column` dizendo que é a URL livre da recorrência (ex.: onde se faz o pagamento), sem
      política de RLS, sem índice e sem `wipe_own_data` — conteúdo conferido, correto e completo.
      Nada a escrever aqui; se aparecer outro arquivo com esse timestamp, escolher o próximo livre e
      anotar em `## Notas`.
- [ ] **Aguarda o usuário** — pedir confirmação explícita antes de `supabase db push`
      (`npx supabase db push`), porque aplica no banco **remoto**. Avisar no pedido que
      `20261002110000_email_prefs_rpc.sql` estava **local-only** em 2026-10-05
      (`npx supabase migration list` mostrava `"remote":""` nela), então o push levaria as duas
      migrations juntas. Não rodar sem o "pode".

### Tipos, API e domínio
- [x] `src/types/recurring.ts:13-28` — `Recurring` ganha `link_url?: string | null`.
- [x] `src/types/recurring.ts:41-51` — `RecurringCreateRequest` ganha `link_url: string | null`
      (obrigatório, não opcional).
- [x] `src/api/recurring.ts:18-19` — `RECURRING_SELECT` passa a listar `link_url`.
- [x] `src/api/recurring.ts:69-79` — a lista branca do `payload` de `updateRecurringApi` ganha
      `link_url: data.link_url`. `createRecurringApi` (`:50-62`) já faz spread do request: conferir que
      não precisa de mudança.
- [x] Criar `src/domain/recurring/links.ts` com `normalizeRecurringLink(raw: string | null | undefined): string | null`
      (trim; string vazia e `undefined`/`null` → `null`) e `isHttpLink(raw: string): boolean`
      (true só para `http://`/`https://`). Puro, sem React e sem import de componente.
- [x] `src/domain/recurring/links.ts` — acrescentar a constante exportada
      `RECURRING_LINK_HINT = "Comece com https://"` (mesma frase de
      `src/pages/admin/tasks/TaskExternalLinksField.tsx:14`), sem importar daquele módulo.
- [x] `src/domain/recurring/index.ts` — exportar `./links` junto dos outros módulos do domínio.
- [x] `src/pages/admin/finance/Recurring.tsx:66-80` (`defaultRecurringCreateRequest`) — `link_url: null`.
- [x] `src/pages/admin/finance/Recurring.tsx:303-318` (`handleEdit`) — `link_url: recurringItem.link_url ?? null`,
      para a edição carregar o link que já existe.
- [x] `src/pages/admin/tasks/TaskRecurrenceRules.tsx:48-62` (`defaultRecurringCreateRequest`) —
      `link_url: null`.
- [x] `src/api/orbActions.ts:267-277` (`createRecurringApi` do kind `recurring`) — `link_url: null`.
      Não tocar no `inputSchema` de `propose_create`.
- [x] `src/pages/admin/goals/Goals.tsx:694-704` — **5º construtor, que o planning não listou**: o
      literal passado para `createRecurringApi` na rotina de poupança também precisa de
      `link_url: null`, senão `tsc -b` quebra. Registrar o achado em `## Notas`.
- [x] Criar `src/domain/recurring/__tests__/links.test.ts` (projeto `node` do Vitest, `.test.ts`):
      `normalizeRecurringLink` faz trim, devolve `null` para `""`, `"   "`, `null` e `undefined`, e
      preserva a URL íntegra no caso bom; `isHttpLink` aceita `http://`/`https://` e recusa
      `"nubank.com.br"`, `"ftp://x"` e string vazia.
- [x] Criar `src/api/__tests__/recurring.link-url.test.ts` com Supabase falso no padrão de
      `src/api/__tests__/tasks.recurring-materialization.test.ts` (`vi.hoisted` + `vi.mock("@/lib/supabase")`
      + `vi.mock("@/lib/auth-user")`), guardando o que chegou em `update`/`insert`. Asserções:
      `updateRecurringApi` manda `link_url` no payload; manda `link_url: null` quando o campo foi
      apagado; `createRecurringApi` leva `link_url` na linha do `insert`; e `RECURRING_SELECT` contém
      `link_url` (prova que a leitura traz a coluna).
- [x] Rodar `npx vitest run src/domain/recurring/__tests__/links.test.ts src/api/__tests__/recurring.link-url.test.ts`.

### Formulário
- [x] `src/pages/admin/finance/components/RecurringFormDialog.tsx` — importar
      `normalizeRecurringLink`, `isHttpLink` e `RECURRING_LINK_HINT` de `@/domain/recurring`.
- [x] `RecurringFormDialog.tsx:308-320` — depois do `FormField label="Descrição"`, acrescentar
      `FormField label="Link" optional htmlFor="recurring-link-url"` com
      `Input id="recurring-link-url" type="text" placeholder="https://…"`, `value={newRecurring.link_url ?? ""}`
      e `onChange` fazendo `setNewRecurring({ ...newRecurring, link_url: e.target.value })` (valor cru
      enquanto digita; a normalização é no submit).
- [x] `RecurringFormDialog.tsx:188-222` (`handleCreate`) — depois da validação de `due_day` e antes do
      bloco `isSplit`, validar o link: `const link = normalizeRecurringLink(newRecurring.link_url);`
      e, se `link && !isHttpLink(link)`, `return setFormError(RECURRING_LINK_HINT)`. Link vazio não
      bloqueia nada.
- [x] `RecurringFormDialog.tsx:224-238` — os dois ramos do `payload` (`isSplit` e o
      `applyFixedYearFields(newRecurring)`) passam a carregar `link_url: link`, de forma que
      `createRecurring` receba sempre o valor normalizado (`null` quando o usuário apagou).
- [x] Criar `src/pages/admin/finance/components/__tests__/RecurringFormDialog.link.test.tsx`
      (extensão `.tsx` obrigatória: é o projeto `jsdom` do Vitest — `vite.config.ts:375-382`).
      Harness no padrão de `__tests__/RecurringListFilters.test.tsx` (render + `userEvent`), mas com um
      componente wrapper local que guarda `newRecurring` em `useState` e passa `setNewRecurring`, já
      que o dialog é controlado de fora. `dimensions` pode ser uma fixture mínima de `Dimension[]`
      (`src/types/dimensions.ts:27-38`) com uma classe.
- [x] No mesmo arquivo de teste, mockar o que o `ClassSearchPicker` puxa de rede:
      `vi.mock("@/api/finance")` (pelo menos `fetchMostUsedClassIds`, `createClassApi`,
      `createTypeApi`) e, se o toast atrapalhar, `@/hooks/use-toast`. O objetivo é renderizar o dialog
      aberto sem chamada de rede.
- [x] Teste 1 — **grava normalizado**: dialog aberto com `newRecurring` já válido (categoria, descrição,
      valor, `due_day`, `payment_start_date`), digitar `  https://nubank.com.br/pagar  ` no campo Link,
      clicar em "Salvar recorrência" e assertar que o mock `createRecurring` foi chamado com
      `link_url: "https://nubank.com.br/pagar"` (sem espaços).
- [x] Teste 2 — **vazio vira `null`**: mesmo fluxo sem digitar nada no Link → `createRecurring`
      chamado com `link_url: null`.
- [x] Teste 3 — **barra URL sem protocolo**: digitar `nubank.com.br`, submeter, e assertar que
      aparece "Comece com https://" (`screen.getByRole("alert")`, que é o `errorSummary` do
      `FormDialogShell` — `src/components/FormDialogShell.tsx:55-62`) **e** que `createRecurring`
      **não** foi chamado.
- [x] Teste 4 — **edição carrega o link**: montar o harness com `newRecurring.link_url` já preenchido
      e assertar que o `Input` do campo Link mostra aquele valor (prova o caminho `handleEdit`
      chegando à tela).
- [x] Rodar `npx vitest run src/pages/admin/finance/components/__tests__/RecurringFormDialog.link.test.tsx`.

### Lista
- [x] `src/pages/admin/finance/components/RecurringTable.tsx:1` — acrescentar `ExternalLink` ao import
      de `lucide-react`.
- [x] `RecurringTable.tsx:325-338` — na `TableCell` da Descrição, envolver o `span` do `displayName` e
      a âncora num wrapper `flex items-start gap-1.5`, e renderizar, quando `item.link_url?.trim()`,
      um `<a href={item.link_url} target="_blank" rel="noreferrer" title="Abrir link"
      aria-label={`Abrir link de ${displayName}`}>` com `<ExternalLink className="h-3.5 w-3.5" />`
      dentro, nas classes de `TripItineraryTab.tsx:1052` (botão fantasma quadrado,
      `text-muted-foreground hover:bg-muted`). Nada renderizado quando `link_url` é `null`.
- [x] `RecurringTable.tsx` — conferir que os blocos "Arquivada" / "Pago em …" (`:329-337`) continuam
      abaixo do nome, sem a âncora empurrando o layout.
- [x] `src/pages/admin/finance/components/RecurringTableMobile.tsx` — import de `ExternalLink` e a
      mesma âncora na linha do `displayName` (`:101`), dentro de um wrapper `flex items-start gap-1.5`
      para o nome não perder o `min-w-0 flex-1`.
- [x] Criar `src/pages/admin/finance/components/__tests__/RecurringTable.link.test.tsx`
      (extensão `.tsx`: projeto `jsdom` do Vitest, `vite.config.ts:375-382`). Montar uma fixture
      `Recurring` mínima (`src/types/recurring.ts:13-28`: `id`, `class`, `value`, `description`,
      `frequency`, `validity`, `due_day`, `installment_count`, `payment_start_date`, `status`,
      `created_at`, `paid_parcels`) e um bag de props com `vi.fn()` nos callbacks
      (`RecurringTable.tsx:56-79`). Mockar `@/api/recurring` se o import de rede incomodar.
- [x] Teste 1 — **desktop com link**: renderizar `<RecurringTable isMobile={false} …>` com
      `link_url: "https://www.enel.com.br/pagar"` e assertar que existe um elemento com
      `getByRole("link", { name: /Abrir link de Luz/ })`, que seu `href` é exatamente a URL e que
      `target === "_blank"`.
- [x] Teste 2 — **desktop sem link**: mesma fixture com `link_url: null` →
      `queryByRole("link", { name: /Abrir link/ })` é `null` (nenhuma âncora, nenhum ícone órfão).
- [x] Teste 3 — **mobile com link**: renderizar `<RecurringTable isMobile …>` (o componente delega
      para `RecurringTableMobile` em `RecurringTable.tsx:223-225`) e repetir as asserções do teste 1.
- [x] Teste 4 — **mobile sem link**: mesma asserção do teste 2 com `isMobile`.
- [x] Teste 5 — **só espaços**: `link_url: "   "` → nenhuma âncora, nas duas versões (prova o
      `?.trim()` na condição).
- [x] Conferir que `filterRecurringBySearch` segue sem casar o link: rodar
      `npx vitest run src/domain/recurring/__tests__/listView.test.ts` e **não** alterar
      `listView.ts`.
- [x] Rodar `npx vitest run src/pages/admin/finance/components/__tests__/RecurringTable.link.test.tsx`.

### Orb
- [x] `supabase/functions/_shared/orb/tools/finance.ts:265-277` — `interface RecurringRow` ganha
      `link_url: string | null`.
- [x] `finance.ts:299-301` — a string do `.select(...)` de `query_recurring` passa a listar
      `link_url` (acrescentar ao final da lista de colunas simples, antes do `class:class_id(...)`).
- [x] `finance.ts:309-330` — o objeto devolvido no `rows.map` ganha `link_url: row.link_url ?? null`.
- [x] **Não** tocar em `description` nem em `inputSchema` de `query_recurring` (`finance.ts:282-294`).
- [x] `supabase/functions/_shared/orb/schema.ts:159-172` — acrescentar
      `{ name: "link_url", type: "text", description: "Link da recorrência (ex.: onde se faz o pagamento)." }`
      à lista `columns`, **sem** incluir em `defaultColumns` (`:158`).
- [x] Conferir que `src/domain/orb/__tests__/data.test.ts:29` (todo `defaultColumns` tem que existir em
      `columns`) segue passando — a direção é justamente a que não quebra.
- [x] Em `src/domain/orb/__tests__/tools.test.ts`, acrescentar um `describe("query_recurring: link")`
      usando os helpers já existentes do arquivo (`rodar`, `fakeDb`, `leituraDe`, `filtro`) e uma
      fixture de linha de `recurring_transaction`.
- [x] Teste 1 — **payload**: `fakeDb({ recurring_transaction: [linha com link_url: "https://www.enel.com.br/pagar"] })`
      → `rodar("query_recurring", {}, db)` devolve `recurring[0].link_url` igual à URL.
- [x] Teste 2 — **sem link**: linha com `link_url: null` → `recurring[0].link_url` é `null` (a chave
      existe no payload, não desaparece).
- [x] Teste 3 — **select pede a coluna**: assertar que
      `String(filtro(leituraDe(log, "recurring_transaction"), "select"))` contém `"link_url"` — é o que
      prova que a leitura no Postgres traria o campo (o `fakeDb` não executa filtro; ele registra a
      query montada, ver cabeçalho de `src/domain/orb/__tests__/fakeDb.ts`).
- [x] Teste 4 — **schema**: assertar que a tabela `recurring_transaction` do schema tem `link_url` em
      `columns` e **não** em `defaultColumns`.
- [x] Rodar `npx vitest run src/domain/orb/__tests__/tools.test.ts` e
      `npx vitest run src/domain/orb/__tests__/data.test.ts`.

### Fechamento
- [x] Rodar `npm test`, `npm run build` e `npm run check:mcp` e deixar a saída relevante em
      `## Notas` se algo além desta feature falhar (lint acusa worktrees irmãos; `npm test` é flaky sob
      carga, repetir antes de chamar de regressão).

## Prompts
(vazio até haver iteração nova)

## Notas

### 5º construtor de `RecurringCreateRequest` (achado confirmado)
`src/pages/admin/goals/Goals.tsx:694` (rotina de poupança das Metas) é de fato o quinto literal de
`RecurringCreateRequest` e, como `link_url` é **obrigatório** no tipo, sem `link_url: null` ali o
`tsc -b` quebra. Os cinco atualizados: `Recurring.tsx` (`defaultRecurringCreateRequest` e
`handleEdit`), `TaskRecurrenceRules.tsx`, `orbActions.ts` e `Goals.tsx`. O planning listava quatro.

### `RECURRING_SELECT` não foi exportado só para o teste
A tarefa pedia assertar que `RECURRING_SELECT` contém `link_url`. A constante é privada em
`src/api/recurring.ts`; em vez de reexportá-la só para o teste, o Supabase falso de
`src/api/__tests__/recurring.link-url.test.ts` **registra a string realmente passada para
`.select(...)`** e a assertiva é sobre ela. Prova a mesma coisa sem alargar a superfície pública do
módulo, e prova a mais que a chamada usa aquela string.

### Teste 4 do bloco Orb (schema) foi para `data.test.ts`, não `tools.test.ts`
A tarefa listava os quatro testes da Orb sob o `describe("query_recurring: link")` de
`tools.test.ts`, mas o quarto é sobre o **catálogo** (`columns` sim, `defaultColumns` não) e não usa
nenhum dos helpers daquele arquivo (`rodar`, `fakeDb`, `leituraDe`, `filtro`). Ele foi para
`src/domain/orb/__tests__/data.test.ts`, que é o arquivo do catálogo e já importa `findOrbTable`.
Lá ele cresceu dois casos a mais, ambos comportamentais em vez de estruturais: `query_data` sem
`columns` **não** pede `link_url` no `select` montado, e pedindo `columns: ["id","link_url"]` a tool
aceita (se a coluna não estivesse em `columns`, ela recusaria com "não tem a coluna") e o `select`
passa a trazê-la; mais `describe_data` da tabela listando o campo.

### Fechamento: as três verificações passaram (2026-10-05)
- `npm test` — `Test Files 338 passed (338)` / `Tests 3826 passed (3826)`. Nada além desta feature
  falhou; não houve flakiness, uma rodada bastou.
- `npm run build` — `tsc -b` + Vite + PWA + `prerender ok (15 rotas, static shells)`. É a prova de
  que os **5** construtores de `RecurringCreateRequest` receberam `link_url`.
- `npm run check:mcp` — `tsc -p tsconfig.mcp.json`, exit 0. Cobre
  `supabase/functions/_shared/orb`, que o `tsc -b` não olha.
- `npm run lint` — `30 problems (0 errors, 30 warnings)`, todos `react-refresh/only-export-components`
  e `react-hooks/exhaustive-deps` pré-existentes em arquivos de outras áreas. `npm run lint | grep
  -iE "links\.ts|recurring"` não devolve nada: nenhum arquivo desta feature acusa.

### O host do projeto Supabase não resolve nesta máquina (2026-10-05)
A chamada real ao PostgREST do passo 3.2 de `## Como testar` e o `npx supabase migration list` do
passo 3.1 **não puderam ser executados**, e não por falta de autorização: o hostname do projeto não
resolve em DNS.

- `nslookup cmspyjarkbsrqtjhtwpz.supabase.co` → `** server can't find …: NXDOMAIN`
- `curl .../rest/v1/recurring_transaction?select=id,link_url` → exit 6 (`couldn't resolve host`),
  `HTTP=000` — não é `400`/`42703`, é a chamada não saindo da máquina.
- `npx supabase migration list` → `LegacyDbConfigLoginRoleStatusError … Connection terminated due
  to connection timeout`.
- Controle: `curl https://api.github.com` → `HTTP=200`. Ou seja, internet funciona; é o host do
  projeto que não resolve (projeto pausado, DNS local, ou URL do `.env` desatualizada).

Isso **não** afeta nenhuma tarefa de código: toda a verificação desta feature é Vitest com Supabase
falso. Afeta só a tarefa de banco, que já estava pendente do usuário — e acrescenta que, quando o
"pode" vier, o `supabase db push` também vai precisar do host no ar.

## Como testar

1. **Pré-requisitos**
   - `npm ci` feito, repositório na branch desta feature.
   - A migration tem que estar aplicada no banco remoto. Confira com `npx supabase migration list`: a
     linha de `20261005120000` precisa ter o mesmo valor em `local` e `remote`. Se `remote` vier
     vazio, o `supabase db push` não foi autorizado/rodado ainda — os testes automatizados passam
     mesmo assim (usam Supabase falso), mas todo passo que grava ou lê no banco de verdade falha com
     `42703`. **Em 2026-10-05 o push não foi autorizado e segue pendente** (ver `## Tarefas`).
   - **O host do projeto precisa resolver.** Antes de culpar a migration, rode
     `nslookup $(printf %s "$VITE_SUPABASE_URL" | sed -E 's#https?://([^/]+).*#\1#')`. Em 2026-10-05
     ele devolvia `NXDOMAIN` nesta máquina, e nesse estado o `curl` do passo 3.2 sai com
     `HTTP=000` (exit 6, "couldn't resolve host") e o `npx supabase migration list` morre em
     `Connection terminated due to connection timeout` — nenhum dos dois é sintoma de coluna
     faltando. Controle: `curl -o /dev/null -w "%{http_code}\n" https://api.github.com` → `200`
     separa "internet caiu" de "host do projeto fora do ar".
   - `npm run dev` de pé e login na conta de sempre, para a verificação manual.
   - Pelo menos uma categoria (classe) cadastrada em Finanças, senão não há como preencher a
     recorrência.
   - Para o passo via MCP: `npm run mcp:login` já feito uma vez (grava o refresh token em
     `~/.orbyva/credentials.json`).
   - Nada de seed: nenhum teste automatizado desta feature toca banco de verdade.
   - Chrome não entra em nenhum passo automatizado; a verificação manual é feita pelo usuário, no
     navegador que ele já usa.

2. **Verificação automatizada** (na raiz do repositório)
   Rodada completa em 2026-10-05, com a contagem de cada uma (se o número cair, teste foi perdido):

   - `npx vitest run src/domain/recurring/__tests__/links.test.ts` — **5 testes**. Passou =
     `normalizeRecurringLink` e `isHttpLink` existem e se comportam (trim, `""`/`"   "`/`null`/
     `undefined` → `null`, só `http`/`https` passam, `ftp://` e `javascript:` não) e
     `RECURRING_LINK_HINT` é exatamente `"Comece com https://"`.
   - `npx vitest run src/api/__tests__/recurring.link-url.test.ts` — **4 testes**. Passou =
     `updateRecurringApi` coloca `link_url` no payload e consegue mandar `null` (a assertiva é
     `"link_url" in payload === true` **e** valor nulo — chave omitida não passaria);
     `createRecurringApi` leva o campo na linha do `insert`; e a string realmente passada para
     `.select(...)` contém `link_url`. O Supabase falso registra o que chegou em
     `insert`/`update`/`select` — `RECURRING_SELECT` **não** foi exportado só para o teste.
   - `npx vitest run src/pages/admin/finance/components/__tests__/RecurringFormDialog.link.test.tsx`
     — **5 testes**. Passou = link normalizado chega em `createRecurring` (digitar
     `"  https://nubank.com.br/pagar  "` grava sem os espaços), vazio vira `null`, **só espaços**
     também viram `null` sem erro, URL sem protocolo barra o submit com "Comece com https://" (e
     `createRecurring` **não** é chamado), e a edição mostra o link existente no `Input`.
   - `npx vitest run src/pages/admin/finance/components/__tests__/RecurringTable.link.test.tsx`
     — **8 testes** (4 casos × desktop e mobile, via `describe.each`). Passou = âncora presente com
     `href` exato, `target="_blank"`, `rel="noreferrer"` e `title="Abrir link"` nas duas versões, e
     **ausente** quando `link_url` é `null` ou só espaços; e recorrência arquivada com link mostra a
     âncora **e** a legenda "Arquivada".
   - `npx vitest run src/domain/recurring/__tests__/listView.test.ts` — **9 testes**, todos
     pré-existentes. Passou = a busca da lista continua por descrição/categoria; nada de link entrou
     no filtro. `git diff src/domain/recurring/listView.ts` tem que vir **vazio**.
   - `npx vitest run src/domain/orb/__tests__/tools.test.ts` — **27 testes**, dos quais 3 novos no
     `describe("query_recurring: link")`. Passou = `query_recurring` devolve `link_url` com valor e
     com `null` (a chave existe sempre, não desaparece), e o `select` montado pede a coluna. Atenção
     ao montar assertiva nova aqui: no `fakeDb` a string do `.select(...)` entra como **nome** do
     filtro (`select:<colunas>`), não como valor — `filtro(leitura, "select")` devolve `undefined`;
     o jeito certo é `leitura.filters.find(([k]) => k.startsWith("select:"))?.[0]`.
   - `npx vitest run src/domain/orb/__tests__/data.test.ts` — **17 testes**, dos quais 3 novos no
     `describe("recurring_transaction: link_url fora de defaultColumns")` (é aqui que mora a prova
     do schema, não em `tools.test.ts` — ver `## Notas`). Passou = o schema segue coerente
     (`defaultColumns ⊆ columns`); `link_url` está em `columns` e **não** em `defaultColumns`, que
     continua exatamente `["id","description","value","frequency","due_day","status"]`; `query_data`
     sem `columns` não pede `link_url` no `select` e pedindo `columns: ["id","link_url"]` a tool
     aceita e pede; e `describe_data` da tabela lista o campo.
   - `npm test` — suíte inteira verde; nenhum teste antigo de recorrência quebrou.
   - `npm run build` — `tsc -b` + build. Passou = os **5** construtores de `RecurringCreateRequest`
     (`Recurring.tsx` ×2, `TaskRecurrenceRules.tsx`, `orbActions.ts`, `Goals.tsx`) foram atualizados;
     qualquer um esquecido derruba o `tsc` com "Property 'link_url' is missing".
   - `npm run check:mcp` — `tsc -p tsconfig.mcp.json` verde (exit 0). É o único typecheck que cobre
     `supabase/functions/_shared/orb` (`tsc -b` não olha para lá), então **esse** comando é o que
     flagra `link_url` faltando em `RecurringRow`.
   - `npm run lint` — esperado `30 problems (0 errors, 30 warnings)`, todos
     `react-refresh/only-export-components` e `react-hooks/exhaustive-deps` **pré-existentes** em
     arquivos de outras áreas. O filtro que importa é
     `npm run lint 2>&1 | grep -iE "links\.ts|recurring"`: tem que vir **vazio**.
   - `git diff supabase/functions/_shared/orb/tools/finance.ts` — só 5 linhas acrescentadas
     (`link_url` em `RecurringRow`, no `select`, no `rows.map`, mais comentário). `description` e
     `inputSchema` de `query_recurring` não aparecem no diff: é o contrato de prefixo do Gemini.

3. **Verificação manual, passo a passo**

   *Banco (sem navegador — chamada real ao PostgREST)*
   1. `npx supabase migration list` → a linha `{"local":"20261005120000","remote":"20261005120000"}`
      aparece. Se `remote` estiver vazio, pare: a migration não foi aplicada.
   2. Na raiz, com o `.env` do projeto:
      `set -a && . ./.env && set +a`
      `curl -s -w "\nHTTP=%{http_code}\n" "$VITE_SUPABASE_URL/rest/v1/recurring_transaction?select=id,link_url&limit=1" -H "apikey: $VITE_SUPABASE_ANON_KEY"`
      Esperado: `[]` e `HTTP=200`. O `[]` é o RLS fazendo o trabalho dele (chave anônima não vê linha
      de ninguém) — o que o passo prova é que o PostgREST **parseou** `link_url`, isto é, a coluna
      existe no banco remoto.
   3. Trocando `link_url` por `select=id,description` na mesma chamada: também `HTTP=200`. É o
      controle, para separar "coluna faltando" de "chave/URL erradas".

   *Formulário (usuário, no navegador dele)*
   4. Ir em `/finance/recurring` e clicar em **Nova recorrência**. Esperado: dentro do bloco
      "Classificação", logo abaixo de "Descrição", aparece o campo **Link (opcional)** com placeholder
      `https://…`.
   5. Preencher categoria, descrição ("Luz"), valor, dia de vencimento e início do pagamento; no campo
      Link, colar `https://www.enel.com.br/pagar`. Salvar. Esperado: toast de sucesso e o dialog
      fecha.
   6. Criar uma segunda recorrência **sem** link (ex.: "Internet"), para ter o par com/sem na lista.
   7. Clicar no lápis (editar) da recorrência "Luz". Esperado: o campo **Link** já vem preenchido com
      `https://www.enel.com.br/pagar`. Fechar sem salvar.
   8. Abrir uma tarefa com repetição "Vinculada a Recorrência Financeira" (`/tasks`, dialog de
      recorrência da tarefa). Esperado: o mesmo campo Link aparece no formulário embutido, porque é o
      mesmo componente.

   *Lista (mesmo navegador)*
   9. Voltar a `/finance/recurring`. Esperado: na coluna **Descrição**, "Luz" mostra um ícone de seta
      saindo de um quadrado (`ExternalLink`) ao lado do nome; "Internet" não mostra ícone nenhum.
   10. Passar o mouse sobre o ícone. Esperado: tooltip/título "Abrir link".
   11. Clicar no ícone. Esperado: **nova aba** com `https://www.enel.com.br/pagar`; a lista continua
       intacta na aba original (nada de linha expandida, nada de dialog de edição aberto).
   12. Estreitar a janela até a lista virar cartões (ou abrir no celular). Esperado: o mesmo ícone
       aparece na linha do nome do cartão, e a descrição não fica cortada por causa dele.
   13. Na busca da lista, digitar um trecho **da URL** (ex.: `enel.com`). Esperado: **nenhum**
       resultado — a busca é por descrição e categoria, de propósito.
   14. Expandir a linha de "Luz" pelo botão de seta (parcelas) e clicar no ícone de link. Esperado: a
       aba abre e a linha **não** colapsa/expande por causa do clique.
   15. Editar "Luz", apagar o conteúdo do campo Link e salvar. Esperado: o ícone some da lista; ao
       reabrir a edição, o campo Link está vazio — o link foi **removido** no banco, não mantido.
   16. Devolver o link a "Luz" (passo 5) antes de seguir para a Orb.

   *Orb (payload real, sem navegador)*
   17. Numa sessão do Claude Code com o servidor MCP do Orbyva conectado (`npm run mcp`, o mesmo
       registro de tools que a Edge Function — `mcp/orbMcpServer.ts:38`), chamar `query_recurring` com
       `{"search": "Luz"}`. Esperado: o item de "Luz" no array `recurring` traz a chave `link_url` com
       a URL cadastrada.
   18. Chamar `query_recurring` com `{}` (sem busca). Esperado: toda recorrência ativa traz `link_url`
       — com URL em "Luz", `null` em "Internet".
   19. Chamar `describe_data` com `{"table": "recurring_transaction"}`. Esperado: `link_url` aparece na
       lista de colunas da tabela.
   20. Chamar `query_data` com `{"table": "recurring_transaction"}` **sem** pedir colunas. Esperado:
       `link_url` **não** vem — as colunas padrão continuam sendo
       `id, description, value, frequency, due_day, status`. Pedindo `columns: ["id","link_url"]`, o
       campo vem.
   21. (Opcional, gasta tokens de verdade) `npm run orb:smoke -- "onde eu pago a luz?"` — o loop com a
       API do Gemini e o `fakeDb` tem que escolher `query_recurring` e responder sem erro de contrato.

4. **Casos de borda e caminhos negativos**
   - **Coluna ainda não aplicada**: a chamada do passo 3.2 devolve `HTTP=400` com
     `{"code":"42703", … "column recurring_transaction.link_url does not exist"}`. Esse é exatamente o
     corpo que o banco devolvia antes desta feature — vê-lo depois significa migration não aplicada.
   - **URL sem protocolo**: digitar `nubank.com.br` e salvar → a faixa vermelha no topo do dialog diz
     "Comece com https://" e **nada é salvo**.
   - **`ftp://` ou `javascript:`**: mesma mensagem "Comece com https://" (só `http`/`https` passam,
     por `isHttpLink`).
   - **Só espaços** no campo (`"   "`): salva como link vazio (sem erro), a edição reabre com o campo
     vazio e a lista não mostra ícone. É o caso que o `normalizeRecurringLink` e o `?.trim()` da
     âncora existem para cobrir — e tem cobertura automatizada nos três níveis: `links.test.ts`
     (`normalizeRecurringLink("   ") === null`), `RecurringFormDialog.link.test.tsx` ("só espaços no
     campo salvam como link vazio, sem erro") e `RecurringTable.link.test.tsx` ("só espaços: nenhuma
     âncora"), desktop e mobile.
   - **Link apagado** (`""` no formulário vira `null` no banco): o payload de `updateRecurringApi` tem
     que trazer `link_url: null`, não omitir a chave. Se omitir, a linha ficaria com o link antigo
     para sempre.
   - **Recorrência parcelada (Nx)**: repetir o passo 3.5 com a aba "Parcelada (Nx)" e valor total → o
     link também é gravado. É o ramo `isSplit` do payload, o que mais some em implementação parcial.
   - **Link muito longo**: colar uma URL de ~500 caracteres → salva (a coluna é `text`, sem limite).
   - **Campos obrigatórios em falta**: deixar a descrição vazia e preencher só o Link → o erro
     mostrado é "Informe a descrição.", ou seja a validação do link não roubou a vez das outras.
   - **Recorrência arquivada com link**: o ícone continua aparecendo ao lado de "Arquivada", sem
     quebrar o empilhamento nome/legenda — coberto por "arquivada com link: a âncora aparece e a
     legenda segue abaixo do nome" em `RecurringTable.link.test.tsx`, nas duas versões.
     `query_recurring` com `only_active: false` também traz `link_url` (o campo entra no `rows.map`,
     que não depende do filtro de status).
   - **Descrição longa** (nome de 80+ caracteres): o nome segue em `line-clamp-2` e o ícone não é
     empurrado para fora da célula.
   - **Lista vazia**: `/finance/recurring` sem nenhuma recorrência continua mostrando o `EmptyState`,
     sem erro de render.
   - **Home e vencimentos**: o widget do Home (`/home`) e o painel de alertas de vencimento **não**
     mostram link — é o escopo decidido, não defeito.
   - **Select legado sem a coluna**: `supabase/functions/home-bundle/index.ts:9` e
     `_shared/orb/tools/timeline.ts:181` continuam com o select antigo e **não** devem ser alterados
     aqui; `Recurring.link_url` é opcional justamente por causa deles. `npm run build` e
     `npm run check:mcp` verdes provam que seguem compilando.
   - **Rotina de poupança das Metas** (`Goals.tsx:694`): segue criando recorrência. `npm run build`
     verde é a prova de que o literal recebeu `link_url: null`.
   - **Catálogo intocado**: `description` e `inputSchema` de `query_recurring` precisam estar
     byte-a-byte iguais aos de antes (`git diff supabase/functions/_shared/orb/tools/finance.ts` não
     deve mostrar mudança nessas linhas) — é o contrato de prefixo do Gemini.
   - **Escrita pela Orb**: pedir à Orb "cadastra a conta de luz com o link x" **não** grava link —
     `propose_create` não tem o campo, de propósito. A recorrência é criada com `link_url` nulo.

5. **Sinais de que quebrou**
   - `tsc` com "Property 'link_url' is missing in type …" → algum dos 5 construtores ficou de fora.
   - `HTTP=400` com `42703` no passo 3.2, ou `npx supabase migration list` com `"remote":""` em
     `20261005120000` → `supabase db push` não rodou (ou rodou em outro projeto).
   - Erro do CLI falando de migration duplicada/fora de ordem → timestamp repetido; conferir
     `ls supabase/migrations/ | grep 20261005`.
   - Teste de API vermelho em "manda `null` quando o campo foi apagado" → `link_url` entrou no payload
     como `data.link_url || undefined` (ou via spread condicional) em vez de valor cru.
   - O campo Link não aparece no dialog → o `FormField` entrou fora da `FormSection "Classificação"`
     ou atrás de alguma condicional de `planMode`.
   - Salva com espaços em volta da URL (`" https://… "` no banco) → o payload está mandando
     `newRecurring.link_url` cru em vez de `normalizeRecurringLink(...)`.
   - Apagar o link não apaga (a edição reabre com o link antigo) → o payload está omitindo `link_url`
     quando vazio em vez de mandar `null`, ou a lista branca de `updateRecurringApi` não entrou.
   - `nubank.com.br` salva sem reclamar → a validação não está em `handleCreate`, ou está só no ramo
     fixo e não no `isSplit`.
   - Teste de componente falhando em `getByLabelText(/Link/)` → o `htmlFor`/`id` não foi ligado no
     `FormField`/`Input`.
   - Ícone aparecendo em **todas** as recorrências, inclusive sem link → a condição ficou
     `item.link_url !== undefined` em vez de `item.link_url?.trim()`.
   - Clicar no ícone navegar na **mesma** aba → faltou `target="_blank"`.
   - Clicar no ícone expandir/colapsar a linha → algum handler de clique foi adicionado à `TableRow`
     junto da mudança (não havia nenhum).
   - Ícone na coluna "Ações" em vez da Descrição → os 148px apertam os 5 botões existentes; é
     exatamente o que a decisão evita.
   - Link aparecendo no desktop e não nos cartões (ou vice-versa) → só um dos dois componentes foi
     alterado; os testes 3 e 4 da lista pegam isso.
   - Busca passando a achar pela URL → `filterRecurringBySearch` foi alterado; reverter.
   - `npm run check:mcp` com "Property 'link_url' does not exist on type 'RecurringRow'" → a interface
     não foi atualizada (ou foi, mas o `select` não).
   - `query_recurring` devolvendo `link_url: undefined` para todas as linhas → `link_url` entrou no
     objeto de retorno mas não na string do `select`.
   - `query_data` sem colunas passando a devolver `link_url` → a coluna entrou em `defaultColumns`
     por engano.
   - `data.test.ts` vermelho → a entrada nova em `columns` saiu malformada (falta `name` ou `type`).
