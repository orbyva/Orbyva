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
- [x] Instalar `date-fns` — já estava instalado (chegou via merge de `master`, provavelmente pela
      feature de Viagens); só bump de versão
- [x] `domain/tasks/calendar.ts`: `computeMonthGridDays` (grade de semanas completas) +
      `groupCalendarItemsByDay` (agrupa tarefas por `due_date` + eventos por `starts_at` — convertido
      pro dia local via `Date`, nunca fatiando a string ISO UTC crua — ordenados por horário); 5
      testes Vitest, incluindo um caso específico de fuso horário
- [x] Página `/tasks/agenda` (`AgendaCalendar.tsx`): grade mensal, cabeçalho de dias da semana,
      navegação de mês + botão "Hoje", destaque do dia atual, até 3 chips por dia + "+N mais"
- [x] Modal de detalhe do dia (lista completa, já ordenada por hora pela função de domínio)
- [x] Chip de tarefa (bolinha colorida por status + ícone `DollarSign` quando `linked_recurring_id`
      setado) — clique abre `CalendarTaskDialog`
- [x] Chip de evento de projeto (bolinha na cor do projeto) — clique abre dialog de
      visualizar/excluir + link "Ir para o projeto"
- [x] Filtro por projeto acima da grade
- [x] Item novo "Agenda" na sidebar (entre Tarefas e Projetos) + rota `/tasks/agenda`
- [x] `npm run build && npm run lint` limpos (359 testes Vitest passando, 0 erros de lint, `tsc -b`
      limpo)
- [ ] Verificação manual no navegador (concluir pelo calendário uma tarefa vinculada a Recorrência
      Financeira reflete em Finanças; evento de projeto visível e editável pelo calendário; filtro
      por projeto funcionando) — **bloqueada**: sem credenciais de login disponíveis nesta sessão,
      mesmo bloqueio já registrado nas features 009, 011, 012 e 015

## Notas
- Dependia da feature 015 já ter removido as abas Agenda antigas — implementada depois dela na
  ordem escolhida, sem conflito.
- `due_time` (feature 009, já implementada) já está disponível — ordenação por hora dentro do dia
  funciona de verdade, não só "ordem estável sem hora" como a Nota original previa como cenário
  alternativo.
- **Dialog de edição de tarefa do calendário não é o dialog completo** (o mesmo usado em
  `TaskList.tsx`/`ProjectDetail.tsx`, com projeto/tags/recorrência/subtarefas) — é um
  `CalendarTaskDialog` enxuto (Título/Descrição/Prazo+Horário/Prioridade/círculo de conclusão), com
  um link "edite em Tarefas" para o resto. A decisão original dizia "mesmo dialog de edição de
  tarefa usado em todo o resto do app", que exigiria extrair um `TaskFormDialog` compartilhado (essa
  seria a 3ª cópia do dialog completo, hoje duplicado entre `TaskList.tsx`/`ProjectDetail.tsx` por
  decisão aceita desde a feature 002). Optei pela versão enxuta — menor risco de mexer nos dois
  dialogs já em produção nesta rodada, ainda cobre a rastreabilidade bilateral pedida (ver e
  concluir a tarefa, inclusive as vinculadas a Finanças, direto do calendário). Vale reavaliar com o
  usuário se compensa extrair um `TaskFormDialog` de verdade agora que existem 3 variações do
  formulário de tarefa (completo x2, enxuto de subtarefa, enxuto de calendário).
- Evento de projeto no calendário é só visualizar + excluir (sem editar em linha) — mesma decisão
  já tomada na feature 006 para o mini-formulário dentro do dialog de projeto ("excluir e recriar
  cobre o caso de uso por ora"), mantida aqui por consistência.
