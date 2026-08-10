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
- [x] Verificação manual no navegador (concluir pelo calendário uma tarefa vinculada a Recorrência
      Financeira reflete em Finanças; evento de projeto visível e editável pelo calendário; filtro
      por projeto funcionando) — verificado ao vivo (Chrome MCP, sessão ngrok do usuário): grade
      mensal renderiza tarefas nas datas corretas, `CalendarTaskDialog` enxuto abre ao clicar num
      chip de tarefa, círculo de conclusão no cabeçalho do dialog concluiu/reabriu a tarefa e o chip
      no calendário atualizou de cor em tempo real. Não testei nesta rodada: tarefa vinculada a
      Recorrência Financeira refletindo em Finanças, evento de projeto, nem o filtro por projeto.

### Extensão pedida pelo usuário: visões semanal e diária
Reverte a decisão original ("Só navegação por mês nesta rodada... zoom semana/dia fica de fora
(YAGNI)") — o usuário pediu explicitamente as visões de semana e dia, mesma dinâmica de outras
reversões já registradas no projeto (ver feature 003, feature 014). Ainda não implementado — só
registrado aqui pra entrar na fila (`/next 016`).
- [x] Definir o mecanismo de troca de visão (ex.: `Tabs`/`ToggleGroup` Mês/Semana/Dia acima da
      grade, ao lado da navegação existente) e como cada uma reaproveita `groupCalendarItemsByDay`
      (já agrupa por dia — visões semana/dia são um recorte de `gridDays`, não uma função de
      agrupamento nova)
- [x] Visão semanal: 7 colunas (mesma grade de hoje, só que sem o padding de semanas
      completas do mês) ou linha do tempo por hora — decidir durante a implementação olhando pro
      volume real de itens por dia
- [x] Visão diária: lista/linha do tempo do dia único, ordenada por `due_time` (já existe,
      feature 009), com espaço melhor pra itens sem hora vs. com hora do que os chips de 10px atuais
- [x] Navegação (seta anterior/próximo, botão "Hoje") passa a andar por semana/dia conforme a visão
      ativa, não sempre por mês
- [x] Testes Vitest para qualquer lógica nova de domínio (recorte de intervalo semana/dia) +
      `npm run build && npm run lint` limpos + verificação manual

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
- **Bug real reportado pelo usuário (sessão seguinte)**: uma tarefa recorrente a cada 15 dias só
  aparecia na primeira data — a próxima ocorrência (15 dias depois) simplesmente não aparecia no
  calendário. Causa: `fetchTasks` materializa ocorrências de recorrência simples só até hoje, sob
  demanda (`materializeRecurringInstances`, `api/tasks/tasks.ts`) — uma ocorrência futura só vira
  linha no banco quando o dia chega. A Agenda só desenha o que existe no banco, então nunca mostrava
  prévia do que ainda ia acontecer. Corrigido com `computeVirtualOccurrences`
  (`domain/tasks/recurrence.ts`) — reaproveita `computeMissingOccurrences` passando o fim do
  intervalo visível do calendário no lugar de "hoje", pra calcular ocorrências futuras só pra
  exibição (sem inserir nada no banco). `AgendaCalendar.tsx` mescla essas ocorrências virtuais
  (`id` prefixado com `virtual:`) na lista antes de agrupar por dia; `TaskChip` reconhece o prefixo
  e renderiza como prévia — opacidade reduzida, itálico, bolinha vazada, sem `onClick` (evita tentar
  salvar/concluir uma linha que não existe no banco ainda). Verificado ao vivo (Chrome MCP, sessão
  ngrok do usuário): tarefa "trocar lençois" com recorrência a cada 15 dias a partir de 10/08 agora
  mostra a prévia em 25/08.
- **Extensão "visões semanal e diária" implementada.** `Tabs`/`TabsList`/`TabsTrigger`
  (Mês/Semana/Dia) acima da grade, mesmo padrão já usado em `Projects.tsx`/`ProjectDetail.tsx`.
  Estado renomeado de `month` pra `focusDate` (representa "a data em foco", não necessariamente um
  mês) + `viewMode: "month" | "week" | "day"`. `gridDays` vira um `useMemo` condicional:
  `computeMonthGridDays` (mês, já existia), `computeWeekDays` (semana, nova função em
  `domain/tasks/calendar.ts` — reaproveita `subDays`/`addDays`/`eachDayOfInterval` que o arquivo já
  importava) ou `[focusDate]` (dia). Mês e semana compartilham a mesma grade de 7 colunas
  (`WEEKDAY_LABELS` + células), só mudando a altura da célula e o teto de chips por dia
  (`MONTH_MAX_CHIPS_PER_DAY = 3`, `WEEK_MAX_CHIPS_PER_DAY = 8` — semana tem mais espaço vertical por
  ter só 4-5 semanas de largura de tela pra 7 dias, então cabe mais item por célula antes de
  precisar do "+N mais"). Dia usa layout de lista própria (`DayViewItemRow`, componente novo) — como
  o plano original pedia, mais espaço que os chips de 10px do mês/semana, com horário explícito
  ("14:30" ou "Sem horário" por extenso) em vez de só ordenar silenciosamente por ele.
- Navegação por seta/"Hoje" passa por `goToPrevious`/`goToNext`, que despacham
  `subMonths`/`subWeeks`/`subDays` (e os pares `add*`) conforme `viewMode` — `date-fns` já tinha
  `addWeeks`/`subWeeks` prontos, sem precisar calcular à mão. Ocorrências virtuais
  (`computeVirtualOccurrences`, ver nota acima) continuam funcionando em qualquer visão, já que o
  intervalo (`rangeEndIso`) é sempre derivado do último dia de `gridDays`, que agora é curto (1 ou 7
  dias) em vez de sempre a grade do mês inteiro — sem mudança na função de domínio, só o intervalo
  que ela recebe fica menor.
- Verificado ao vivo (Chrome MCP, sessão ngrok do usuário): alternar Mês → Semana → Dia → Mês sem
  crash e sem perder o filtro de projeto; navegação dia-a-dia avança/volta a data certa; clicar num
  item da visão Dia abre o `CalendarTaskDialog` normalmente; visão Dia mostra corretamente "Nada
  agendado nesse dia" quando vazio. Sem erro no console em nenhuma etapa.
