---
prompt: |
  - a lista de filtro de projetos, deve ficazr em todas as visões (lista, kanban, gannt, agenda)
---

# 097 — Filtro de projetos igual nas quatro visões, e que sobrevive à sessão

## Contexto

O filtro de projetos **já aparece** em Lista, Kanban e Gantt: o `<Select>` mora acima de todos os
`TabsContent` de `TaskList.tsx:772-786`, e os três consomem o mesmo `projectFilter`
(`TaskList.tsx:144`) por `visibleTasks` (`:227-239`) e `ganttTasks` (`:338-344`). O que existe de
fato são três defeitos diferentes do que a frase sugere:

1. **A Agenda é excluída por uma linha**: `{viewMode !== "agenda" && (` em `TaskList.tsx:771`
   esconde a barra inteira (Projeto **e** Tag) quando a aba Agenda está ativa.
2. **A Agenda tem um segundo filtro, independente.** `AgendaGrid` não recebe prop nenhuma
   (`export function AgendaGrid()`, `:218`), busca a própria cópia das tarefas e mantém o próprio
   `projectFilter` (`:229`) com o próprio `<Select>` (`:636-648`). Trocar de aba zera o recorte, nos
   dois sentidos, sem aviso — e o `<Select>` de lá **não tem a opção "Sem projeto"** que o de cá tem.
3. **Nada disso sobrevive a um F5.** `projectFilter` nasce `"all"` em toda montagem, nas duas telas.

A 079 já enfrentou o mesmo formato de problema com "Ordenar por" e registrou a decisão nas Notas: um
controle só, na barra da Lista, valendo também para o Kanban, em vez de um segundo seletor
duplicado. E deixou pronta a peça de persistência: `src/lib/taskSortPreference.ts`, com a regra da
casa escrita no docblock — *"É preferência de visualização, não dado: fica em `localStorage`, por
navegador, e nunca vira coluna de banco."*

## Decisões

- **Um filtro só, compartilhado pelas quatro visões, e não um por visão.** O recorte "estou
  trabalhando no projeto X" é do usuário, não da visão: quem filtra na Lista e abre o Gantt quer o
  mesmo recorte, e é isso que Lista/Kanban/Gantt já fazem hoje entre si. Um filtro por visão
  multiplicaria por quatro o estado que o usuário precisa lembrar e produziria a pergunta "por que a
  Agenda mostra coisa que a Lista não mostra?" — que é exatamente a confusão de hoje.
  - **Descartado — filtro independente por visão**: seria defensável se cada visão tivesse
    finalidade diferente (planejar × executar), mas as quatro listam as mesmas tarefas com layouts
    diferentes. E o precedente da 079 é o oposto.
- **A `AgendaGrid` deixa de ter estado próprio de filtro e passa a aceitar um par controlado
  opcional** (`projectFilter` / `onProjectFilterChange`), caindo no estado interno quando as props
  não vêm. É o mínimo que faz a aba obedecer ao `TaskList` **sem quebrar a rota standalone**
  `/tasks/agenda` (`AgendaCalendar.tsx`, registrada em `src/routes.tsx:171`), que renderiza
  `<AgendaGrid />` sozinha dentro de um `PageShell`.
  - **Descartado — subir a busca de dados da Agenda para o `TaskList`**: a Agenda busca
    `fetchTasks`, `fetchProjects`, `fetchProjectEvents`, `fetchTags`, `fetchRecurringTransactions` e
    as medicações no próprio `load()` (`:238-256`), e a 043 já registrou essa duplicação como
    dívida conhecida. Resolvê-la aqui transformaria um pedido de filtro numa refatoração de
    carregamento de duas telas, com risco desproporcional.
- **A barra sai de dentro do gate**: o `<Select>` de **Projeto** passa a ser renderizado nas quatro
  abas. O `<Select>` de **Tag** continua gated para fora da Agenda, porque a Agenda não filtra por
  tag em lugar nenhum hoje (`filteredTasks`, `:393-401`, só olha projeto) — levar a Tag junto seria
  entregar um controle que não faz nada, ou abrir uma segunda feature dentro desta. Fica registrado
  como o próximo passo óbvio, não como omissão.
- **A Agenda ganha "Sem projeto"**, alinhando as opções das quatro visões. A semântica vale para os
  dois conjuntos que ela desenha: tarefas com `project_id is null` **e** eventos com `project_id is
  null` — `project_event.project_id` virou opcional na migration `20260820110000_project_event_
  project_optional.sql`, então "Sem projeto" para eventos passou a ser um conjunto real.
- **Consequência assumida e registrada: com um projeto selecionado, a Agenda esconde as doses de
  medicação e as parcelas de recorrência financeira**, porque essas linhas nascem sem `project_id`.
  É o que "filtrar por projeto" significa, e mudar isso (tratar dose como sempre visível) seria
  inventar uma exceção que nenhuma das outras visões tem. O que a feature faz para isso não virar
  susto é o item seguinte.
- **Filtro ativo tem que ser visível e ter saída de um clique.** Com `projectFilter !== "all"`,
  aparece ao lado do `<Select>` um botão só-ícone "Limpar filtro de projeto" (`aria-label`
  explícito). Sem isso, um filtro que agora **persiste** entre sessões vira uma tela
  misteriosamente vazia dias depois — o modo de falha clássico de preferência salva.
- **Persiste entre sessões, em `localStorage`, no molde exato de `taskSortPreference.ts`**: arquivo
  novo `src/lib/taskProjectFilterPreference.ts`, chave `orbyva_task_project_filter_v1`, leitura e
  escrita tolerantes a `localStorage` inexistente ou que lança. Uma chave só, compartilhada por
  `TaskList` e pela rota standalone da Agenda — é a mesma preferência do mesmo usuário.
  - **Descartado — coluna no banco / tabela `user_preference`**: não existe tabela de preferência no
    projeto, e o docblock da 079 fecha a questão em uma linha ("nunca vira coluna de banco").
  - **Descartado — `?project=` na URL**: o `TaskList` deliberadamente não sincroniza estado de aba
    com a URL (`TaskList.tsx:134-137`), e misturar as duas convenções na mesma barra criaria
    comportamento inconsistente entre o filtro e a aba. `Live.tsx` continua com o `?project=` dela,
    que é outro fluxo (link direto para uma sessão).
- **O valor salvo é validado contra os projetos carregados.** Um id de projeto apagado — ou o
  formato antigo/lixo — cai para `"all"` e a preferência é reescrita, em vez de deixar a tela
  filtrada por um projeto que não existe mais e não aparece no `<Select>`. `"all"` e `"null"`
  são sempre válidos. A validação é uma função pura em `src/domain/tasks/filters.ts`, ao lado de
  `isTaskSortKey`.
- **O modo de visualização continua não sendo persistido.** Não foi pedido, e persistir os dois
  juntos muda o que o usuário vê ao abrir `/tasks` de duas maneiras ao mesmo tempo. Fica registrado
  como decisão, não como esquecimento.
- **`ProjectsRail` (a coluna da esquerda da Lista) não muda.** Ela já dispara o mesmo
  `projectFilter` (`ProjectsRail.tsx:6-8`), então passa a refletir e a alimentar o estado
  compartilhado de graça. Continua só na Lista — é atalho visual, não um segundo filtro.
- **`ProjectDetail` fica de fora**: já está recortado por `:id`, e um filtro de projeto dentro da
  página de um projeto não tem o que filtrar. `/tasks/live` também fica de fora — outro fluxo, com
  seleção própria vinda de `?project=`.
- **Fora de escopo**: filtro por tag na Agenda, filtro por status/prioridade fora da Lista, e
  filtrar no servidor (todas as visões continuam recebendo o mesmo `fetchTasks` e recortando em
  memória, como hoje).

## Tarefas

- [x] `src/domain/tasks/filters.ts`: `PROJECT_FILTER_ALL = "all"` e `PROJECT_FILTER_NONE = "null"`
      como constantes exportadas, `isProjectFilterValue(v)` e `normalizeProjectFilter(value,
      projectIds)` — pura, devolve `"all"` quando o valor não é `"all"`/`"null"` nem um id presente
      na lista. Verificação: `npm run build`
- [x] Testar em `src/domain/tasks/__tests__/filters.test.ts`: `"all"` e `"null"` passam mesmo com a
      lista de projetos vazia; id presente passa; id ausente vira `"all"`; `null`/`undefined`/número
      viram `"all"`; string vazia vira `"all"`. Verificação: `npm test src/domain/tasks`
- [x] Criar `src/lib/taskProjectFilterPreference.ts` no molde de `src/lib/taskSortPreference.ts`:
      `TASK_PROJECT_FILTER_STORAGE_KEY = "orbyva_task_project_filter_v1"`,
      `readTaskProjectFilter()` e `writeTaskProjectFilter(value)`, ambos em `try/catch`, com o mesmo
      docblock explicando que é preferência de visualização e não dado. Verificação: `npm run build`
- [x] Criar `src/lib/__tests__/taskProjectFilterPreference.test.ts` no molde de
      `taskSortPreference.test.ts`: sem nada salvo devolve `"all"`; valor salvo volta; valor
      inválido não é gravado; `localStorage` ausente e `localStorage` que lança não quebram nem na
      leitura nem na escrita. Verificação: `npm test src/lib`
- [x] `TaskList.tsx`: `projectFilter` nasce de `readTaskProjectFilter()` (inicializador preguiçoso,
      como o `sortKey` em `:152`) e toda troca passa por um `handleProjectFilterChange` que grava a
      preferência — inclusive as vindas do `ProjectsRail`, que já usa o mesmo `onSelect`.
      Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: depois que `projects` carrega, revalidar o filtro com `normalizeProjectFilter`
      — id que não existe mais cai para `"all"` e a preferência é reescrita. Cuidar para a
      revalidação não rodar enquanto `loading` é `true` (lista vazia ainda não é prova de projeto
      apagado). Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: tirar o `<Select>` de Projeto de dentro de `{viewMode !== "agenda" && (…)}`
      (`:771`), deixando só o de Tag sob o gate, e manter a barra com o mesmo layout
      (`flex flex-wrap gap-2`) nas quatro abas. Verificação: `npm run build && npm run lint`
- [x] `TaskList.tsx`: botão só-ícone "Limpar filtro de projeto" ao lado do `<Select>`, visível só
      quando `projectFilter !== "all"`, com `aria-label` e `title`. Verificação:
      `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: assinatura passa a ser
      `AgendaGrid({ projectFilter, onProjectFilterChange }: AgendaGridProps = {})`, com props
      opcionais; o estado interno vira fallback (`const [internal, setInternal] = useState(...)`) e
      um par derivado `value`/`setValue` alimenta tudo que hoje usa `projectFilter`. Documentar as
      props no `AgendaGridProps` com o mesmo padrão de comentário do arquivo. Verificação:
      `npm run build`
- [x] `AgendaGrid.tsx`: o `<Select>` interno (`:636-648`) ganha `<SelectItem value="null">Sem
      projeto</SelectItem>`, e `filteredTasks` (`:393-401`) e `filteredEvents` (`:411-414`) passam a
      tratar os três casos (`"all"` → tudo; `"null"` → `project_id == null`; id → igualdade), sem
      duplicar a expressão nos dois memos — extrair um predicado local único. Verificação:
      `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: quando **não** controlada (rota standalone `/tasks/agenda`), o estado interno
      nasce de `readTaskProjectFilter()` e grava em cada troca — é a mesma preferência do usuário, e
      sem isso abrir a Agenda pela sidebar zeraria o recorte escolhido na aba. Verificação:
      `npm run build && npm run lint`
- [x] `TaskList.tsx`: passar `projectFilter` e `onProjectFilterChange` para `<AgendaGrid />`
      (`:1074-1076`) e conferir que o `<Select>` interno da Agenda **não** aparece duas vezes na
      aba — decidir explicitamente entre esconder o interno quando controlado ou deixar os dois
      sincronizados, e registrar a escolha em `## Notas`. Recomendado: esconder o interno, já que a
      barra de cima passa a estar visível na aba Agenda. Verificação: `npm run build && npm run lint`
- [x] Estados e bordas da barra: nenhum projeto cadastrado (o `<Select>` mostra só "Todos os
      projetos" e "Sem projeto", sem lista vazia pendurada); enquanto `loading` é `true` o
      `<Select>` continua utilizável e não pisca de volta para "all"; nome de projeto longo não
      estoura o `w-44` do `SelectTrigger` (`truncate`). Verificação: `npm run build && npm run lint`
- [x] Teste novo `src/pages/admin/tasks/__tests__/TaskList.project-filter.test.tsx` — o filtro é o
      mesmo nas quatro abas: selecionar um projeto na Lista e trocar para Kanban, Gantt e Agenda
      mantém a seleção e o recorte; o `<Select>` de Projeto está presente nas quatro; o de Tag não
      está na Agenda. Verificação: `npm test src/pages/admin/tasks`
- [x] No mesmo arquivo — persistência, no molde de `TaskList.sort.test.tsx`: a escolha sobrevive a
      remontar a tela; um id salvo que não está na lista de projetos carregados cai para "Todos os
      projetos" e a chave é reescrita; "Limpar filtro" volta para `"all"` e grava. Verificação:
      `npm test src/pages/admin/tasks`
- [x] Estender `src/pages/admin/tasks/__tests__/AgendaGrid.test.tsx`: controlada, a Agenda obedece à
      prop e chama `onProjectFilterChange` em vez de guardar estado; "Sem projeto" mostra as tarefas
      e os eventos sem projeto e esconde os demais; com um projeto selecionado, a dose de medicação
      (sem `project_id`) **não** aparece — a consequência registrada nas Decisões, provada em teste
      para não virar regressão silenciosa; não controlada, a Agenda lê a preferência salva.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Conferir que `ProjectsRail` continua em sincronia: teste de que clicar num projeto na coluna da
      esquerda muda o recorte do Kanban e da Agenda, e que clicar no projeto ativo volta para "all" e
      grava a preferência. Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      testes registrada aqui: **232 arquivos / 2590 testes, 0 falhas** (baseline da esteira: 230 /
      2558 — +2 arquivos e +32 testes desta feature). `lint` com 0 erros (83 warnings
      `react-refresh/only-export-components`, todos pré-existentes); `check:bundle` "Bundle budget
      OK". A suíte só fecha limpa com `--maxWorkers=4`: nesta máquina o load médio estava em ~27
      para 10 núcleos (outros agentes da esteira rodando), e aí um punhado de testes de componente
      pesados estoura o `testTimeout` de 5s — conjunto **diferente a cada rodada**
      (`TaskList.form-panel`, `TaskList.external-links`, `ProjectDetail.external-links`,
      `AgendaGrid` links, `notaSemSintaxe`, `notes-navigation`), todos verdes isolados. É a
      intermitência já conhecida da esteira, não regressão.

## Prompts

## Notas

- **Aba Agenda controlada esconde o `<Select>` interno** (tarefa 12, escolha registrada): com a
  barra de cima agora visível na aba, manter os dois seletores deixaria dois controles do mesmo
  recorte um embaixo do outro. Mantê-los sincronizados foi descartado pelo mesmo motivo — não é um
  segundo estado, é o mesmo. Na rota standalone `/tasks/agenda` nada muda: sem props, o `<Select>`
  interno continua sendo o controle da tela (e agora com "Sem projeto").
- **Desvio pequeno, mesmo motivo da decisão:** a revalidação contra os projetos carregados também
  roda na `AgendaGrid` **não controlada**. A decisão do arquivo justifica a validação com "não
  deixar a tela filtrada por um projeto que não existe mais", e a rota standalone lê a mesma chave
  do `localStorage`: sem isso, um projeto apagado deixaria o `<Select>` de lá no placeholder com a
  agenda vazia — e lá não há botão "Limpar filtro". São as mesmas ~8 linhas do `TaskList`.
- **Teste vizinho ajustado (082):** `TaskList.priority-reorder.test.tsx` remonta a tela no meio do
  teste e reclicava o projeto na `ProjectsRail` para reabrir o painel "Por prioridade". Com o filtro
  persistindo, a segunda montagem já vem com o projeto ativo e o clique **desmarcava** (a trilha
  alterna), sumindo com o painel. O helper passou a clicar só quando o botão não está
  `aria-current="true"`, e a espera virou `findAllByText` (com o painel aberto desde o primeiro
  paint, o título aparece no quadrante e na linha). Comportamento coberto pelo teste: inalterado.
- **`aria-label="Projeto"` nos dois `<SelectTrigger>` de projeto:** com um valor escolhido o
  `placeholder` some e o gatilho ficava sem nome acessível nenhum — não dava para pedi-lo por papel
  nem com leitor de tela. É o que deixa os testes falarem "o combobox Projeto" em vez de depender
  da ordem dos comboboxes na barra.
- **Uma asserção da tarefa 16 mudou de forma, não de intenção:** "controlada, chama
  `onProjectFilterChange` em vez de guardar estado" pressupunha o `<Select>` interno visível. Com
  ele escondido quando controlada, o que se prova é o mesmo em espírito e verificável: a grade
  obedece à prop, **não** desenha um segundo seletor, **não** grava preferência por conta própria e
  troca de recorte quando a prop troca. O callback é exercido no caminho em que ele de fato dispara
  (não controlada + `onProjectFilterChange`), no teste seguinte.
- **A grade do mês só desenha 3 chips por dia** (`MONTH_MAX_CHIPS_PER_DAY`) — os fixtures novos de
  `AgendaGrid.test.tsx` põem tarefas e eventos em dias diferentes por isso, senão o quarto item
  sumia atrás do "+1 mais" e o teste acusaria um filtro que não existe.

## Checagem de satisfação

O `prompt:` do frontmatter tem um pedido só — "a lista de filtro de projetos deve ficar em todas as
visões (lista, kanban, gantt, agenda)" — e `## Prompts` está vazio (nenhum pedido novo do usuário no
meio da implementação). Cada parte, com o artefato que a comprova (todos verdes):

- **lista, kanban, gantt, agenda — a lista aparece nas quatro**:
  `TaskList.project-filter.test.tsx` › "o `<Select>` de Projeto está nas quatro abas; o de Tag, em
  três". Pede o combobox pelo nome acessível em cada aba, e na Agenda ainda confere que ele existe
  **uma vez só** (a grade controlada não desenha o dela).
- **é a *mesma* lista, não quatro parecidas**: mesmo arquivo › "escolher um projeto na Lista mantém
  o mesmo recorte no Kanban, no Gantt e na Agenda" e "«Sem projeto» também é o mesmo recorte nas
  quatro abas" — as duas checam o valor exibido no gatilho **e** o conjunto de tarefas desenhado em
  cada aba, incluindo a volta para a Lista.
- **a Agenda de fato obedece** (era o único defeito real por trás da frase):
  `AgendaGrid.test.tsx` › "controlada, obedece à prop e não desenha um segundo seletor de projeto" e
  "controlada, trocar a prop troca o recorte — o estado é de fora".
- **a rota standalone `/tasks/agenda` não quebrou**: `AgendaGrid.test.tsx` › "não controlada (rota
  standalone), lê a preferência salva no navegador" e "não controlada, escolher no `<Select>` grava
  a preferência e avisa quem estiver ouvindo" — mais os 14 testes que a suíte já tinha da grade,
  todos passando sem alteração.
- **consequência assumida, provada**: `AgendaGrid.test.tsx` › "com um projeto selecionado, a dose de
  medicação some — consequência assumida nas Decisões".
- **suíte inteira**: 232 arquivos / 2590 testes, 0 falhas (ver a última tarefa).

