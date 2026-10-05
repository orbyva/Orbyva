---
prompt: |-
  Pedido do usuário, verbatim (05/10/26) — ver o pedido completo no frontmatter da 250.

  Fatia desta feature: "Visão Gantt (na lista e na aba do projeto)" e "Dependências entre
  tarefas".
---

# 253 — Mobile: Gantt com marcos e dependências

Depende de: 252 (campo Marco).

## Contexto
- Web: `GanttChart.tsx` (barras por prazo/duração, marco como losango, setas de dependência,
  criar/remover dependência). Usado em `TaskList` (`view=gantt`) e na aba `gantt` do projeto.
- Mobile: tarefas têm Lista/Kanban/Feitas; projeto tem Lista/Kanban/Compras/Notas. Nada de
  `task_dependency`.

## Decisões
- Gantt nativo em `react-native-svg` com rolagem horizontal; layout (posição das barras, faixa de
  datas, pontos das setas) em função pura testada em `mobile/src/domain/tasks/gantt.ts`.
- Dependência no celular: arrastar barra para barra não é ergonômico; tocar na barra abre um
  painel com "Depende de…" (adicionar/remover) — mesmo dado `task_dependency` do web.
- Arrastar para mudar datas fica fora desta rodada (o web permite; no celular rolar e arrastar
  disputam o mesmo gesto).

## Tarefas
- [x] API mobile `fetchDependencies` / `createDependency` / `deleteDependency` + teste.
- [x] Domínio `gantt.ts` (faixa de datas, barra por tarefa, marco, pontos de seta) + teste.
- [x] Componente `TasksGantt` (svg, rolagem horizontal, hoje marcado, setas).
- [x] Painel da barra: abrir tarefa, adicionar/remover dependência.
- [x] Aba "Gantt" em Tarefas e no detalhe do projeto.
- [x] Atualizar o guia do módulo se o texto divergir.

## Prompts
(vazio até haver iteração nova)

## Notas
- Desvio do planejado: "tarefa sem prazo não aparece" estava errado — o web mostra com a âncora de
  hoje (`resolveTaskSchedule`, portado para `mobile/src/domain/tasks/duration.ts`). O mobile segue
  o web: barra tracejada.
- O mobile recusa dependência que fecharia ciclo (`wouldCreateCycle`); o web não checa. A opção
  simplesmente não aparece no seletor.
- Guia do módulo já citava Gantt — agora é verdade; texto mantido.
- Componente `TasksGantt` sem teste de render (o mobile não tem harness); posições, faixa, setas e
  candidatos estão em `domain/tasks/gantt.ts`, testado.

## Como testar

1. **Automatizado**: `cd mobile && npx vitest run --config ./vitest.config.ts gantt dependencies`.
2. **Manual**: Tarefas → Gantt → barras nas datas certas, marco como losango, linha de hoje. Toque
   numa barra → "Depende de…" → escolha outra tarefa → seta aparece. Remova → seta some. Mesmo
   fluxo na aba Gantt de um projeto. Confira no web que a dependência criada no celular aparece.
3. **Borda**: tarefa sem data aparece como barra tracejada ancorada em hoje (igual ao web); tentar ligar uma dependência que fecharia ciclo — a tarefa nem aparece na lista de opções.
