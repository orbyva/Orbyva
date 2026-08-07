# 009 — Datas: recorrência avançada, horário nas tarefas e padronização dd/mm/yyyy

## Contexto
Três pedidos do usuário, todos girando em torno de como o app trata datas. (1) Hoje
`RecurrenceRule` só suporta `daily | weekly | monthly` + `interval`
(`src/types/tasks.ts:44-48`, `src/domain/tasks/recurrence.ts:3-47`) — não dá pra descrever "toda
terça e quinta". (2) Não existe horário: `task.due_date`/`start_date` são `date` puro
(`supabase/migrations/20260803121500_tasks_projects.sql:56`,
`20260807130000_task_start_date.sql:4`), sem campo de hora, nem em recorrentes nem em avulsas.
(3) Formatos de data são inconsistentes pelo app inteiro (não só Produtividade): já existe
`formatDateBR` em `src/lib/currency.ts:49` (`"03/07/2026"`, testado), usado hoje só por
`bookShare.ts`/`tripShare.ts`/`placeShare.ts`/`albumShare.ts` (telas de compartilhamento). No
resto do app, datas aparecem cruas ou via `toLocaleDateString`/`toLocaleString` sem padrão fixo em
pelo menos 14 arquivos fora de Tarefas (`car/*` — 4 arquivos, `finance/Budget.tsx`,
`finance/components/BudgetDuplicateFormDialog.tsx`,
`finance/components/RecurringProjectionChart.tsx`, `home/components/BudgetGauge.tsx`,
`home/components/PieChart.tsx`, `home/FinanceDashboard.tsx`, `life/hubMeta.ts`,
`tasks/Projects.tsx`, `ops/OpsConsole.tsx`) — mais o módulo de Tarefas inteiro, que hoje renderiza
`due_date`/`completed_at` crus (`TaskViews.tsx:122,127,189-191`, `ProjectDetail.tsx:194`,
`TaskList.tsx:389`).

## Decisões

### Recorrência avançada + horário
- **Dias da semana específicos**: `RecurrenceRule` ganha `weekdays?: number[]` (0=domingo…6=sábado),
  só válido quando `frequency === "weekly"`. Sem `weekdays`, comportamento atual é preservado. Com
  `weekdays`, `computeMissingOccurrences` gera uma ocorrência por dia da semana marcado dentro de
  cada janela de `interval` semanas, em vez de saltar a `due_date` inteira por semana — reescreve o
  loop de `weekly`, mantendo `daily`/`monthly` intocados.
- **UI**: no `TaskRecurrenceField`, frequência Semanal ganha um seletor de 7 toggles (D/S/T/Q/Q/S/S).
  Nenhum marcado mantém o comportamento atual; um ou mais ativa o modo `weekdays`.
- **Horário — coluna nova, não migração de tipo**: em vez de trocar `due_date`/`start_date` de
  `date` para `timestamptz` (tocaria toda lógica de bucket/Gantt que assume data pura), adiciona
  `task.due_time` (`time`, nullable). Presente, exibido junto da data (`14/08 09:30`) e usado como
  desempate em ordenações. Ausente, nada muda. Aplica-se a avulsas e a recorrentes.
- **Recorrência + horário**: `RecurrenceRule` ganha `time?: string` (HH:mm), herdado por cada
  ocorrência gerada. Editar uma instância já materializada sobrescreve só aquela ocorrência (mesmo
  princípio de exceção pontual usado para `linked_recurring_id` na feature 002, aqui é local).
- Fora de escopo: lembretes/notificações por horário — só exibição e ordenação.

### Padronização dd/mm/yyyy
- **Reaproveita `formatDateBR`** como função canônica de data curta em todo o app — não cria uma
  segunda função. Se precisar de variante com hora, adiciona `formatDateTimeBR` ao lado, mesmo
  padrão, reaproveitando o `due_time` acima quando fizer sentido.
- **Escopo**: os ~14 arquivos fora de Tarefas listados no Contexto + todo o módulo de Tarefas,
  trocando `toLocaleDateString`/`toLocaleString` sem padrão fixo e datas cruas por
  `formatDateBR`/`formatDateTimeBR`. `Projects.tsx:85-88` (`formatEventDate`, já produz dd/mm) pode
  virar a função central ou ficar como está se o formato já bate — não deve sobrar uma terceira
  função de data fazendo a mesma coisa.
- Timestamps técnicos não visíveis ao usuário (logs, nomes de arquivo) ficam de fora. Sem
  dependência nova (`date-fns` etc.) — `formatDateBR` já resolve com `Date`/`Intl` nativo.

## Tarefas
- [ ] Migration: `task.due_time` (`time`, nullable) — aplicada ao banco remoto
- [ ] Types: `RecurrenceRule.weekdays`/`time`, `Task.due_time`, `TaskCreateRequest.due_time`
- [ ] `domain/tasks/recurrence.ts`: suportar `weekdays` no loop semanal + herdar `time`; testes
      Vitest ("terça e quinta", intervalo de N semanas com `weekdays`, regressão sem `weekdays`)
- [ ] `TaskRecurrenceField`: seletor de dias da semana (só quando Semanal) + input de horário
      opcional, nos dois formulários (`TaskList.tsx`, `ProjectDetail.tsx`)
- [ ] Exibir `due_time` junto da data em todos os pontos que já mostram `due_date`
- [ ] Adicionar `formatDateTimeBR` (se necessário) ao lado de `formatDateBR`
- [ ] Trocar formatação de data em `car/*`, `finance/*`, `home/*`, `life/hubMeta.ts`,
      `ops/OpsConsole.tsx` para `formatDateBR`/`formatDateTimeBR`
- [ ] Trocar formatação de data em todo o módulo de Tarefas (Lista, Agenda, Kanban de tarefas e de
      projetos, Gantt, Live, dialogs de projeto/evento)
- [ ] Varredura final (`grep -rn "toLocaleDateString\|toLocaleString"`) confirmando que só sobrou
      uso justificado
- [ ] `npm run build && npm run lint` limpos + verificação manual (série "terça e quinta" gerando
      as ocorrências certas, horário editável por instância, checagem visual em cada módulo tocado)

## Notas
