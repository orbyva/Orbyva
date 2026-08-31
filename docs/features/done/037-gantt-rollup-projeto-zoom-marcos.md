---
prompt: |
  no gantt de /tasks, preciso de uma visão de alto nível, não uma planilha de tarefas dia a dia
  - hoje cada tarefa/subtarefa vira uma linha e uma barra própria, quase todas de 1 dia — com
    vários projetos abertos ao mesmo tempo (caraxle, sa.ca.da, jurix26...) a árvore fica gigante,
    cada projeto ocupa uma pilha de linhas e não dá pra comparar "onde cada projeto está" de
    relance
  - quero que o projeto vire a unidade principal do gantt: uma barra por projeto, com a barra
    cobrindo do início da tarefa mais cedo até o prazo da tarefa mais tarde daquele projeto
    (rollup), e um indicador de progresso (% de tarefas concluídas, ou algo visual tipo a barra
    preenchida até onde já foi feito)
    - clicar/expandir o projeto continua mostrando as tarefas dele (o que já existe hoje), mas
      colapsado é o padrão
  - preciso trocar a granularidade da visão: hoje só dá pra ver dia a dia (a régua do topo mostra
    11, 12, 13...). quero poder alternar pra semana, mês, trimestre — pra planejamento de verdade
    eu preciso ver "esse projeto entrega em outubro", não "essa tarefa é dia 14"
  - tarefas que marcam entrega/data importante deveriam poder virar um "marco"/milestone, sem
    duração, só um ponto na linha do tempo, visualmente diferente de tarefa normal com duração
  - avaliar se faz sentido ter um modo "por projeto" vs "por tarefa" alternável, em vez de dois
    gantts separados — quero decidir na hora qual granularidade de informação preciso ver
---

# 037 — Gantt de alto nível: rollup por projeto, zoom de granularidade e marcos

## Contexto
Hoje cada tarefa/subtarefa vira uma linha e uma barra própria no Gantt (`buildGanttNodes`,
`src/domain/tasks/gantt.ts`), com nós de projeto sempre abertos (`open: true`). Com vários
projetos ativos ao mesmo tempo a árvore fica gigante e não dá pra comparar "onde cada projeto
está" de relance — e a régua do topo (`GanttChart.tsx`) só mostra granularidade de dia. Essa
feature transforma o Gantt numa visão de planejamento de alto nível: o projeto vira a unidade
principal (barra de rollup colapsada por padrão, com indicador de progresso), a granularidade da
régua passa a ser ajustável (dia/semana/mês/trimestre), e tarefas de data importante podem virar
"marcos" (milestone, sem duração).

## Decisões
- Novo modo de visão alternável "Por projeto" (padrão) / "Por tarefa", estado local em
  `GanttChart.tsx` (não persistido). "Por tarefa" mantém o comportamento atual (nós de projeto
  `open: true`, mostrando tudo). "Por projeto" colapsa os nós de projeto por padrão
  (`open: false`) e exibe a barra de rollup + indicador de progresso; expandir continua mostrando
  as tarefas do projeto, como hoje.
- `buildGanttNodes` (`gantt.ts`) ganha um parâmetro de modo; em `"by-project"`, cada nó `summary`
  recebe `start`/`end` calculados (menor data de início / maior prazo entre as tarefas de topo do
  projeto, via `resolveTaskSchedule` já existente) e `progress` (% de tarefas de topo com
  `status === "done"`). Extrair esse cálculo pra uma função pura testável.
- **Confirmado na implementação** (lendo `@svar-ui/gantt-store/dist/index.js`, minificado): a lib
  computa `start`/`end` de um `summary` automaticamente a partir dos filhos *só quando o nó não traz
  esses campos* — mas não computa `progress`. Decidimos setar `start`/`end`/`progress` explicitamente
  mesmo assim (via `computeProjectRollup`, independente do comportamento interno da lib): fica
  testável como função pura, não depende de nuance de versão da lib, e cobre o `progress` que ela
  não calcula sozinha. Ver `## Notas`.
  `rollups`/`ITask.rollup` (`IConfig.rollups`) é um recurso diferente — desenha os filhos
  sobrepostos dentro da própria linha do summary, não um agregado no lugar da barra; não usado aqui.
- Milestones: nova coluna `is_milestone boolean not null default false` em `task` (migration nova
  — **não aplicar `supabase db push` sem confirmar com o usuário antes**, conforme regra do
  projeto). `GanttTaskInput`/`Task` ganham `is_milestone`. `taskNode()` em `gantt.ts`: quando
  `is_milestone`, retorna `type: "milestone"` (tipo já suportado nativamente pela lib — `TTaskType`
  inclui `"milestone"`, ver `@svar-ui/gantt-store/dist/types/types.d.ts`) com `start === end` (usa
  o `due_date` resolvido, sem depender de `estimated_duration`) em vez do intervalo normal.
- `GanttBarContent` (`GanttChart.tsx`) já tem um branch pra `data.type === "milestone"` (hoje só
  renderiza o texto, sem estilo de barra) — precisa de estilo visual próprio (ex. ícone de losango)
  pra ficar distinguível de uma tarefa normal com duração.
- Toggle de marco fica no formulário completo (checkbox "Marco" na aba Geral) — quick-edit inline
  do Gantt fica fora do escopo desta feature (ver feature 039, que cobre os quick actions do card
  do Gantt).
- Zoom de granularidade: hoje `<Gantt zoom .../>` usa o atalho booleano (zoom padrão da lib, sem
  controle explícito de UI). Trocar por `zoom={{ levels: [...] }}` (`IZoomConfig`/`IScaleLevel`,
  ver `@svar-ui/gantt-store/dist/types/types.d.ts`) com 4 presets nomeados: dia, semana, mês,
  trimestre. Adicionar um controle de UI (grupo de botões) acima do Gantt pra pular direto pra um
  preset.
- **Confirmado na implementação**: não existe forma direta de "pular pro nível X" — só a ação
  relativa `zoom-scale`, `{ dir }`. `getReactiveState()` também não serve (`IPublicWritable` só
  expõe `subscribe`, sem `set`). Implementado `jumpToGanttZoomLevel` (`gantt.ts`) como um loop que
  recalcula `dir = targetLevel - nívelAtual` a cada chamada (nunca assume que a anterior funcionou)
  e para ao convergir — ver `## Notas` pro motivo de não bastar uma chamada só.

## Tarefas
- [x] Escrever `computeProjectRollup(tasks: GanttTaskInput[]): { start: string; end: string;
      progress: number } | null` (por projeto) em `gantt.ts`, usando `resolveTaskSchedule` para as
      datas efetivas de cada tarefa de topo; `null` quando o projeto não tem tarefa de topo. Teste
      unitário em `__tests__/gantt.test.ts` (sem tarefas, 1 tarefa, várias tarefas com datas
      diferentes, tarefas concluídas/pendentes misturadas).
- [x] Adicionar parâmetro `mode: "by-task" | "by-project"` a `buildGanttNodes`; em
      `"by-project"`, nó `summary` recebe `open: false` + (se necessário, conforme decisão acima)
      `start`/`end`/`progress` do rollup; em `"by-task"`, comportamento atual preservado. Testes
      cobrindo os dois modos.
- [x] Adicionar `is_milestone?: boolean` em `GanttTaskInput` (`gantt.ts`) e em `taskNode()`: quando
      `true`, node com `type: "milestone"`, `start` e `end` iguais à data efetiva (`due_date`
      resolvido). Teste unitário.
- [x] Migration `supabase/migrations/<timestamp>_task_milestone.sql`: coluna `is_milestone boolean
      not null default false` em `task` — não aplicar sem confirmar com o usuário.
- [x] Adicionar `is_milestone` em `Task`/`TaskCreateRequest` (`src/types/tasks.ts`).
- [x] Adicionar checkbox "Marco" na aba Geral do formulário completo de tarefa (`TaskList.tsx`/
      `ProjectDetail.tsx` — localizar o campo de prazo como referência de posição), setando
      `is_milestone` via `updateTask`/`createTask`.
- [x] Passar `is_milestone` das tarefas carregadas pra `GanttTaskInput` nos pontos que montam
      `ganttTasks` (`TaskList.tsx`, `ProjectDetail.tsx`).
- [x] Adicionar toggle "Por projeto" / "Por tarefa" (estado local `useState`) no topo do
      `GanttChart`, repassando o modo escolhido pra `buildGanttNodes`.
- [x] Estilizar o rollup do projeto no `taskTemplate` (`GanttBarContent`): preencher visualmente a
      barra conforme `data.progress` quando `data.type === "summary"` — confirmar primeiro se a
      lib já desenha algo nativo antes de sobrepor estilo custom.
- [x] Estilizar visualmente o nó `milestone` no `GanttBarContent` (hoje só texto puro) — ex. ícone
      de losango, sem borda de barra retangular, pra distinguir de tarefa normal.
- [x] Definir os 4 presets de zoom (dia/semana/mês/trimestre) como `IScaleLevel[]` e trocar a prop
      `zoom` do `<Gantt>` de booleano pra `zoom={{ levels: presets }}`.
- [x] Adicionar grupo de botões (dia/semana/mês/trimestre) acima do `<Gantt>` em
      `GanttChart.tsx`, chamando a API de zoom pra pular pro preset escolhido (mecanismo exato a
      confirmar na implementação, ver decisão acima).
- [x] `npx tsc --noEmit && npm run build && npm run lint` + rodar a suíte de `gantt.test.ts`.

## Prompts

## Notas
- Rollup do projeto (`computeProjectRollup`): lendo o bundle minificado
  (`@svar-ui/gantt-store/dist/index.js`), a função interna que monta um `summary` sem
  `start`/`end` explícitos (`Tt(e,t)`) faz exatamente min(start)/max(end) dos filhos — mas só entra
  em ação quando o nó *não* traz esses campos, e nunca calcula `progress` (não existe agregação de
  progresso na versão instalada, `autoProgress` do `ISummaryConfig` não tem efeito). Decidimos
  computar `start`/`end`/`progress` explicitamente do lado do app (`computeProjectRollup`, testado
  em `gantt.test.ts`) em vez de confiar no cálculo interno da lib — mais previsível, testável sem
  montar a lib, e cobre o `progress` que ela não calcula.
- Estilo visual de marco e rollup (`GanttBarContent`): confirmado no mesmo bundle que a lib **já
  desenha** o losango de marco (`<div class="wx-content">` vazio, inserido pela própria lib antes do
  slot de `taskTemplate`, estilizado via CSS `.wx-milestone .wx-content{transform:rotate(45deg)...}`)
  e o preenchimento de progresso do rollup (`.wx-progress-wrapper`/`.wx-progress-percent`, cor
  `--wx-gantt-summary-fill-color`), como irmãos do `taskTemplate`, sempre que o nó tem `progress`
  definido — nenhum dos dois é algo que `taskTemplate` precise desenhar. O código de
  `GanttBarContent` já estava correto (branch de milestone só substitui o rótulo de texto, igual ao
  default) — só documentado com um comentário maior citando a fonte, pra não parecer código morto
  no futuro.
- Zoom direto pro nível X (`jumpToGanttZoomLevel`, `gantt.ts`): a ação pública `zoom-scale` só
  aceita um `dir` relativo. Lendo `changeScale` no bundle, ela calcula `novoNível = zoom.level + dir`
  diretamente — então um `dir` grande já *poderia* saltar vários níveis numa chamada só — mas só
  troca de nível de fato quando a largura de célula recalculada (que depende de `dir` e da largura
  atual) sai da faixa `[minCellWidth, maxCellWidth]` do nível atual; pra um delta pequeno isso pode
  não acontecer numa chamada. Implementado como um loop que recalcula `dir` a cada volta a partir do
  nível real (nunca assume que a chamada anterior funcionou) — converge tanto no caso "um `dir`
  grande já basta" quanto no caso "precisa de várias chamadas", testado com um mock que simula os
  dois cenários (`gantt.test.ts`).
- `IScaleLevel` (tipo de cada preset de zoom) não é re-exportado por `@svar-ui/react-gantt` (a
  lista curada de `export type {...}` em `@svar-ui/gantt-store/dist/types/index.d.ts` não inclui
  esse tipo, embora ele exista em `types.d.ts`). Em vez de importar via caminho interno do pacote
  (frágil a mudanças de versão), `GanttChart.tsx` define `GanttScaleConfig`/`GanttZoomLevel`
  localmente, estruturalmente compatíveis com o que `<Gantt zoom={{levels}} />` espera.
- Testar `GanttChart.tsx` montando o `<Gantt>` de verdade não funciona em jsdom: a lib usa
  `<canvas>` internamente e crasha (`getContext()` não implementado sem o pacote nativo `canvas`,
  que não foi adicionado como dependência). `GanttChart.test.tsx` mocka `@svar-ui/react-gantt`
  inteiro (um componente fake que só chama `init(api)` com um `api` mínimo e expõe os props
  recebidos) pra testar a fiação real do componente (toggle de modo, botões de zoom) sem depender do
  motor de render da lib — a lógica de verdade por trás dessa fiação (`buildGanttNodes`,
  `jumpToGanttZoomLevel`) já tem cobertura direta e mais barata em `gantt.test.ts`.
- `src/lib/__tests__/currency.test.ts` tem 2 falhas pré-existentes (`formatDateBR`/
  `formatDateTimeBR` esperando "—" e recebendo "·") — `git diff` confirma que nenhum arquivo dessa
  área foi tocado por esta feature; parece um problema de encoding do ambiente, não uma regressão
  introduzida aqui. Não corrigido (fora do escopo desta feature).
