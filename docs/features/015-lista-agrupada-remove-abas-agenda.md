# 015 — Lista ganha agrupamento por prazo + círculo de conclusão; remove abas de Agenda de Tarefas

## Contexto
Pergunta direta do usuário: por que só a Agenda tem a bolinha de concluir tarefa, e a Lista não?
Confirmado no código: `TaskAgendaCard` (`TaskViews.tsx:60-144`) tem um botão redondo de
conclusão (linhas 84-96) com atualização otimista; `TaskListRow` (`TaskViews.tsx:146-218`) só
mostra um `Badge` somente-leitura com o status (linhas 179-181) — sem jeito de concluir sem abrir o
dialog de edição ou ir para o Kanban.

Isso expõe uma decisão maior: o usuário quer transformar a Agenda numa visão de calendário de
verdade (feature 016), o que esvazia o sentido da Agenda atual (agrupamento por prazo
Atrasadas/Hoje/Esta semana/Este mês, feature 004). Em vez de ter uma terceira coisa chamada
"Agenda", a decisão é fundir o que a Agenda-lista faz hoje direto na Lista — resolve de vez a
confusão "não entendo a diferença entre Lista e Agenda" que o usuário já tinha citado antes, sem
depender só de texto explicativo (o que a feature 011, ainda não implementada, previa como fix).

## Decisões
- **Lista vira a única visão em lista** — `TaskList.tsx` perde a divisão em abas Lista/Agenda
  (`activeTab`, linha 81; `Tabs`/`TabsTrigger`, linhas 254-258). A página volta a ser uma coluna só,
  agora com o que só a aba Agenda tinha:
  - Agrupamento por `bucketForDueDate` (Atrasadas/Hoje/Esta semana/Este mês/Mais tarde/Sem prazo,
    `domain/tasks/agenda.ts:52`) como cabeçalhos de seção dentro da lista — o arquivo de domínio
    continua existindo, só deixa de alimentar uma aba separada.
  - Círculo de conclusão (mesmo componente hoje só em `TaskAgendaCard`) — `TaskListRow` ganha esse
    botão, chamando a mesma atualização otimista já usada em `toggleDone`.
  - Séries recorrentes colapsadas numa linha (próxima ocorrência em aberto) com o dialog "Ver
    ocorrências" — comportamento que hoje só a Agenda tinha. Reverte a decisão original da feature
    004 ("a lista plana continua mostrando cada instância materializada separadamente").
- Filtros já existentes na Lista (projeto/tag/prazo) continuam sem mudança.
- **`ProjectDetail.tsx` perde a aba Agenda** (`TabsTrigger value="agenda"`, linha 570; conteúdo nas
  linhas 682-718) — fica Kanban/Lista/Gantt. A aba Lista de dentro do projeto ganha o mesmo
  tratamento (agrupamento + círculo) da Lista global, pela mesma razão. O que a aba Agenda do
  projeto fazia (ver as tarefas daquele projeto por prazo) passa a ser coberto pela nova Agenda
  global com filtro por projeto (feature 016) — não é recriado aqui.
- Fora de escopo: a Agenda-calendário nova em si — vira a feature 016, separada e maior.

## Tarefas
- [x] `TaskListRow`: adicionar círculo de conclusão (mesmo padrão visual/otimista de
      `TaskAgendaCard`) + "Concluída em X" no lugar do prazo quando feita + abrir "Ver ocorrências"
      ao clicar no título de uma tarefa recorrente — `TaskAgendaCard` removido (ficou sem
      chamadores depois que os dois lugares que a usavam migraram para `TaskListRow`)
- [x] `TaskList.tsx`: remover abas Lista/Agenda; lista única com agrupamento por `bucketForDueDate`
      como cabeçalhos de seção + séries recorrentes colapsadas (reaproveita a lógica hoje só usada
      pela aba Agenda)
- [x] `ProjectDetail.tsx`: remover aba Agenda; aba Lista ganha o mesmo agrupamento/círculo
- [x] `npm run build && npm run lint` limpos (322 testes Vitest passando, 0 erros de lint,
      `tsc -b` limpo)
- [ ] Verificação manual no navegador (círculo conclui/reabre tarefa direto na Lista global e na
      do projeto; agrupamento por prazo aparece corretamente; série recorrente colapsada some da
      lista ao concluir a última ocorrência em aberto) — **bloqueada**: sem credenciais de login
      disponíveis nesta sessão, mesmo bloqueio já registrado na feature 009

## Notas
- Revoga a divisão de abas Lista/Agenda decidida nas features 004/007/008. Também deixa obsoleta a
  parte "Clareza Lista vs Agenda" da feature 011 (ainda não implementada) — o usuário preferiu
  fundir as duas visões em vez de só melhorar a comunicação textual da diferença entre elas.
