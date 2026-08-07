# 016 — Nova seção "Agenda" (calendário) em Produtividade

## Contexto
Pedido do usuário: uma seção própria "Agenda" dentro de Produtividade (irmã de Tarefas/Projetos/
Live, não uma aba dentro de Tarefas — ver feature 015, que remove as abas Agenda existentes) que
seja de fato um calendário. Nela devem aparecer: tarefas a fazer (por `due_date`), eventos de
projeto (`project_event`, existe desde a feature 006 mas hoje só aparece como preview de "próximo
evento" no card do projeto — nunca num calendário de verdade), e itens vinculados ao módulo
financeiro (`task.linked_recurring_id`, feature 002 — ex. "pagar conta de luz todo dia 20")
marcados visualmente, de modo que concluir ali já lance o registro em Finanças. Reunião de um
projeto específico deve aparecer já identificada com aquele projeto. O usuário pede
"rastreabilidade bilateral em tudo" — poder ir do calendário pro registro de origem (tarefa,
evento, lançamento financeiro) e vice-versa. Filtro por projeto substitui o que a aba Agenda de
dentro de um projeto fazia (removida na feature 015).

Pesquisa de referência de design, a pedido do usuário: `smartminutes` (repo irmão) tem uma grade
mensal de calendário de verdade, construída à mão com `date-fns`, em
`src/pages/Meetings.tsx` (função `CalendarView`, linhas 551-824) — grade de 7 colunas
(`startOfMonth`/`endOfMonth`/`eachDayOfInterval`/`getDay` pro padding), até 3 chips por dia
(bolinha de cor por status + título), pill "+N mais" que abre um modal com a lista completa do dia
ordenada por horário, destaque do dia atual, legenda de cores no rodapé. Existe também
`src/components/meeting/MeetingCalendarView.tsx`/`ViewModeSelector.tsx` no mesmo repo — uma versão
mais polida do mesmo conceito (Tooltip/badges do shadcn) que não está conectada a nenhuma página
lá, mas é visualmente a referência mais rica das duas.

## Decisões
- **Página nova `/tasks/agenda`**, item próprio na sidebar dentro do grupo "Produtividade" (ao lado
  de Tarefas/Projetos/Live).
- **Grade mensal construída à mão**, seguindo o padrão do `CalendarView` do smartminutes — sem lib
  de calendário externa. Adota `date-fns` como dependência nova (matemática de grade de mês:
  `startOfMonth`/`endOfMonth`/`eachDayOfInterval`/`getDay`) — biblioteca pequena e madura, não tem o
  mesmo peso de decisão que a lib de Gantt da feature 014.
- **Três tipos de item na mesma grade**, distinguidos visualmente (bolinha/chip colorido, mesmo
  princípio do `STATUS_META` do smartminutes):
  - Tarefas com `due_date` — cor pelo status (todo/doing/done, mesma paleta do Kanban).
  - `project_event` (por `starts_at`) — cor/rótulo pela cor do projeto (`Project.color`, feature
    006).
  - Tarefas com `linked_recurring_id` setado ganham um ícone extra (cifrão pequeno) sobre o próprio
    chip de tarefa — não é um item à parte, é a mesma tarefa com um marcador visual.
- **Até N chips por dia + "+N mais"** abre um modal/drawer com a lista completa daquele dia,
  ordenada por horário quando houver `due_time` (feature 009) — mesmo padrão do smartminutes.
- **Rastreabilidade bilateral, sem sincronização nova**:
  - Clicar num chip de tarefa abre o mesmo dialog de edição de tarefa usado em todo o resto do app.
    Concluir por ali (círculo de conclusão, mesmo padrão da feature 015) já dispara o sync
    bidirecional que a feature 002 implementou para tarefas vinculadas a Recorrência Financeira —
    nenhum código de sync novo, o calendário só chama a ação de conclusão que já existe.
  - Clicar num chip de evento de projeto abre o mini-formulário de evento (hoje só alcançável de
    dentro do dialog de edição do projeto, feature 006) — esta feature promove esse formulário pra
    também abrir a partir do calendário, escrevendo na mesma `api/tasks/projectEvents.ts`.
  - Associação com projeto é só visual (cor) — não navega automaticamente ao clicar no chip (evitaria
    conflito com "abrir pra editar" como ação principal); o modal de dia tem um link/botão à parte
    pra ir até `/tasks/projects/:id`.
- **Filtro por projeto** acima da grade (reaproveita a lista de projetos já buscada em outras
  páginas) — filtra quais chips aparecem. É o substituto direto da aba Agenda que existia dentro de
  cada projeto (removida na feature 015).
- **Só navegação por mês nesta rodada** (mês anterior/seguinte, botão "Hoje") — zoom
  semana/dia fica de fora (YAGNI; o próprio `CalendarView` do smartminutes também só tem visão
  mensal).
- Fora de escopo: criar tarefa/evento clicando direto num dia vazio da grade (o botão global "Nova
  tarefa", já planejado na feature 011, cobre criação); drag-and-drop pra reagendar direto na grade;
  sincronizar com calendários externos (Google/Outlook) — nada disso foi pedido.

## Tarefas
- [ ] Instalar `date-fns`
- [ ] `domain/tasks/calendar.ts`: função pura que agrupa tarefas + eventos de projeto num mapa por
      dia (`yyyy-MM-dd`), dado um mês e uma lista de projetos filtrados; testes Vitest
- [ ] Página `/tasks/agenda`: grade mensal (cabeçalho de dias da semana, navegação de mês, destaque
      do dia atual, até N chips por dia + "+N mais")
- [ ] Modal/drawer de detalhe do dia (lista completa, ordenada por hora quando houver `due_time`)
- [ ] Chip de tarefa (cor por status + ícone quando `linked_recurring_id` setado) — clique abre o
      dialog de edição de tarefa já existente
- [ ] Chip de evento de projeto (cor/rótulo do projeto) — clique abre o mini-formulário de evento,
      promovido pra fora do dialog de projeto
- [ ] Filtro por projeto acima da grade
- [ ] Item novo "Agenda" na sidebar, grupo Produtividade
- [ ] `npm run build && npm run lint` limpos + verificação manual (concluir pelo calendário uma
      tarefa vinculada a Recorrência Financeira reflete em Finanças; evento de projeto visível e
      editável pelo calendário; filtro por projeto funcionando)

## Notas
- Depende da feature 015 já ter removido as abas Agenda antigas (ou pode ser implementada em
  paralelo/antes — não há bloqueio técnico real entre as duas, só sobreposição de conceito).
- `due_time` (ordenação por hora dentro do dia) depende da feature 009; sem ela, itens do mesmo dia
  ficam em ordem estável mas sem hora.
