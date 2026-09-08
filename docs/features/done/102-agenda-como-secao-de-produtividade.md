---
prompt: |
  - botão 'recorrências' em tarefas, de modo que eu veja todas as tarefas com recorrência
  - seção 'Agenda' dentro de Produtividade -> Agenda
    - Conseguir criar Eventos
    - Ver Tarefas (tanto quick tasks quanto tasks com prazos)
    - Mesmo componente que está hoje em tarefas -> Agenda
    - Permitir criar eventos com arrastar no próprio layout (Tipo Google Agendas)
    - Permitir Criar Tarefas também
---

# 102 — Agenda vira seção própria em Produtividade

## Contexto

Esta feature cobre a **moldura** do segundo bullet do `prompt:` — "seção 'Agenda' dentro de
Produtividade → Agenda", "Ver Tarefas (tanto quick tasks quanto tasks com prazos)" e "Mesmo
componente que está hoje em tarefas → Agenda". A criação de eventos/tarefas é a feature 103; o
arrastar é a 104.

A página já existe e é boa: `/tasks/agenda` (`AgendaCalendar.tsx`, registrada em `src/routes.tsx`)
embrulha `AgendaGrid` num `PageShell`, e `AgendaGrid` é o **mesmo componente** renderizado na aba
"Agenda" de `/tasks` (`TaskList.tsx:1320-1328`) — a extração foi feita justamente para isso na
feature 097. Ela já mostra tarefas com prazo, tarefas pontuais como bolinhas (feature 070, `is_quick`
→ `QuickTaskDotRow`), subtarefas com prazo próprio (048), doses (071), consultas (061) e eventos de
projeto, em Mês/Semana/Dia.

O que falta é o caminho até ela. A feature 016 criou o item "Agenda" na sidebar; a feature 023
**tirou** — encolheu `NAV_PRODUTIVIDADE` para "Tarefas + Projetos" e transformou Agenda em aba de
`/tasks`. Hoje `NAV_PRODUTIVIDADE` (`src/components/app-sidebar.tsx:88-99`) lista Tarefas, Projetos,
Notas e Lista de Compras: `/tasks/agenda` continua no ar, mas não há link nenhum para ela em lugar
nenhum do app. O pedido reverte, explicitamente, aquela decisão da 023.

## Decisões

- **Item "Agenda" volta a `NAV_PRODUTIVIDADE`**, entre "Tarefas" e "Projetos" — a mesma posição que
  a feature 016 usava. Isto **revoga a parte "Agenda vira só aba"** da decisão da 023; a revogação é
  do usuário, no `prompt:`, e fica registrada aqui para não ser "corrigida" de volta numa próxima
  sessão.
- **A URL continua `/tasks/agenda`.** Não se cria `/agenda` no topo: duas URLs para a mesma tela
  quebram bookmark e histórico, e o precedente do próprio grupo é claro — "Projetos" é item de
  Produtividade e mora em `/tasks/projects`. "Seção dentro de Produtividade" é o que o **grupo da
  sidebar** define, não o prefixo da rota.
- **A aba "Agenda" dentro de `/tasks` continua existindo** (`TaskList.tsx:969`, `:1320`). Ela é a
  Agenda *no recorte em que o usuário já está* (mesmo filtro de projeto, mesma sessão), e a página é
  a Agenda como destino. São o mesmo `AgendaGrid`, então não há custo de manutenção em ter as duas —
  e tirar a aba seria remover algo que o pedido não pediu para remover.
- **Nenhuma mudança em `AgendaGrid`.** "Mesmo componente que está hoje em tarefas → Agenda" é
  literalmente o estado atual: `AgendaCalendar` renderiza `<AgendaGrid />` sem props, e sem props
  ela é dona do próprio filtro de projeto (semeado por `readTaskProjectFilter`, feature 097) e mostra
  o `<Select>` interno. É esse modo não-controlado que sustenta a rota standalone.
- **"Ver Tarefas (quick tasks e tasks com prazos)" já está pronto** — `splitAgendaItems`
  (`src/domain/tasks/calendar.ts:178`) separa pontuais (bolinhas) de tarefas com horário (blocos) e
  sem horário (faixa "Sem horário"). Esta feature não reimplementa nada disso; ela **prova** com
  teste, porque é um item explícito do pedido e hoje não há teste que olhe a página `/tasks/agenda`
  sob esse ângulo.
- **`isNavItemActive` não muda** (`src/components/nav-main.tsx:24-32`): `"/tasks"` já é comparado com
  igualdade exata, então `/tasks/agenda` não acende "Tarefas" por engano, e o item novo acende pela
  regra genérica. Vale teste, não código.
- **O cabeçalho da página ganha um botão "Ir para Tarefas"** (`asChild` + `<Link to="/tasks">`), o
  caminho de volta que a página não tem hoje — agora que ela deixa de ser um beco alcançado só pela
  URL e vira destino de primeira classe da sidebar.
- **Sem migration, sem API nova.** É navegação.
- **Descartado — mover `AgendaCalendar.tsx` para uma pasta `src/pages/admin/agenda/`**: o arquivo é
  um `PageShell` de 14 linhas em cima de `AgendaGrid`, que vive (e continuará vivendo, com a 103 e a
  104) em `src/pages/admin/tasks/`. Separar as duas por pasta só criaria um import atravessando
  módulos para nada.

## Tarefas

- [x] `src/components/app-sidebar.tsx`: `{ title: "Agenda", url: "/tasks/agenda" }` em
      `NAV_PRODUTIVIDADE`, entre "Tarefas" e "Projetos", com um comentário curto dizendo que isto
      reverte a redução feita pela feature 023 a pedido do usuário.
      Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/AgendaCalendar.tsx`: botão "Ir para Tarefas" nas `actions` do
      `PageShell` (`variant="outline"`, `asChild` + `<Link to="/tasks">`), e revisar a `description`
      da página para mencionar tarefas pontuais além de tarefas/eventos/pagamentos.
      Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/agenda-navigation.test.tsx` (novo, molde de
      `notes-navigation.test.tsx`): a sidebar renderiza o item "Agenda" dentro do grupo
      "Produtividade" apontando para `/tasks/agenda`. Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: `/tasks/agenda` resolve contra `appRoutes` (`matchRoutes`) e monta a página de
      verdade — o título "Agenda" e o eyebrow "Produtividade" aparecem.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: estado ativo — em `/tasks/agenda` o item "Agenda" fica ativo e o item "Tarefas"
      **não** (a igualdade exata de `isNavItemActive` para `/tasks`); em `/tasks` acontece o
      contrário. Verificação: `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/__tests__/AgendaCalendar.test.tsx` (novo): a página standalone mostra,
      no mesmo dia, uma tarefa com prazo **e horário** (bloco na grade de horas), uma tarefa com
      prazo **sem** horário (faixa "Sem horário") e uma tarefa pontual (`is_quick`, bolinha) — o
      item "Ver Tarefas (tanto quick tasks quanto tasks com prazos)" do pedido, provado onde ele foi
      pedido. Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: a página é o `AgendaGrid` **não controlado** — o `<Select>` de projeto interno
      aparece (ao contrário da aba dentro de `/tasks`, onde ele é escondido) e recorta os itens.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: estados de carga e erro da página — `TableLoadingSkeleton` enquanto as buscas
      estão em voo e toast destrutivo quando `fetchTasks` rejeita, sem tela em branco.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Não-regressão: a aba "Agenda" dentro de `/tasks` continua funcionando e continua **sem** o
      `<Select>` interno (`AgendaGrid.test.tsx` já cobre; conferir que segue verde).
      Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      arquivos/testes antes e depois em `## Notas`.
- [x] Verificação do pedido literal: existe "Agenda" como seção dentro de Produtividade na sidebar,
      ela abre o **mesmo** componente da aba Agenda de Tarefas, e nela se veem tanto quick tasks
      quanto tarefas com prazo. Rastreabilidade trecho → teste em `## Notas`.

## Prompts

_(Nenhum pedido novo do usuário durante a implementação — tudo saiu do `prompt:` do frontmatter.)_

## Notas

- **Nada de `AgendaGrid` mudou**, como as Decisões previam. O diff de produção da feature são duas
  linhas de navegação: o item na sidebar (`app-sidebar.tsx`) e o botão de volta na página
  (`AgendaCalendar.tsx`). Todo o resto é teste.

- **Desvio (pequeno, fora da lista): corrigido um comentário de `src/routes.tsx`.** A justificativa
  da remoção de `/tasks/gantt` (feature 044) afirmava em presente que "`app-sidebar.tsx` só lista
  `/tasks` e `/tasks/projects`" — verdadeiro até esta feature, falso depois dela. O argumento
  continua o mesmo (o Gantt é que não está listado); só a enumeração foi acertada, para o comentário
  não virar uma armadilha na próxima leitura.

- **Desvio (pequeno): `findBy*` com timeout de 15s no teste que monta a rota.** O elemento de
  `/tasks/agenda` em `appRoutes` é `lazy()`, e o `import()` do módulo da página leva ~2,3s na
  primeira transformação do Vite dentro do Vitest — acima do timeout padrão de 1s do `findBy*`. Sem
  o timeout explícito o teste falha em "carregando" (o fallback do `Suspense`), o que parece
  regressão e não é. `notes-navigation.test.tsx`, que serviu de molde, não precisou disso porque a
  página de Notas puxa uma árvore de imports bem menor que a da Agenda.

- **Contagem da suíte** (`npm test`): antes 247 arquivos / 2798 testes; depois **249 arquivos /
  2812 testes, 0 falhas**. Os 2 arquivos e 14 testes novos são exatamente os desta feature
  (`agenda-navigation.test.tsx`, 6; `AgendaCalendar.test.tsx`, 8). `npm run build` OK,
  `npm run lint` com 0 erros (90 warnings de `react-refresh/only-export-components` pré-existentes,
  nenhum nos arquivos tocados), `npm run check:bundle` "Bundle budget OK". Uma das rodadas acusou
  "2 errors" de teardown (com 0 testes falhando) e as duas rodadas seguintes saíram limpas — é o
  flake de teardown já conhecido da suíte, não regressão desta feature.

### Rastreabilidade — cada trecho do `prompt:` e o artefato que o prova

O primeiro bullet do `prompt:` ("botão 'recorrências' em tarefas") foi entregue pela feature 101 e
está fora do escopo desta; os itens "criar Eventos" e "criar por arrastar" são as features 103 e 104,
por decisão registrada no Contexto. O que esta feature responde é o resto do segundo bullet:

| Trecho do `prompt:` | Artefato que prova |
| --- | --- |
| "seção 'Agenda' dentro de Produtividade → Agenda" | `agenda-navigation.test.tsx` → "existe dentro do grupo Produtividade e aponta para /tasks/agenda" (o link é buscado **dentro** do `<li>` do grupo, não solto na tela) e "fica entre 'Tarefas' e 'Projetos'…" (ordem exata dos 5 hrefs do grupo) |
| …e a seção abre de verdade, não um 404 | `agenda-navigation.test.tsx` → "a URL resolve para uma rota registrada, não para o 404" (`matchRoutes(appRoutes, "/tasks/agenda")`, sem `*` no caminho) e "o elemento casado monta a página de verdade" (título `Agenda` h1 + eyebrow `Produtividade`) |
| …e o realce da sidebar não mente | `agenda-navigation.test.tsx` → "em /tasks/agenda: 'Agenda' ativo, 'Tarefas' não" e o simétrico em `/tasks` (`data-active`) |
| "Mesmo componente que está hoje em tarefas → Agenda" | `AgendaCalendar.test.tsx` monta a página e exercita a mesma grade (abas Mês/Dia, faixa "Sem horário", bolinhas); a aba dentro de `/tasks` continua verde em `AgendaGrid.test.tsx` → "controlada, obedece à prop e não desenha um segundo seletor de projeto" e em `TaskList.project-filter.test.tsx` → "escolher um projeto na Lista mantém o mesmo recorte no Kanban, no Gantt e na Agenda". As duas telas exercitam o mesmo `AgendaGrid`, cada uma no seu modo (não controlado / controlado), provado por `AgendaCalendar.test.tsx` → "renderiza o `<Select>` de projeto interno — o que a aba dentro de /tasks esconde" |
| "Ver Tarefas (tanto quick tasks quanto tasks com prazos)" | `AgendaCalendar.test.tsx` → "na visão Dia, cada forma cai no seu lugar (bloco, faixa 'Sem horário' e bolinha)" — tarefa com prazo+horário vira bloco com "14:00" dentro e **fora** da faixa; tarefa com prazo sem horário vira chip **dentro** da faixa; `is_quick` vira bolinha no grupo "Tarefas pontuais às 08:00". E "na visão Mês (a padrão da página) as três aparecem no mesmo dia" |
| …sem tela em branco no caminho | `AgendaCalendar.test.tsx` → "mostra o esqueleto enquanto as buscas estão em voo…" (`.animate-pulse` presente, some quando a promise resolve) e "falha ao carregar vira toast destrutivo, e não tela em branco" |
| Caminho de volta da página (decisão desta feature, não do `prompt:`) | `AgendaCalendar.test.tsx` → "mostra título/eyebrow e o caminho de volta 'Ir para Tarefas'" (`href="/tasks"`) |
