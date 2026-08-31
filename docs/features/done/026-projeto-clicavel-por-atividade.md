---
prompt: |
  Ao criar uma nova tarefa, deve ser necessário já ter uma lista dos projetos, não um dropdown. a seleção de projeto deve acontecer em 1 clique, já com os projetos mais frequentes, em primeiro, que estão recebendo mais criação de tarefa, ou os projetos que estão tendo mais, estruture isso já de maneira eficiente, para que eu possa já construir um conjunto de informações a respeito desses dados, já uma estrutura de classes, objetos, vse necessário views de suporte, queries para construção de dashboards. de maneira que também sirva para
---

# 026 — Seleção de projeto em 1 clique, ordenada por atividade

## Contexto
No formulário de criação/edição de tarefa (`TaskList.tsx`, aba Geral, linhas 791-811), o campo
Projeto é um `<Select>` (dropdown) listando `projects` na ordem em que `fetchProjects()`
(`src/api/tasks/projects.ts:9-18`) devolve — `order("created_at", { ascending: false })`, ou seja,
projeto mais recentemente *criado* primeiro, não o mais *ativo*. Não existe hoje nenhum campo ou
query que meça "atividade" de um projeto (contagem de tarefas, criação recente de tarefas etc.) —
`Project` (`src/types/tasks.ts:3-15`) não tem contador algum, e o único agregado parecido já existente
é `topOngoingTasksForProject` (`src/domain/tasks/projects.ts:16-29`), que só pega as N tarefas em
andamento mais próximas do prazo dentro de um projeto já escolhido — não serve para ranquear projetos
entre si.

Pedido do usuário: trocar o dropdown por uma lista clicável (1 clique), com os projetos
mais frequentes/ativos (mais criação de tarefa) aparecendo primeiro — e estruturar os dados/queries de
suporte de um jeito que sirva de base para dashboards futuros.

**Sobreposição com a feature 025** (`todo/025-...md`): aquela feature também lista todos os projetos
(numa coluna nova em `/tasks`, para filtrar) e cita clique como interação. As duas mexem em "como o
usuário escolhe/filtra por projeto na tela de Tarefas", mas em pontos diferentes — 025 é a *coluna de
filtro* da tela de Tarefas, 026 é o *campo de seleção* dentro do formulário de criar tarefa. Tratadas
como features independentes por decisão do usuário; a função de ranqueamento por atividade criada
aqui pode ser reaproveitada por 025 depois, se fizer sentido.

## Decisões
- **Métrica de atividade (v1)**: contagem de tarefas de topo (não-subtarefa) por `project_id`, com
  `created_at` da tarefa mais recente do projeto como critério de desempate — mesma leitura de "mais
  frequente/ativo" que o pedido original ("projetos que estão recebendo mais criação de tarefa").
  Projetos sem nenhuma tarefa ficam por último, ordenados por `created_at` do próprio projeto (mesmo
  fallback de hoje). Ambiguidade aceitável para a implementação decidir variações (ex. janela de
  tempo) se necessário — mas o padrão é contagem total, sem janela, para manter simples na v1.
- **Cálculo client-side, sem query nova**: `TaskList.tsx` já carrega a lista completa de `tasks` em
  memória (`fetchTasks()`, usada para outros agregados client-side como `subtasksByParent` e
  `topLevelByStatus`, linhas 235-255) — a contagem por projeto usa os mesmos dados já em memória via
  `useMemo`, sem endpoint/verificação nova. Uma view/query no banco (ex.
  `project_task_counts`) fica como próximo passo natural se isso precisar alimentar um dashboard
  dedicado depois — fora de escopo nesta rodada a menos que o cálculo client-side se mostre
  insuficiente (ex. volume de tarefas grande demais para carregar tudo).
- Nova função pura em `src/domain/tasks/projects.ts` (mesmo arquivo de `topOngoingTasksForProject`),
  algo como `rankProjectsByActivity(projects, tasks)`, retornando os projetos ordenados — com teste
  Vitest em `domain/tasks/__tests__/projects.test.ts` (já existe, cobre o mesmo arquivo).
- **UI**: componente novo (ex. `ProjectPicker.tsx`) substituindo o `<Select>` de Projeto em
  `TaskList.tsx` (linhas 791-811) — lista clicável (1 clique seleciona), "Sem projeto" sempre como
  primeira opção (mantém o comportamento atual de permitir tarefa sem projeto), projetos ordenados por
  `rankProjectsByActivity`.
- Só `TaskList.tsx` tem campo Projeto no form de tarefa — `ProjectDetail.tsx` não tem (a tarefa já
  nasce dentro do projeto aberto), então não há duplicação a replicar aqui, diferente de outros campos
  compartilhados entre os dois formulários.
- Sem mudança de schema — é reorganização de UI + agregação client-side sobre dados já existentes.

## Tarefas
- [x] `rankProjectsByActivity(projects, tasks)` em `src/domain/tasks/projects.ts` (contagem de tarefas
      de topo por projeto + desempate por tarefa mais recente) + teste Vitest em `projects.test.ts`
- [x] Criar `ProjectPicker.tsx`: lista clicável de projetos (1 clique seleciona), "Sem projeto" como
      primeira opção, restante ordenado por `rankProjectsByActivity`
- [x] Substituir o `<Select>` de Projeto em `TaskList.tsx` (linhas 791-811) por `ProjectPicker`
- [x] `npm run build && npm run lint` + Vitest + teste manual: abrir "Nova tarefa", conferir que os
      projetos com mais tarefas aparecem primeiro, selecionar um em 1 clique, criar a tarefa e
      confirmar que o vínculo de projeto foi salvo certo

## Prompts
- Nenhum pedido do usuário no meio da implementação — a rodada seguiu só o `prompt:` original acima.

## Notas
- `npm run build`, `npm run lint` e `npx vitest run` (suíte inteira, 493 testes) passam com as
  mudanças. O teste manual no navegador (abrir "Nova tarefa", conferir ordem por atividade,
  selecionar em 1 clique, criar e confirmar o vínculo salvo) não foi feito — a tela `/tasks` exige
  login autenticado (`/login`) e entrar com credenciais está fora do que posso fazer. Precisa de
  verificação manual humana antes de marcar essa tarefa e mover o arquivo para `done/`.
- `ProjectPicker` recebe `projects` já ordenado (calculado via `rankProjectsByActivity(projects,
  tasks)` num `useMemo` em `TaskList.tsx`, ao lado de `projectById`) em vez de ordenar internamente
  — mesma separação de responsabilidades que `ProjectsRail.tsx` já usa (componente só renderiza a
  ordem recebida).
- Conferido: a "coluna de projetos" da feature 025 (`ProjectsRail.tsx`) é um filtro da lista de
  tarefas (`projectFilter`) sem ordenação por atividade — não sobrepõe o campo do formulário de
  criar/editar tarefa que esta feature (026) troca de `<Select>` para `ProjectPicker`. Nenhuma
  tarefa de 026 estava coberta por 025.
- 2026-08-13: teste manual feito via automação de navegador numa sessão logada (ngrok). Confirmado:
  abrir "Nova tarefa" mostra `ProjectPicker` (lista clicável) no lugar do dropdown, "Sem projeto"
  primeiro, clique em "sa.ca.da" seleciona em 1 clique (destaque visual imediato), tarefa criada com
  o vínculo salvo (badge "sa.ca.da" no card da Lista após criar). Checagem de satisfação: `prompt:`
  original ("lista dos projetos, não um dropdown... seleção em 1 clique... projetos mais frequentes
  primeiro") cumprido. Tarefa de teste ("[teste pipeline] verificação 026") excluída após a
  verificação. Movido para `done/`.
