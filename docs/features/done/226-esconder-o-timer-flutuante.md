---
prompt: |-
  permitir esconder o timer, fica foda o acesso

  [Imagem anexada pelo usuário] Print da tela de recorrências financeiras (Finanças → Recorrências),
  em desktop. O widget flutuante do timer Live (`src/components/LiveWidget.tsx`) aparece como pill
  branca no canto inferior direito, mostrando "prosseguir com estudo de expansão e definir tese" com
  o ícone de cronômetro e o botão de play. A pill cobre a linha da tabela de recorrências — fica
  sobreposta exatamente em cima da coluna "Ações" da linha "Plano de Saúde - PROASA ADV 300 DF
  ADESAO" e colada no botão "Expandir parcelas", tapando o conteúdo e atrapalhando o clique. Logo
  abaixo/à direita dela ainda tem o FAB azul de "+".

  Escopo fechado no desenho desta feature (o que "cumprir" significa):

  - Esconder o timer = tirar o widget flutuante da tela. O timer em si não é afetado: o registro de
    tempo continua aberto no banco.
  - Decisão da pergunta P1 do desenho: **Opção A — botão mínimo no mesmo canto, que volta num
    clique.** Esconder não faz o widget sumir de vez: no lugar da pill fica um botão redondo só com
    o ícone `Timer`, no mesmo canto, que reexibe a pill num clique. Aplicada por delegação da
    instrução-mãe do usuário de 05/10/2026 ("crie as features das seguintes alterações e já rode a
    pipeline executando-as"), depois de a pergunta ter sido apresentada com essa Recomendada e ficar
    sem resposta explícita na janela de decisão da esteira — reversível: a alternativa descartada era
    "sumir de vez", com switch em `src/pages/admin/tasks/Live.tsx` + contexto próprio, porque o
    widget mora acima do `Outlet` e não enxerga state de página.
  - Preferência de visualização em `localStorage` (`orbyva_live_widget_hidden_v1`), por navegador,
    nunca coluna de banco — mesmo padrão de `src/lib/taskSortPreference.ts`. Nada de migration,
    endpoint ou RLS nesta feature.
  - Fora do escopo: reposicionar, encolher ou dar auto-hide por scroll à pill; mexer no
    `QuickAddExpenseFab`; mexer na tela `/tasks/live`; qualquer migration.
  - Prova por Vitest, sem navegador. `tsc`/lint não contam como verificação desta feature.
---

# 226 — Esconder o timer flutuante

## Contexto
Sem dependências — pode ser implementada em paralelo com as outras features da fila. O único arquivo
de produção compartilhado em potencial é `src/components/LiveWidget.tsx`, e no escopo da pill
inferior só esta feature o altera.

`src/components/LiveWidget.tsx` é montado uma vez em `src/layouts/AdminLayout.tsx:261` e fica fixo em
toda tela do admin; hoje não há como tirá-lo da frente. O print do pedido é o estado **ocioso** (ícone
de play = "Retomar"): a pill tapa a coluna "Ações" e o botão "Expandir parcelas" de
`src/pages/admin/finance/components/RecurringTable.tsx:530` sem estar cronometrando nada. O canto
inferior direito já acumula `QuickAddExpenseFab` (`fixed bottom-6 right-6 z-40`) e, no mobile,
`MobileBottomNav` (`z-40`) — a pill (`z-30`) é a terceira camada ali. A base de conhecimento do
projeto (`~/.claude/knowledge/orbyva/index.md`) só tem o lote `mcp-bases-e-templates`, nada sobre UI,
overlay ou timer: o desenho saiu da leitura do código.

## Decisões
- Preferência em `localStorage`, nunca em banco — é preferência de visualização, igual a
  `src/lib/taskSortPreference.ts:1`. Nada de migration, endpoint ou RLS nesta feature.
- Chave `orbyva_live_widget_hidden_v1`; ausente ou inválida = **visível**, pra nunca esconder o
  widget por acidente.
- A preferência é global, não por rota: o widget é único e mora no `AdminLayout`; esconder por tela
  seria conceito novo.
- O app nunca revoga a preferência: iniciar, parar ou concluir timer não reexibe o widget sozinho.
- Mesma preferência nos dois breakpoints — pill desktop e barra mobile são o mesmo componente, sem
  segundo controle.
- O botão de esconder entra no grupo de controles da pill com `ActionTooltip` + `aria-label`, como o
  check da feature 072 — não é ícone solto sem rótulo.
- Posição, tamanho e `z-index` da pill ficam como estão: a resposta à oclusão é esconder, não
  remanejar o canto.
- **P1 (resposta aplicada): Opção A — botão mínimo no mesmo canto, que volta num clique.** Escondido,
  o componente renderiza um botão redondo só com o ícone `Timer` em vez da pill; ícone em
  `text-primary` quando há timer rodando, pra não perder o sinal de "tem timer aberto". A alternativa
  "sumir de vez" foi descartada: exigiria controle de volta onde não existe nenhum (`/tasks/live` nem
  aparece na barra lateral, `src/components/app-sidebar.tsx:96`) e deixaria o timer rodando sem sinal
  em tela nenhuma.
- Sem sincronia entre abas (nenhum listener de `storage`): a leitura acontece no mount do widget.
- Esconder não toca o timer: nenhuma chamada a `stop()`, `updateTask` ou `fetchLastInteractedEntry`
  no caminho do clique.
- O botão de voltar fica **depois** das guardas de `src/components/LiveWidget.tsx:117` e `:119`: sem
  entrada ativa, ou com a última tarefa interagida já concluída, não há o que mostrar e o componente
  continua renderizando `null` — escondido ou não.
- Prova por Vitest. `tsc`/lint/build não contam como verificação desta feature (CLAUDE.md: Chrome e
  automação de navegador não entram na implementação nem na verificação).

## Tarefas

**Frente A — preferência persistida**

- [x] Criar `src/lib/liveWidgetVisibility.ts` espelhando `src/lib/taskSortPreference.ts`: exportar
      `LIVE_WIDGET_HIDDEN_STORAGE_KEY = "orbyva_live_widget_hidden_v1"`, `readLiveWidgetHidden():
      boolean` e `writeLiveWidgetHidden(hidden: boolean): void`.
- [x] `readLiveWidgetHidden` em `try/catch`: só a string exata `"1"` (o valor que a escrita grava)
      devolve `true`; ausente, qualquer outro valor ou `localStorage` que lance → `false` (visível).
- [x] `writeLiveWidgetHidden` em `try/catch`: grava `"1"` quando `true` e **remove** a chave quando
      `false` (não deixa `"0"` acumulado), engolindo erro de cota/modo privado.
- [x] Docstring no topo do módulo no mesmo molde de `src/lib/taskSortPreference.ts:1-9`: preferência
      de visualização, por navegador, nunca coluna de banco, e por que ausente = visível.

**Frente B — controle de esconder na pill**

- [x] `src/components/LiveWidget.tsx:2`: acrescentar `X` ao import de `lucide-react` (mantendo
      `Timer`) e importar `readLiveWidgetHidden`/`writeLiveWidgetHidden` de
      `@/lib/liveWidgetVisibility`.
- [x] Estado local junto dos outros `useState` (`src/components/LiveWidget.tsx:27-30`):
      `const [hidden, setHidden] = useState(() => readLiveWidgetHidden())` — leitura no mount, sem
      listener de `storage`.
- [x] Handler `hideWidget()`: grava `writeLiveWidgetHidden(true)` e chama `setHidden(true)`, nada
      mais — sem `stop()`, sem `updateTask`, sem refetch.
- [x] Novo botão `X` no grupo de controles (`src/components/LiveWidget.tsx:149`), à esquerda do
      play/stop de `:174`: `<ActionTooltip label="Esconder o timer">` + `Button` `size="icon"`
      `variant="ghost"` `className="h-7 w-7 shrink-0"` `aria-label="Esconder o timer"`, ícone
      `<X className="h-3.5 w-3.5" />`, visível nos dois estados (rodando e ocioso).
- [x] Conferir que o botão novo não ganha `disabled={completing}`: esconder não depende do
      "parar e concluir" em curso.

**Frente C — botão de volta no mesmo canto**

- [x] Em `src/components/LiveWidget.tsx`, depois das guardas de `:117` (`!activeEntry || !task`) e
      `:119` (ocioso + tarefa concluída), acrescentar o retorno antecipado `if (hidden) return (…)`
      com o botão redondo — assim nada aparece quando não há timer nem última tarefa pendente.
- [x] Botão de volta: `Button` `size="icon"` `variant="outline"` com `rounded-full shadow-lg`,
      `aria-label="Mostrar o timer"`, ícone `<Timer className={cn("h-4 w-4", isRunning ?
      "text-primary" : "text-muted-foreground")} />` e `ActionTooltip label="Mostrar o timer"`.
- [x] Posicionamento do botão de volta reusando as âncoras da pill (`src/components/LiveWidget.tsx:134-139`):
      `fixed z-30`, mobile `right-3 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))]`,
      desktop `md:bottom-24 md:right-6` — mesmo canto, acima do `QuickAddExpenseFab`.
- [x] Clique no botão de volta: `writeLiveWidgetHidden(false)` + `setHidden(false)`, reexibindo a
      pill no mesmo render (sem recarga).

**Frente D — verificação por código (Vitest, sem navegador)**

- [x] Criar `src/lib/__tests__/liveWidgetVisibility.test.ts` no molde de
      `src/lib/__tests__/taskSortPreference.test.ts` (ambiente "node", `localStorage` de mentira via
      `vi.stubGlobal` + `vi.unstubAllGlobals` no `afterEach`).
- [x] Casos do módulo: sem nada salvo → `false` (visível); `writeLiveWidgetHidden(true)` grava `"1"`
      e a releitura devolve `true`; `writeLiveWidgetHidden(false)` **remove** a chave e a releitura
      devolve `false`.
- [x] Casos de borda do módulo: valor lixo gravado por outra versão (`"true"`, `"0"`, `""`) → lê
      `false`; sem `localStorage` nenhum (`vi.stubGlobal("localStorage", undefined)`) → lê `false` e
      escrever não lança; `localStorage` que lança em `getItem`/`setItem`/`removeItem` → lê `false` e
      escrever não lança.
- [x] `src/components/__tests__/LiveWidget.test.tsx`: acrescentar `localStorage.clear()` ao
      `beforeEach` de `:95-103` (o setup jsdom compartilha o store entre os testes do arquivo —
      `src/test/setup-jsdom.ts`) e um `describe` novo "LiveWidget — esconder e mostrar".
- [x] Teste: o botão "Esconder o timer" existe com timer rodando **e** no estado ocioso/retomar
      (`mockedFetchLastInteractedEntry` com `ended_at` preenchido).
- [x] Teste: clicar em "Esconder o timer" tira a pill do DOM no mesmo render
      (`queryByText("Escrever relatório")` → `null`, nenhum botão "Parar timer"/"Retomar timer") e
      grava `localStorage.getItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY) === "1"`.
- [x] Teste: montar o widget com a chave já gravada (`localStorage.setItem(..., "1")` antes do
      `render`) não renderiza a pill e renderiza o botão "Mostrar o timer".
- [x] Teste: clicar em "Mostrar o timer" reexibe a pill (título de volta no DOM) e limpa a chave
      (`localStorage.getItem(...)` → `null`).
- [x] Teste: esconder com timer rodando não chama `stop` nem `updateTask`
      (`expect(timerState.stop).not.toHaveBeenCalled()`), e o botão de voltar mostra o `Timer` em
      `text-primary`.
- [x] Teste: com a chave gravada mas sem entrada ativa (`fetchLastInteractedEntry` → `null`), o
      componente não renderiza nem a pill nem o botão de voltar.
- [x] Rodar `npx vitest run src/lib/__tests__/liveWidgetVisibility.test.ts src/components/__tests__/LiveWidget.test.tsx`
      e, no fim, `npm test` + `npx tsc -b` + `npm run lint` (os dois últimos só como higiene, não
      como prova da feature).

## Prompts

## Notas

- Além dos casos listados na Frente D, o arquivo de componente ganhou três testes que a
  implementação pediu e o plano não previa: (a) escondido com timer **parado**, o cronômetro do
  botão de volta fica em `text-muted-foreground` (o par negativo do `text-primary`); (b) o botão de
  volta carrega de fato `fixed`/`z-30`/`rounded-full`/`md:bottom-24`/`md:right-6`/
  `env(safe-area-inset-bottom,0px)` — é o único jeito de provar o posicionamento sem navegador; e
  (c) valor lixo no `localStorage` não esconde o widget *na tela* (o teste do módulo prova a leitura,
  este prova o efeito no render).
- O botão de volta usa `right-3` no mobile (não `inset-x-3` como o pill): a pill ocupa a largura da
  tela, o botão redondo encosta só na direita. As demais âncoras são idênticas às do pill.
- Ordem dos controles dentro do pill, da esquerda pra direita: tempo decorrido, check de concluir
  (quando aplicável), `X` de esconder, parar/retomar — o `X` entrou à esquerda do play/stop, como a
  tarefa pedia.
- A docstring de `src/components/LiveWidget.tsx` ganhou um parágrafo sobre a feature 226 (por que o
  widget pode ser escondido e onde a preferência vive). Não estava nas tarefas; segue a convenção do
  arquivo de explicar cada camada no topo.

## Como testar

1. **Pré-requisitos**
   - Nenhuma migration, seed ou variável de ambiente nova — a feature é toda client-side
     (`localStorage`).
   - `npm install` feito e `npm run dev` de pé para a parte manual; logar com o usuário normal e
     entrar em qualquer tela do admin (`/dashboard` serve).
   - Para ver a pill é preciso ter **uma tarefa com timer rodando ou uma última tarefa interagida
     ainda não concluída**: sem isso o widget não aparece (nem antes nem depois desta feature).
     Em `/tasks/live`, inicie o timer de uma tarefa qualquer para garantir o estado.
   - Testar num navegador/perfil onde a chave `orbyva_live_widget_hidden_v1` ainda não exista (ou
     apagá-la no DevTools → Application → Local Storage antes de começar).

2. **Verificação automatizada**
   - `npx vitest run src/lib/__tests__/liveWidgetVisibility.test.ts` — **6 testes**, todos no
     `describe` "liveWidgetVisibility". Passou = o módulo devolve "visível" sem nada salvo, grava
     `"1"` e relê `true`, **remove** a chave ao voltar pra visível, descarta valor lixo (`"true"`,
     `"0"`, `""`, `"sim"`, `"01"`) e não lança sem `localStorage` nem com `localStorage` que explode
     em `getItem`/`setItem`/`removeItem`.
   - `npx vitest run src/components/__tests__/LiveWidget.test.tsx` — **21 testes**; os 10 novos estão
     no `describe` "LiveWidget — esconder e mostrar". Passou = o botão "Esconder o timer" existe com
     timer rodando e no estado "retomar" (e está habilitado, sem depender do "parar e concluir"), o
     clique tira a pill do DOM no mesmo render e grava a chave como `"1"`, montar com a chave gravada
     mostra só o botão redondo, o clique nele traz a pill de volta e **apaga** a chave, esconder com
     timer rodando não chama `stop`/`start`/`updateTask` e deixa o cronômetro em `text-primary`
     (em `text-muted-foreground` quando parado), o botão de volta carrega as âncoras de
     posicionamento da pill, sem entrada ativa não renderiza nada e valor lixo na chave nunca
     esconde. Os 11 testes das features 072/layout continuam no mesmo arquivo e precisam passar
     junto — se eles quebrarem, o controle novo mexeu no grupo de botões errado.
   - Para rodar os dois de uma vez:
     `npx vitest run src/lib/__tests__/liveWidgetVisibility.test.ts src/components/__tests__/LiveWidget.test.tsx`
     — esperado: `Test Files 2 passed (2)`, `Tests 27 passed (27)`.
   - `npm test` — a suíte inteira; esperado `Test Files 339 passed`, `Tests 3842 passed`. Ela é
     flaky sob carga: repita um arquivo que falhou sozinho antes de chamar de regressão.

3. **Verificação manual, passo a passo**
   1. Com o timer rodando, vá em **Finanças → Recorrências** (`/finance/recurring`), a tela do print.
      Resultado esperado: a pill branca do timer aparece no canto inferior direito, por cima da
      coluna "Ações" da tabela — é o defeito que a feature resolve.
   2. Passe o mouse no botão novo de `X` dentro da pill. Resultado esperado: tooltip "Esconder o
      timer".
   3. Clique no `X`. Resultado esperado: a pill desaparece **na hora**, sem recarregar a página, e no
      mesmo canto fica só um botão redondo pequeno com o ícone de cronômetro. A coluna "Ações" e o
      botão "Expandir parcelas" da linha ficam livres e clicáveis.
   4. Confirme que o timer **não** parou: abra `/tasks/live`. Resultado esperado: a tarefa continua
      cronometrando, com o tempo correndo — esconder é só visual.
   5. Navegue para outra tela (`/dashboard`) e volte. Resultado esperado: o widget continua
      escondido, só o botão redondo no canto.
   6. Recarregue a página (F5). Resultado esperado: continua escondido — a preferência sobreviveu.
   7. Clique no botão redondo. Resultado esperado: a pill volta no mesmo render, com título da tarefa
      e os controles na ordem tempo → check de concluir (quando aplicável) → `X` → parar/retomar.
   8. Repita os passos 3 e 7 no mobile (DevTools em largura de telefone, ou o celular mesmo).
      Resultado esperado: mesmo comportamento na barra que fica acima da navegação inferior; a barra
      ocupa a largura da tela (`inset-x-3`), mas o botão redondo encosta só na direita (`right-3`)
      — a preferência é a mesma dos dois lados, sem segundo controle.

4. **Casos de borda e caminhos negativos**
   - **Sem timer e sem última tarefa pendente** (nenhuma tarefa interagida, ou a última já
     concluída): não aparece nem a pill nem o botão redondo — escondido ou não, não há o que mostrar.
   - **Escondido com timer rodando**: o ícone de cronômetro do botão redondo fica na cor de destaque
     (`text-primary`), não em cinza — é o sinal de "tem timer aberto" que sobrou na tela.
   - **Escondido com timer parado** (estado "retomar"): mesmo botão redondo, ícone em cinza.
   - **Parar ou concluir o timer com o widget escondido**: o widget **não** reaparece sozinho. A
     preferência só muda por clique do usuário.
   - **Valor lixo no `localStorage`**: no DevTools, ponha `orbyva_live_widget_hidden_v1 = "true"` (ou
     `"0"`, ou vazio) e recarregue. Resultado esperado: o widget aparece **visível** — valor inválido
     nunca esconde.
   - **Modo privado / cookies e storage bloqueados**: o widget aparece visível, o `X` esconde na
     sessão atual e a tela não quebra; a preferência simplesmente não sobrevive à recarga.
   - **Duas abas abertas**: esconder numa aba não afeta a outra até ela ser recarregada — não há
     sincronia entre abas, é esperado.

5. **Sinais de que quebrou**
   - Clicar no `X` para o timer, conclui a tarefa, ou faz a tarefa sumir de `/tasks/live`: o handler
     de esconder encostou em `stop()`/`updateTask`, que é exatamente o que ele não pode fazer.
   - Pill some mas nenhum botão redondo aparece no canto (tendo timer/última tarefa pendente): o
     retorno antecipado de "escondido" ficou antes das guardas, ou sem posicionamento `fixed`.
   - Pill só desaparece depois de recarregar a página: faltou o estado local `hidden`, está lendo
     só do `localStorage` no render inicial.
   - Widget volta visível a cada troca de tela ou recarga: a escrita no `localStorage` não aconteceu
     (ver a chave no DevTools) ou a leitura está rejeitando o valor gravado.
   - Widget nasce escondido num navegador que nunca clicou no `X`: a leitura está tratando chave
     ausente/inválida como "escondido" — o padrão tem de ser visível.
   - Botão redondo cobrindo o FAB azul de "+" (ou coberto por ele): o posicionamento perdeu o
     `md:bottom-24` que mantém a camada acima do `QuickAddExpenseFab`.
   - No mobile, o botão redondo colado na navegação inferior ou atrás dela: faltou o
     `env(safe-area-inset-bottom)` / o `z-30`.
