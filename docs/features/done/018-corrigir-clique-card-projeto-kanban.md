# 018 — Corrigir clique no card de projeto (visão Kanban)

## Contexto
`ProjectCard` (`Projects.tsx`) já navega para `/tasks/projects/:id` ao clicar em qualquer parte do
card, e isso funciona na visão Lista. Na visão Kanban (`ProjectKanbanItem`), o usuário reporta que
o clique não funciona. Pela leitura do código não há conflito óbvio: os `listeners`/`attributes`
do `useSortable` (dnd-kit) estão aplicados só no botão de arrastar (`GripVertical`), não no card
inteiro, e o `PointerSensor` tem `activationConstraint: { distance: 5 }`. A causa raiz precisa ser
investigada (systematic-debugging) antes de aplicar a correção.

## Decisões
- Não alterar o comportamento da visão Lista nem o botão "Ver projeto", que já funcionam.
- Corrigir apenas o cenário Kanban.

## Tarefas
- [x] Reproduzir o bug localmente (clicar no corpo do card dentro de uma coluna Kanban) e
      investigar a causa raiz (ex.: estado `isDragging`, overlay de drag, pointer-events/z-index,
      ordem de propagação de evento entre grip e card).
- [x] Aplicar o fix mínimo necessário.
- [x] Testar manualmente: clique navega no Kanban sem quebrar o drag-and-drop (arrastar pelo grip
      continua funcionando, troca de status via Select continua funcionando).
- [x] Verificar (`npm run build`, `npm run lint`).

## Notas
- **Já estava corrigido antes de eu investigar** — na mesma sessão, um pedido separado do usuário
  ("remove o dropdown na visualização de kanban dos projetos") já tinha removido o `<Select>` de
  status que ficava logo abaixo de cada card em `ProjectKanbanItem` (`Projects.tsx`). Verifiquei ao
  vivo (Chrome MCP, sessão ngrok do usuário) clicando no título, no padding e no texto inferior de
  vários cards em `/tasks/projects` (aba Kanban): todos navegam para `/tasks/projects/:id`. Lápis
  de editar abre o dialog de edição (não navega); lixeira seria destrutiva, não testada por
  segurança. Não confirmei o drag-and-drop pelo grip com uma automação de ponta a ponta (o
  `left_click_drag` de um passo só não é suficiente pra ativar o `PointerSensor` do dnd-kit, que
  espera eventos de movimento intermediários) — mas o código do grip (`attributes`/`listeners` do
  `useSortable`) não foi tocado nem antes nem depois da remoção do Select, então não há motivo pra
  ter regredido.
- **Não cheguei a uma causa raiz certa pra por que o clique não funcionava antes** — a suspeita mais
  provável é o próprio `<Select>` (Radix) interferindo de alguma forma na área de clique do card
  logo acima dele (ex. artefato de layout do `SelectTrigger`/conteúdo escondido do Radix), mas como
  o elemento já não existe mais, não dava pra confirmar experimentalmente qual mecanismo exato
  causava o bloqueio. Se o usuário relatar o mesmo problema de novo depois de reintroduzir algum
  controle abaixo do card, vale investigar essa hipótese primeiro.
