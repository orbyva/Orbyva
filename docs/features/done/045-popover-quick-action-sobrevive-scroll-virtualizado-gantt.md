---
prompt: |
  - o calendário do quick action para adicionar prazo está tendo um problema de renderização, na
    visualização de gannt, pode ter algo
---

# 045 — Popover de quick action não quebra com o scroll virtualizado do Gantt

## Contexto
Investigação de código (sem navegador — leitura da lib real em `node_modules/@svar-ui/react-grid`)
descartou a hipótese óbvia de "Popover dentro de Popover quebra" — esse aninhamento (popover de
quick actions da feature `done/039` → `TaskDueQuickEdit` → `TaskDurationQuickPick`, até 3 níveis)
já roda sem problema em Lista/Kanban hoje, e o `PopoverContent` (Radix, `src/components/ui/
popover.tsx`) é sempre portalizado pra `document.body` com `z-50` uniforme — não há conflito de
z-index/stacking entre os níveis.

A causa raiz mais provável é específica do Gantt e não tem equivalente em Lista/Kanban: o grid da
lib (`@svar-ui/react-grid`, usado internamente por `@svar-ui/react-gantt`) **virtualiza linhas** —
só renderiza as linhas dentro da janela visível + um overscan de 2 linhas
(`node_modules/@svar-ui/react-grid/dist/index.es.js:1377-1378,1466`). O container do Gantt tem
altura fixa com scroll interno (`div h-[600px] overflow-hidden`, `GanttChart.tsx`). O `Popover` de
quick actions (`GanttTaskNameCell`, `GanttChart.tsx:194-220`) usa estado local não-controlado
(`useState` do Radix) — vive na árvore React daquela linha específica. Assim que a linha sai da
janela virtualizada (por qualquer scroll vertical do grid, mesmo pequeno, dado o overscan curto de
2 linhas), React desmonta o nó inteiro daquela linha — inclusive o `Popover` de quick actions e
qualquer popover aninhado (calendário/duração) que estivesse aberto ali. Como o `PopoverContent`
já foi portalizado pra `document.body` (fisicamente desacoplado da linha), o resultado visual é um
popover que fecha abruptamente, "flasha", ou fica preso numa posição sem trigger vivo por trás —
o "problema de renderização" relatado, específico da visualização de Gantt.

## Decisões
- **Fechar o popover de quick actions proativamente quando o grid do Gantt rola**, em vez de
  deixar o desmonte da linha virtualizada acontecer com o popover aberto e gerar o estado quebrado.
  Esse é o padrão robusto e comum pra popovers ancorados dentro de containers com scroll interno/
  conteúdo virtualizado (fechar ao rolar é comportamento esperado, não uma limitação nova) —
  não depende de mexer em internals da lib do Gantt.
- Implementação: `GanttChart.tsx` passa a controlar explicitamente **qual tarefa** tem o popover
  de quick actions aberto (estado no componente `GanttChart`, ex. `openQuickActionsTaskId`, ao
  invés de cada `GanttTaskNameCell` gerenciar seu próprio `open` local via `Popover` não-
  controlado). O `Popover` de `GanttTaskNameCell` vira controlado
  (`open={openQuickActionsTaskId === row.id}` / `onOpenChange`), e um listener de `scroll` no
  container do Gantt (`div h-[600px] overflow-hidden`, ou o elemento de scroll real da lib —
  confirmar na implementação qual é o elemento que de fato rola, pode ser um filho interno da lib)
  fecha o popover aberto (`setOpenQuickActionsTaskId(null)`) ao detectar scroll.
- Isso resolve o sintoma pra qualquer um dos 3 níveis de popover aninhado (quick actions → prazo
  → duração) de uma vez: fechando o popover externo, os internos fecham junto (são filhos dele na
  árvore).
- **Fora de escopo**: reduzir o aninhamento de popovers em si (não há evidência de que isso seja o
  problema — ver Contexto) e mexer em internals/configuração de virtualização da lib
  (`@svar-ui/react-grid`) — a lib não expõe isso como prop pública documentada em `@svar-ui/
  react-gantt`, e forçar renderização não-virtualizada teria custo de performance em listas
  grandes, sem necessidade já que fechar no scroll resolve o sintoma real.
- Verificação automatizada realista (sem navegador): simular no teste de componente
  (`GanttChart.test.tsx`, já mocka a lib) um evento de `scroll` no container do Gantt enquanto o
  popover de quick actions está aberto, e afirmar que o `PopoverContent` deixa de estar no
  documento depois do evento — prova o mecanismo de fechamento, mesmo sem poder reproduzir a
  virtualização real da lib (que é mockada nos testes). Isso não prova 100% que o bug original
  desaparece no navegador real (a lib real não roda em jsdom), mas prova que a defesa está
  implementada corretamente — condizente com a skill `next` (nunca Chrome; tratar checagem visual
  como sinal de que falta esse tipo de teste de mecanismo).
- Pedir confirmação do usuário no navegador continua necessário pra fechar o loop de verdade
  (documentar isso como nota, não como tarefa bloqueante — o projeto já trata testes manuais como
  responsabilidade do usuário, não do agente).

## Tarefas
- [x] Confirmar, lendo `GanttChart.tsx` e o CSS/estrutura montada pela lib no DOM (via os arquivos
      já lidos na investigação, `node_modules/@svar-ui/react-grid/dist/index.es.js`), qual elemento
      é o container que de fato recebe o evento de scroll do grid (pode não ser o `div
      h-[600px] overflow-hidden` do app, se a lib tiver seu próprio elemento scrollável interno).
- [x] Em `GanttChart.tsx`, elevar o estado de "qual tarefa tem o popover de quick actions aberto"
      pro componente `GanttChart` (fora da célula virtualizada), tornando o `Popover` de
      `GanttTaskNameCell` controlado (`open`/`onOpenChange`) em vez de não-controlado.
- [x] Adicionar um listener de `scroll` no elemento correto (identificado na tarefa 1) que fecha o
      popover de quick actions aberto (`setOpenQuickActionsTaskId(null)` ou equivalente),
      registrado/removido corretamente no ciclo de vida do componente (`useEffect` com cleanup).
- [x] Teste de componente (`GanttChart.test.tsx`, seguir o padrão dos testes de fiação já
      existentes da feature `044`): abrir o popover de quick actions numa tarefa, disparar um
      evento de `scroll` no container correto, e afirmar que o `PopoverContent` (e qualquer popover
      aninhado que estivesse aberto dentro dele, ex. calendário de prazo) deixa de estar presente
      no documento.
- [x] Teste de componente: confirmar que abrir o popover de uma tarefa e depois abrir o de OUTRA
      tarefa fecha o primeiro corretamente (comportamento de popover controlado único, não deixar
      dois abertos ao mesmo tempo por acidente da elevação de estado).
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- Tarefa 1 (elemento que recebe o scroll de verdade): confirmado lendo
  `node_modules/@svar-ui/react-grid/dist/index.es.js` que a lib cria seu próprio `div.wx-scroll`
  interno (`overflowY: scroll`, `onScroll` handler próprio) dentro do grid — o `div h-[600px]
  overflow-hidden` deste app (`GanttChart.tsx`) só recorta visualmente, não é ele que rola. Como
  esse elemento interno é criado dinamicamente pela lib e não é exposto de forma estável via `IApi`
  (nem por seletor de classe garantido entre versões), a solução foi registrar o listener de
  `scroll` no `div` deste app com `{ capture: true }`: eventos `scroll` não fazem bubbling, mas a
  fase de captura (topo → alvo) sempre passa por qualquer ancestral com `capture: true`,
  independente do `bubbles` do evento — captura o scroll de qualquer elemento interno da lib que
  role de verdade (o `wx-scroll` do grid, e qualquer outro que a lib crie no futuro), sem depender
  de detalhes de implementação internos que podem mudar em atualizações do pacote.
- Efeito de re-anexação do listener depende de `focusedDay` (não `[]`): o `div` do container some da
  árvore quando o usuário "Foca um dia" (feature 038, substitui o Gantt pela grade de horas) e volta
  quando desfoca — sem essa dependência, o listener registrado na montagem ficaria órfão (o node a
  que se ligou nunca mais existe) na primeira vez que o usuário volta ao Gantt.
- `npm test` (suíte completa) rodou com 2 falhas pré-existentes e não relacionadas em
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` retornam `"·"` em vez de
  `"—"` — bug real em `src/lib/currency.ts:50`, provavelmente de um merge anterior). Nenhum arquivo
  desse teste/lib foi tocado nesta feature (`git diff` confirma) — falha pré-existente, fora de
  escopo de 045, não bloqueia mover pra `done/`. Vale abrir uma feature separada pra corrigir.
- Confirmação manual no navegador do bug original ainda não foi feita (fora do escopo do agente,
  Chrome bloqueado neste fluxo por regra do projeto) — pendente pro usuário testar manualmente.
