---
prompt: |-
  Pedido do usuário, verbatim (05/10/26) — ver o pedido completo no frontmatter da 250.

  Fatia desta feature: "Marco (milestone), duração e botão 'começar agora'", "Editar apontamentos
  de tempo", "Tela com as ocorrências da série", "Editar evento do projeto".
---

# 252 — Mobile: começar agora, apontamentos, ocorrências da série, evento e marco

## Contexto
- Web: `useStartTaskNow` + `computeImmediateSchedule` (078); `TimeEntryRow` /
  `TaskTimeEntriesField` editam início/fim (`updateTimeEntry`); `SeriesOccurrencesDialog`;
  `updateProjectEvent`; campo `is_milestone` no formulário.
- Mobile já tem: duração (Bloco/Pontual) e "Referenciada em" no formulário — ficam fora.

## Decisões
- "Começar agora" vira botão no formulário de tarefa existente (o mobile não tem linha densa com
  ícones): inicia o timer e grava prazo = agora + duração, mesma regra do web.
- Apontamentos: seção "Registros de tempo" no formulário (editar início/fim, excluir) e edição na
  tela Live.
- Ocorrências: botão "Ver ocorrências" no formulário de tarefa recorrente → rota
  `tasks/occurrences`.
- Evento do projeto: tocar no evento na aba do projeto abre edição.

## Tarefas
- [x] Portar `computeImmediateSchedule` para `mobile/src/domain/tasks/immediate.ts` + teste.
- [x] Botão "Começar agora" no formulário (timer + prazo), feedback igual ao web.
- [x] `updateTimeEntry` e `fetchEntriesForTask` na API mobile + teste.
- [x] Seção "Registros de tempo" no formulário com editar/excluir.
- [x] Edição de registro na tela Live.
- [x] Campo "Marco" no formulário (`is_milestone`).
- [x] Rota `tasks/occurrences` + botão no formulário; lógica de status/rótulo em domínio testado.
- [x] `updateProjectEvent` na API mobile + edição na aba do projeto + teste.

## Prompts
(vazio até haver iteração nova)

## Notas
- "Começar agora" grava o prazo por `setTaskDueApi` (só `due_date`/`due_time`): `updateTaskApi`
  zera prioridade quando ela não vem no payload, então não serve para update parcial.
- O prazo usa a duração/pontual **da tela** (o que o usuário vê), não a salva no banco.
- Edição do evento fica no formulário do projeto; tocar no evento na tela do projeto abre esse
  formulário já editando o evento (`?eventId=`).
- `TASK_SELECT` passou a trazer `is_milestone` e `start_date` (o `start_date` é para o Gantt, 253).
- "Ver ocorrências" aparece em série recorrente e em dose de medicação; reaproveita
  `findSeriesTasks` do domínio mobile (mesma função do web).
- Telas sem teste de componente (o mobile não tem harness de render); a lógica foi para
  `domain/tasks/{immediate,timeEntryEdit,occurrences}.ts` e para a API, ambas testadas.

## Como testar

1. **Automatizado**: `cd mobile && npx vitest run --config ./vitest.config.ts immediate timeEntriesEdit`.
2. **Manual**:
   - Abra uma tarefa com 60 min → "Começar agora" → timer roda e o prazo vira agora + 1h.
   - Na mesma tarefa, "Registros de tempo" mostra o registro; edite o fim → duração muda.
   - Abra uma tarefa recorrente → "Ver ocorrências" → lista com datas e status.
   - Projeto → evento → editar título/data → salvo.
   - Marque "Marco" numa tarefa → salva e volta marcado.
3. **Borda**: começar agora com outro timer rodando para o anterior e avisa.
