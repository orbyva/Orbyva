# 020 — Live: exibir segundos nos registros de tempo finalizados

## Contexto
A feature 017 (`docs/features/done/017-live-widget-historico-e-registros-por-tarefa.md`) já
entregou o histórico completo da página Live e a seção "Registros de tempo" no dialog de edição
de tarefa. O timer *ativo* (contando em tempo real, em `LiveWidget.tsx` e no contador de
`Live.tsx` enquanto roda) já mostra `HH:MM:SS` com segundos. Mas os registros *finalizados* —
tanto na lista de histórico de `Live.tsx` quanto em `TaskTimeEntriesField.tsx` (seção "Registros
de tempo" do dialog de edição) — usam `formatDuration` (`src/domain/tasks/timeTracking.ts:25`),
que arredonda pra minutos (`"23min"` / `"1h23"`). O dado em si não perde precisão (`task_time_entry`
grava `started_at`/`ended_at` completos), só a exibição esconde os segundos.

## Decisões
- `formatDuration` passa a incluir segundos, no mesmo formato `HH:MM:SS` (ou `MM:SS` quando
  `< 1h`) já usado no timer ativo — consistência visual entre "rodando" e "registrado", em vez de
  inventar um formato novo (ex: `"1h23min45s"`).
- Não precisa de função nova/paralela: os dois únicos usos atuais de `formatDuration`
  (`Live.tsx:303`, `TaskTimeEntriesField.tsx:50`) são justamente os que precisam do formato
  preciso — não há chamador que dependa do formato compacto atual continuar existindo.
- Sem mudança de schema/API — é só formatação de exibição sobre um dado que já existe.

## Tarefas
- [x] Atualizar `formatDuration` (`src/domain/tasks/timeTracking.ts:25`) pra formato `HH:MM:SS`
      (ou `MM:SS` abaixo de 1h), cobrindo com teste Vitest os casos de borda (0s, <1min, exatamente
      1h, >1 dia se for possível um registro tão longo)
- [x] Conferir visualmente `Live.tsx` (histórico de registros) e `TaskTimeEntriesField.tsx`
      (seção "Registros de tempo" no dialog de edição de tarefa) exibindo segundos corretamente
- [x] `npm run build && npm run lint` + teste manual

## Notas
- **Desvio: consolidou 3 cópias da mesma função de formatação em 1.** Depois de trocar
  `formatDuration` pra `HH:MM:SS`, ela ficou byte-a-byte idêntica ao `formatClock` que já existia
  duplicado em `Live.tsx` e `LiveWidget.tsx` (usado pro timer *ativo*, que já mostrava segundos).
  Removi as duas cópias locais e troquei as chamadas pra usar `formatDuration` do domínio — não
  tinha por que manter 3 implementações da mesma lógica depois que os formatos convergiram, e o
  domínio já era o lugar certo por já ser importado nos dois arquivos.
- Verificado ao vivo (Chrome MCP, sessão ngrok do usuário): histórico da página Live mostra
  `02:52`/`00:08`/`00:18`/`00:35` (antes seria `3min`/`0min`/`0min`/`1min`, arredondado); a mesma
  precisão aparece em "Registros de tempo" no dialog de edição de tarefa. Sem erro no console.