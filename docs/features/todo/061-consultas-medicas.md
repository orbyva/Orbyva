---
prompt: |
  - SUB-MÓDULO DE VIDA.SAÚDE
    - CONTROLAR MEDICAMENTOS
    - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
    - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
      - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
      - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
      - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO
---

# 061 — Consultas médicas no calendário geral

## Contexto
O usuário pediu que consultas "virem eventos no calendário geral". O app tem duas entidades de tempo: `task` (data + hora opcional, com status e recorrência) e `project_event` (timestamp, obrigatoriamente ligado a um projeto, sem status). Uma consulta é pessoal e precisa ser marcada como comparecida, o que a coloca do lado de `task`. Esta feature adiciona a flag `is_consultation`, um atalho de criação e a renderização distinta no calendário, reusando toda a materialização de recorrência que já existe.

## Decisões
- **Consulta é `task` com flag `is_consultation`**, espelhando exatamente o que a 049 fez com `is_medication`. Ganha de graça: aparição no calendário geral (`groupCalendarItemsByDay` já recebe as tasks), recorrência via `recurrence_rule` + `materializeRecurringInstances` para consultas periódicas, e `completed_at` marcando o comparecimento com hora real.
  - **Descartado — `project_event`**: é escopo de projeto (`project_id` obrigatório) e não tem `status` nem `completed_at`, então não daria para marcar "compareci". Consulta não é bloco de agenda de projeto.
  - **Descartado — tabela `consultation` própria**: hoje os campos que ela teria (especialista, local) cabem em `title`/`description`, e uma tabela nova exigiria replicar materialização de recorrência e a junção no calendário. Se depois surgir demanda real de histórico clínico (anexar exames, encadear retornos), aí sim ela se justifica — com o mesmo padrão de vínculo `entidade → task` que a 064 vai estabelecer para medicação.
- **Especialista vai no `title`, local e preparo vão na `description`.** O `title` é o único campo que o calendário renderiza na célula do dia, então "Cardiologista — Dr. Silva" é o que precisa estar visível; abrir a tarefa mostra o resto. Sem coluna nova: uma coluna `specialist` em `task` só faria sentido para uma fração das linhas da tabela.
- **Sem RLS nova**: `task` já tem as políticas por `user_id = auth.uid()`, e a flag não muda isso.

## Tarefas
- [ ] Criar a migration `supabase/migrations/20260816120100_task_consultation.sql` adicionando `is_consultation boolean not null default false` em `public.task` — espelhando `20260816120000_task_medication.sql`, que adiciona `is_medication`
- [ ] Adicionar `is_consultation?: boolean` ao tipo `Task` em `src/types/tasks.ts`
- [ ] Em `src/api/tasks/tasks.ts`, dentro de `materializeRecurringInstances`, propagar `is_consultation` para cada ocorrência criada (mesma linha em que `is_medication` já é copiado)
- [ ] Criar `src/pages/admin/tasks/ConsultationQuickCreateDialog.tsx`, espelhando `MedicationQuickCreateDialog.tsx`: campos especialidade + profissional (compõem o `title`), data, horário, "repetir a cada N meses" (opcional, vira `recurrence_rule`) e local/preparo (vira `description`); submete via `createTask` com `is_consultation: true`
- [ ] Adicionar a seção "Consultas" e o botão "Agendar consulta" no `HealthDashboard.tsx` (criado na 060), abrindo o dialog acima
- [ ] Em `src/pages/admin/tasks/AgendaCalendar.tsx` (e no componente de célula que ele usa), renderizar itens com `is_consultation === true` com ícone `Stethoscope` e a cor `--health`, em vez do checkbox padrão
- [ ] No diálogo de ocorrências de série (`TaskList.tsx` e `ProjectDetail.tsx`), tratar `is_consultation` como a 049 trata `is_medication`: ocorrência `done` exibe "Compareceu às HH:mm" a partir de `completed_at`, e a lista vazia exibe "Nenhuma consulta registrada ainda."
- [ ] Estender `HealthSummary` em `src/types/health.ts` com `nextConsultation: Task | null` e preencher em `loadHealthSummary` (`src/api/health.ts`), com a próxima task `is_consultation = true` e `status = 'todo'`
- [ ] `npm run build`
- [ ] `npm run lint`
- [ ] `npm run test` — cobre apenas o domínio puro: adicionar caso em `src/domain/tasks/` verificando que uma série marcada como consulta gera ocorrências nas datas esperadas via `computeMissingOccurrences`
- [ ] Verificação manual, após confirmar com o usuário e rodar `supabase db push`: criar uma consulta não recorrente e conferir que aparece no dia certo do calendário geral com o ícone de estetoscópio; criar uma recorrente mensal e conferir que as ocorrências foram materializadas; marcar uma como concluída e conferir "Compareceu às HH:mm" no histórico da série; conferir que uma tarefa comum e uma medicação continuam renderizando como antes

## Prompts
- 2026-08-16 — "- SUB-MÓDULO DE VIDA.SAÚDE
  - CONTROLAR MEDICAMENTOS
  - CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)
  - E PROGRESSO NO CUIDADO COM O PRÓPRIO CORPO
    - CONTROLE DE NOTIFICAÇÕES PARA ALIMENTAÇÃO
    - CONTROLE DE NOTIFICAÇÕES PARA INGESTÃO DE ÁGUA
    - TUDO NO FUTURO VAI DAR UMA PUSH NOTIFICATION PARA O USUÁRIO"

## Notas
- **Recorte do prompt-mãe que esta feature cumpre**: o item "CONSULTAS (VIRAM EVENTOS NO CALENDÁRIO GERAL)", integralmente. Os demais itens são cumpridos por 062, 063 e 064.
- **Depende da 060** (o `HealthDashboard` e o `HealthSummary` precisam existir para receber a seção e o campo `nextConsultation`).
- Migration timestamp `20260816120100`: precisa ser único, distinto de `20260816120000` (medicação) e dos timestamps escolhidos pela 063 e pela 064. Timestamps repetidos já causaram bug real de bookkeeping do CLI — ver Notas de `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`.
- `supabase db push` aplica direto no banco remoto (não há Supabase local neste projeto): confirmar com o usuário antes de rodar.
- Vitest neste repo cobre domínio puro, sem I/O — ele não valida RLS nem insert no Supabase. Por isso a verificação de banco desta feature é manual e está descrita passo a passo.
- Uma consulta recorrente usa exatamente a mesma `recurrence_rule` das medicações; não há código de recorrência novo nesta feature, só a propagação da flag.
