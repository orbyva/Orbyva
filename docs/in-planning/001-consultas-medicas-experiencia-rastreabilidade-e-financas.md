---
prompt: |-
  - existe um bug/mal funcionamento na listagem de consultas, eu listo porém não consigo ver
    - a recorrência de alguma consulta
    - não consigo criar uma nova, porque agora que tem a listagem ele não permite criar uma nova
    - ao criar consulta lá em cima em 'Agendar Consulta' ele criou a tarefa, mas não listou aqui como consulta
  - ao criar uma consulta, na listagem de tarefas, não devem aparecer como uma tarefa comum. o ícone já deve vir preenchido com o ícone de consulta (o mesmo que aparece na agenda) e o projeto deve vir tipo não selecionado, mas preenchido como <> vida > saúde, para trazer uma rastreabilidade
  - cada consulta também pode ter a opção de criar transações relacionadas, se houver recorrência de consulta, ele já cria também uma recorrência financeira
---

# 001 — Gestão de consultas médicas: listagem, rastreabilidade e integração financeira

## Contexto
O usuário relatou pontos de atrito e inconsistências no ciclo de vida de consultas médicas no sub-módulo Vida > Saúde (`HealthDashboard.tsx`) e em sua representação no módulo de Tarefas (`TaskList.tsx`, `AgendaCalendar.tsx`):
1. **Visualização e gestão de consultas**: Na tela de Saúde, a seção de consultas atualmente só exibe a próxima consulta pendente imediata (`nextConsultation`), sem permitir enxergar as consultas cadastradas com clareza nem identificar quais são recorrentes. Além disso, ao tentar criar uma nova consulta quando já existe listagem, o fluxo bloqueia ou não disponibiliza o botão de criação, e consultas agendadas pelo topo ("Agendar consulta") precisam sincronizar e aparecer imediatamente na seção de consultas.
2. **Exibição compacta sem duplicação de instâncias**: A listagem de consultas não deve listar instâncias filhas materializadas repetidas; deve listar apenas as consultas-mãe (template/série ou consulta única), mostrando sua próxima data e o indicador visual de que é uma recorrência.
3. **Rastreabilidade e identidade visual em Tarefas**: Quando uma consulta médica é criada, ela vira uma `task` com flag `is_consultation: true`, mas na listagem geral de tarefas aparece como tarefa comum. O ícone deve vir preenchido por padrão com o ícone de consulta (`Stethoscope`, o mesmo exibido na Agenda) e o slot de projeto deve exibir visualmente `<> vida > saúde` como placeholder/badge informativo sem criar nem associar um registro de projeto no banco de dados.
4. **Integração Financeira sob demanda com criação inline de categoria**: Cada consulta na listagem deve ter uma ação/ícone para criar a transação financeira correspondente sob demanda. Ao acionar essa ação, um diálogo permite selecionar a categoria da despesa (com opção de criar uma nova categoria inline caso ela ainda não exista). Se a consulta for recorrente, a ação cria a Recorrência Financeira correspondente em Finanças. Ao alterar a data de uma consulta, as datas das transações associadas são atualizadas automaticamente.

## Definições
- **Consulta Médica**: Tarefa (`task`) com `is_consultation = true`. Para séries recorrentes, a consulta-mãe (`parent_id IS NULL` ou `recurrence_rule IS NOT NULL`) define a regra e as filhas são ocorrências.
- **Listagem de Consultas em Saúde**: Painel/lista em Vida > Saúde listando unicamente as consultas-mãe ativas (sem duplicar instâncias filhas materializadas), exibindo para cada uma: título/especialista, próxima data prevista, frequência/dias da semana e badge de recorrência, botão permanente "Agendar consulta" no cabeçalho da seção, e ação contextual "Criar transação".
- **Identidade da Consulta em Tarefas**: Em `TaskList`, tarefas com `is_consultation = true` renderizam com o ícone padrão de estetoscópio e, no local onde normalmente seria selecionado o projeto, exibem o rótulo/badge informativo `<> vida > saúde`, puramente cosmético/rastreável, sem criar entidade `project` no banco de dados.
- **Vínculo Financeiro sob Demanda com Criação Inline de Categoria**: Ação por ícone/botão em cada item da listagem de consultas. Abre modal para preenchimento de valor, data e seleção de categoria (`ClassSearchPicker` ou similar), com atalho inline para criar uma nova categoria/subcategoria sem sair do fluxo. Se consulta pontual: cria a transação vinculada. Se consulta recorrente: cria a `recurring_transaction` (Recorrência Financeira) vinculada via `linked_recurring_id` (Feature 002).
- **Sincronização de Datas**: Ao atualizar a data de uma consulta vinculada a transação/recorrência, as transações financeiras correspondentes têm suas datas atualizadas para manter a paridade.
- **Escopo**:
  - *Dentro*: Reformulação da listagem de consultas em `HealthDashboard.tsx` listando apenas consultas-mãe com próxima data e indicador de recorrência; garantia de botão para agendar nova consulta mesmo com itens listados; renderização de ícone de consulta e badge visual `<> vida > saúde` em Tarefas; modal "Criar transação" na lista de consultas com seleção/criação inline de categorias; criação de transação pontual ou recorrência financeira; sincronização de datas entre consulta e finanças ao editar data.
  - *Fora*: Criação de entidade ou tabela de projeto `Vida > Saúde` no banco de dados. Criação de prontuário clínico complexo.

## Estrutura
1. **Camada de Dados & API de Saúde (`src/api/health/`)**:
   - Criar `fetchConsultationSeries` que consulta as tarefas-mãe (`is_consultation = true`, `parent_id IS NULL`), calcula a próxima ocorrência pendente para cada uma e identifica se é pontual ou recorrente (`recurrence_rule`).
2. **Interface do Dashboard de Saúde (`src/pages/admin/life/HealthDashboard.tsx`)**:
   - Atualizar a seção "Consultas" para renderizar a lista de consultas-mãe com o badge de recorrência e próxima data.
   - Manter botão "Agendar consulta" sempre acessível no cabeçalho da seção (mesmo com lista preenchida).
   - Adicionar botão/ícone de ação "Criar transação" em cada linha de consulta.
   - Reconciliação imediata após criação pelo diálogo `ConsultationQuickCreateDialog`.
3. **Experiência Visual de Consultas em Tarefas (`src/pages/admin/tasks/`)**:
   - Em `TaskList.tsx` e componentes de linha/card de tarefa: quando `task.is_consultation === true`, renderizar o ícone de estetoscópio como padrão e, no slot de projeto, renderizar `<> vida > saúde` (badge informativo não clicável / não selecionável).
4. **Integração Financeira & Modal de Transação (`src/pages/admin/life/` & `src/api/recurring.ts` / `src/api/finance.ts`)**:
   - Diálogo acionado pelo botão "Criar transação":
     - Permite selecionar a categoria/subcategoria de despesa (`ClassSearchPicker`), com capacidade de criar nova categoria inline.
     - Permite definir o valor.
     - Para consulta única: cria a `transaction` correspondente.
     - Para consulta recorrente: cria a `recurring_transaction` vinculada via `linked_recurring_id` (Feature 002).
   - Ao editar data da consulta via `updateTask` / dialog: propagar a atualização de data para a transação financeira vinculada ou parcelas correspondentes.

## Decisões
- **Sem criação de projeto no banco**: O texto `<> vida > saúde` é estritamente uma representação visual no lugar do seletor/badge de projeto para tarefas com `is_consultation = true`, para não poluir nem confundir a tabela de projetos reais.
- **Lista apenas consultas-mãe**: Para evitar poluição na tela de Saúde, instâncias filhas de recorrência não aparecem como linhas separadas na lista de consultas; lista-se apenas a consulta-mãe com sua próxima data calculada e badge de repetição.
- **Criação financeira sob demanda com criação inline de categoria**: A criação de transações/recorrência financeira não ocorre automaticamente no agendamento, mas sim através de ação explícita ("Criar transação") na listagem de consultas, com modal que permite escolher ou criar a categoria na hora.
- **Sincronização bidirecional de datas**: Alterações na data da consulta médica atualizam a data da transação financeira correspondente.
- **Ícone padrão**: Consultas médicas exibem `Stethoscope` por padrão em todas as visões.

## Perguntas em aberto
- (Nenhuma pergunta impeditiva aberta; decisões essenciais validadas e estruturadas).

## Prompts
- 2026-09-04 — Clarificações do usuário: "não deve ser criado um novo projeto Vida > Saúde, só deve aparecer isso no lugar de onde aparecia projeto. para não confundir, isso para as tarefas criadas is_consultation", "ele também não deve listar nenhuma consulta [filha], só listar a consulta mãe, a próxima data e indicar que se trata de uma recorrência", "a criação da transação só deve ser feita mediante solicitação do usuário, então ao listar as consultas, colocar um ícone para criar transação. se for uma recorrência, o ícone cria as recorrências. se eu alterar a data, devem ser alteradas também as datas das transações." e "no momento em que eu escolho criar uma transação, eu seleciono a categoria e crio caso ainda não existir".

## Attacks
(vazio até o primeiro /attack)
