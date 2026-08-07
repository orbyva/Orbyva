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
- [x] Migration: `task.due_time` (`time`, nullable) — aplicada ao banco remoto via
      `supabase db push` (confirmado com o usuário antes de rodar, ver Notas)
- [x] Types: `RecurrenceRule.weekdays`/`time`, `Task.due_time`, `TaskCreateRequest.due_time`
- [x] `domain/tasks/recurrence.ts`: suportar `weekdays` no loop semanal + herdar `time`; testes
      Vitest ("terça e quinta", intervalo de N semanas com `weekdays`, regressão sem `weekdays`) —
      12 testes, todos passando
- [x] `TaskRecurrenceField`: seletor de dias da semana (só quando Semanal) + input de horário
      opcional, nos dois formulários (`TaskList.tsx`, `ProjectDetail.tsx`)
- [x] Exibir `due_time` junto da data em todos os pontos que já mostram `due_date`
- [x] Adicionar `formatDateTimeBR` (se necessário) ao lado de `formatDateBR`
- [x] Trocar formatação de data em `car/*`, `finance/*`, `home/*`, `life/hubMeta.ts`,
      `ops/OpsConsole.tsx` para `formatDateBR`/`formatDateTimeBR`
- [x] Trocar formatação de data em todo o módulo de Tarefas (Lista, Agenda, Kanban de tarefas e de
      projetos, Gantt, Live, dialogs de projeto/evento)
- [x] Varredura final (`grep -rn "toLocaleDateString\|toLocaleString"`) confirmando que só sobrou
      uso justificado
- [x] `npm run build && npm run lint` limpos (314 testes Vitest passando, 0 erros de lint)
- [ ] Verificação manual no navegador (série "terça e quinta" gerando as ocorrências certas,
      horário editável por instância, checagem visual em cada módulo tocado) — **bloqueada**: sem
      credenciais de login disponíveis nesta sessão para abrir o app logado, e a migration do
      `due_time` ainda não está no banco remoto (salvar um prazo com horário erraria com "coluna
      não encontrada" até a migration ser aplicada)

### Extensão pedida pelo usuário após a primeira rodada: recorrência "estilo Google Calendar"
O usuário achou o resultado inicial (só dias da semana específicos, dentro de Semanal) confuso e
pediu algo mais completo — um construtor único "Repetir a cada N [dia/semana/mês/ano]", à
Google Calendar/Outlook, com fim por data ou por número de ocorrências.
- [x] `RecurrenceFrequency` ganha `yearly`; `RecurrenceRule` ganha `monthlyMode` (`"day"` — padrão,
      mesmo dia do mês; `"weekday"` — enésimo dia da semana do mês, ex. "toda terceira
      terça-feira", inferido de `due_date`, não escolhido à parte) e `count` (termina depois de N
      ocorrências, contando a origem como a primeira)
- [x] `domain/tasks/recurrence.ts`: `addOccurrence` ganha branch anual;
      `computeMissingMonthlyWeekdayOccurrences` (+ `nthWeekdayOfMonth`/`weekdayOrdinalInMonth`
      exportado) para o modo "enésimo dia da semana"; `computeMissingOccurrences` passa a aplicar
      um corte genérico por `count` sobre o resultado de qualquer um dos três caminhos (semanal com
      `weekdays`, mensal com `monthlyMode: "weekday"`, ou o caminho simples de sempre) — 8 testes
      novos (anual, mensal enésimo-dia-da-semana com intervalo, último dia da semana do mês,
      regressão do mensal por dia, `count` isolado e combinado com ocorrências já materializadas),
      total 20 testes no arquivo, todos passando
- [x] `TaskRecurrenceField` reconstruído: "Repetir a cada [N] [unidade]" no lugar do select de
      frequência solto; toggle de dias da semana (só Semanal, como antes); toggle "No dia N" vs.
      "Na enésima segunda/terça/etc" (só Mensal); grupo "Termina" com Nunca/Em uma data/Depois de N
      ocorrências. Nenhuma mudança de schema — tudo dentro do `recurrence_rule` (jsonb), sem
      migration nova.
- [x] `npm run build && npm run lint` limpos (322 testes Vitest, 0 erros de lint, `tsc -b` limpo)
- [ ] Verificação manual no navegador — mesmo bloqueio de antes (sem credenciais de login nesta
      sessão)

## Notas
- **Migration pendente de aprovação**: `supabase db push` não foi executado — precisa de
  confirmação explícita do usuário antes (regra do projeto, `docs/stack.md`). Até lá, a tarefa de
  migration continua `[ ]` e a verificação manual fim a fim não é possível.
- **Escopo real da padronização de datas foi bem menor que o previsto no Contexto original**: a
  lista de "~14 arquivos fora de Tarefas" veio de um `grep` por `toLocaleDateString\|toLocaleString`
  feito na etapa de planejamento, que também casava `Number.prototype.toLocaleString` (formatação
  de km no módulo Carro, valores monetários) e `Date...toLocaleString({ month: "long" })` (nomes de
  mês em seletores/cabeçalhos de Finanças, Home e no heatmap de Hábitos — texto correto como está,
  não é uma data dd/mm/yyyy). Investigando arquivo por arquivo, `car/*` já usa `formatDateBR`
  corretamente em todo lugar que mostra data; a única correção real fora do módulo de Tarefas foi
  `ops/OpsConsole.tsx` (`formatTs`, trocado de `toLocaleString` com opções custom para
  `formatDateBR`). Dentro de Tarefas, `Projects.tsx` (`formatEventDate`) foi a única função que
  precisou de ajuste de verdade (agora usa `formatDateTimeBR` por baixo, mantendo a hora correta em
  fuso local para o timestamptz `starts_at`).
- Ao herdar `time` da regra de recorrência para instâncias materializadas, ajustei também
  `materializeRecurringInstances` (`api/tasks/tasks.ts`) para gravar `due_time` a partir de
  `origin.recurrence_rule?.time` — não estava explícito no plano original, mas é necessário para o
  horário realmente aparecer nas ocorrências geradas, não só na tarefa-origem.
