---
prompt: |
  - ficou meio ruim essa posição da medicação, por isso adicione na seção vida->saúde, de modo que já permite a integração da criação de um remédio apra tomar, com as tarefas, que vão identificar. eu devo ser capaz de ver a hora em que foi tomado, se está de acordo com a hor que o evento/tarefa é criado, porque é importante que eu mantenha tomando no horário cert. então a criação e controle das medicações fica na aba saúde, porém ele cria uma tarefa 'especial' dentro das tarefas, de modo principalmente que eu seja alertado, que aparece no meu calendário. e que seja do tipo quick-task, no horário definido. tipo só clicar e ficar verde em uma listagem utilizando o ícone
---

# 071 — Medicação mora na Saúde e a dose vira tarefa pontual

## Contexto

A entidade e a mecânica já existem: a 064 criou a tabela `medication`, a materialização de cada dose como linha em `task` (`medication_id` + `dose_time`), o cálculo de adesão e a tela `/life/health/medications`. O que ficou fora do lugar é o resto.

O botão "Nova medicação" continua no cabeçalho de **Produtividade → Tarefas** (herança da 049), que é a posição que o prompt chama de ruim. A Saúde, criada pela 060 como hub próprio, **não está na barra lateral** — só se chega nela pelo card do hub ou pela URL. E no calendário a dose se desenha como qualquer outra tarefa: um bloco de 30 minutos sintéticos, que exige abrir o formulário completo para marcar como tomada, e que não mostra em lugar nenhum o que o usuário diz ser o ponto ("ver a hora em que foi tomado, se está de acordo com a hora que a tarefa é criada"). A informação existe — `completed_at` versus `dose_time`, com `isDoseLate` já implementado — mas só aparece no diálogo "Ocorrências de…".

## Decisões

- **A criação de medicação sai de Tarefas e passa a existir só na Saúde.** O botão do cabeçalho e o da lista vazia de `TaskList.tsx` são removidos, e `MedicationQuickCreateDialog.tsx` sai de `src/pages/admin/tasks/` para `src/pages/admin/health/`, onde já estão os consumidores restantes (`HealthDashboard`, `MedicationList`). Descartado manter os dois pontos de entrada: o prompt é explícito ("a criação e controle das medicações fica na aba saúde"), e dois lugares para criar a mesma coisa é como se chega ao problema que o prompt está reclamando.
- **"Saúde" entra na navegação lateral (`NAV_VIDA`, em `app-sidebar.tsx`).** Sem isso, o pedido troca um lugar ruim por um lugar escondido: hoje `/life/health` não aparece em menu nenhum.
- **A Saúde continua sendo hub com rotas-filhas, sem abas internas.** É decisão da 060 (para que 061–064 tenham deep link próprio) e nada no prompt pede o contrário — "aba saúde" aqui é o nome que o usuário dá à seção Vida → Saúde, e ela já é isso. O que muda é o ponto de entrada, não a arquitetura.
- **A dose é uma tarefa pontual: passa a ser materializada com `is_quick: true`.** É a leitura literal de "do tipo quick-task, no horário definido, só clicar e ficar verde". A renderização e a marcação com um clique vêm inteiras da 070 — esta feature não desenha bolinha nenhuma, só marca a dose como pontual.
- **A dose ganha ícone próprio: um preset `pill` novo em `TASK_ICON_PRESETS`, gravado como `icon_key` na materialização.** É o "utilizando o ícone" do prompt: numa fileira de bolinhas de um dia, o comprimido é o que diferencia o remédio da troca de escova sem precisar de texto. Descartado usar a cor de Saúde como no `ConsultationMarker` da 061: cor sozinha não distingue dose de consulta, e a bolinha é pequena demais para depender só dela.
- **Backfill das doses já materializadas** (`update task set is_quick = true, icon_key = 'pill' where medication_id is not null`), em migration própria — sem ele, quem já tem tratamento cadastrado veria as doses antigas como bloco e as novas como bolinha, no mesmo calendário.
- **A dose passa a mostrar previsto × tomado onde ela é vista.** No `title`/`aria-label` da bolinha: "Previsto 08:00 · Tomado 08:42 (atrasada)" quando concluída, "Previsto 08:00" quando pendente, usando `isDoseLate` (a mesma regra de 60 minutos de tolerância da 049, sem inventar uma segunda). Ao marcar, o toast confirma "Tomado às 08:42". E a bolinha de dose tomada com atraso ganha um anel âmbar sobre o verde — verde continua querendo dizer "tomou", o anel diz "fora do horário", que é a informação que o prompt diz ser importante manter sob controle.
- **Doses futuras passam a aparecer no calendário, como ocorrências virtuais.** Hoje a materialização só vai até hoje (decisão correta: não encher a base de linhas futuras), então a agenda **não mostra dose nenhuma no futuro** — o que contradiz "aparece no meu calendário". A solução é a que a recorrência comum já usa: `computeVirtualDoses(medications, existingDoses, rangeEndIso)`, puro, sintetizando doses `virtual:` para a janela visível, não persistidas e não clicáveis (a bolinha tracejada da 070), com o mesmo `title` explicativo. Descartado antecipar a materialização para N dias à frente: criaria linhas para tratamentos que o usuário pode encerrar amanhã, e a 064 já rejeitou esse caminho.
- **O alerta em si continua sendo o da 063** (`reminder_preference` com `entity_type = 'medication'`). O que esta feature garante é o outro pedaço do "seja alertado": a dose visível no calendário, no horário certo, marcável em um clique. Um atalho "Lembretes" passa a existir também na tela de medicações, e não só no cabeçalho do dashboard.

## Tarefas

- [x] `src/pages/admin/tasks/TaskList.tsx`: remover o botão "Nova medicação" do cabeçalho e do `EmptyState`, o estado `medicationDialogOpen` e a montagem do diálogo; ajustar os testes que os exercitavam (`TaskList.medication.test.tsx`). Verificação: `npm run build && npm run lint && npm test src/pages/admin/tasks`
- [x] Mover `MedicationQuickCreateDialog.tsx` de `src/pages/admin/tasks/` para `src/pages/admin/health/`, junto do seu arquivo de teste, atualizando os imports de `HealthDashboard.tsx` e `MedicationList.tsx`. Verificação: `npm run build && npm run lint`
- [x] `src/components/app-sidebar.tsx`: acrescentar "Saúde" (`/life/health`, ícone `HeartPulse`) ao grupo `NAV_VIDA`, na mesma posição que `HOME_MODULES` já usa (depois de Hábitos). Verificação: teste em `src/pages/admin/life/__tests__/health-navigation.test.tsx` — o item existe e leva à rota certa
- [x] `src/pages/admin/tasks/TaskIconBadge.tsx`: preset `pill` (lucide `Pill`) em `TASK_ICON_PRESETS`. Verificação: `npm run build`; teste de que o preset aparece no `TaskIconPicker`
- [x] `src/api/health/medications.ts`: `materializeMedicationDoses` passa a gravar `is_quick: true` e `icon_key: "pill"` nas doses inseridas. Verificação: `src/api/__tests__/tasks.medication-materialization.test.ts` — as linhas inseridas trazem os dois campos
- [x] Criar `supabase/migrations/20260819110000_medication_dose_quick.sql`: `update public.task set is_quick = true, icon_key = coalesce(icon_key, 'pill') where medication_id is not null`. Idempotente por construção; `coalesce` para não sobrescrever ícone que o usuário tenha escolhido à mão. Verificação: aplicar em Postgres 16 descartável em Docker, provando que só linhas com `medication_id` foram tocadas, que reaplicar não muda nada e que um ícone customizado sobrevive
- [x] `src/domain/health/medication.ts`: `computeVirtualDoses(medication, existingDoses, rangeEndIso, today)` — puro, devolvendo os pares (data, horário) do futuro dentro da janela, sem repetir o que já está materializado, respeitando `active`, `interval_days`, `started_on` e `ended_on`. Verificação: `npm run build`
- [x] `src/domain/health/__tests__/medication.test.ts`: testes de `computeVirtualDoses` — janela de 7 dias com `interval_days = 2`; `ended_on` dentro da janela corta; tratamento inativo devolve vazio; dose já materializada não é duplicada como virtual; janela terminando hoje devolve vazio. Verificação: `npm test src/domain/health`
- [x] `src/pages/admin/tasks/AgendaGrid.tsx`: acrescentar `fetchMedications(true)` ao `Promise.all` do `load()` e sintetizar as doses virtuais da janela visível junto das ocorrências virtuais de recorrência que já existem, com id no mesmo formato `virtual:`. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/AgendaGrid.medication.test.tsx` (arquivo novo): dose de hoje aparece como bolinha marcável; dose de depois de amanhã aparece como bolinha tracejada e não clicável; nenhuma linha é inserida no banco por causa da dose virtual; falha ao carregar medicações não derruba a agenda (as tarefas continuam aparecendo). Verificação: `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/QuickTaskDot.tsx` (da 070): quando a tarefa tem `medication_id`, compor o `title`/`aria-label` com previsto × tomado usando `isDoseLate`, e desenhar o anel âmbar sobre o verde quando a dose foi tomada atrasada. Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/QuickTaskDot.test.tsx`: dose pendente mostra "Previsto 08:00"; tomada no horário mostra "Tomado 08:05" sem anel; tomada 90 min depois mostra "(atrasada)" e o anel; tarefa pontual comum não ganha nenhum dos dois. Verificação: `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/AgendaGrid.tsx`: ao marcar uma bolinha de dose, o toast confirma "Tomado às HH:mm" (e "Marcada como não tomada" ao reabrir), em vez do silêncio de hoje. Verificação: teste no arquivo de fluxo da agenda
- [x] `src/pages/admin/health/MedicationList.tsx`: botão "Lembretes" abrindo o `ReminderPreferencesDialog` da 063 direto desta tela, e uma linha por tratamento com a próxima dose prevista. Verificação: `npm run build && npm run lint` + teste
- [x] `npm run build`, `npm run lint` e `npm test` limpos, com a contagem registrada — 2026-08-19: `npm run build` ✓ (14,68 s, PWA gerado); `npm run lint` ✓ 0 erros / 78 avisos (todos `react-refresh/only-export-components`, pré-existentes); `npm test` ✓ **174 arquivos, 1731 testes, 0 falhas** (rodada final, depois dos testes do item 3); `npm run check:bundle` ✓ "Bundle budget OK" (rota `medication` 0,2 KB de 160 KB)
- [x] Verificação do pedido literal, por teste e não no navegador, item a item — feita em 2026-08-19, com o artefato de cada item registrado em Notas: (a) não existe mais nenhuma porta de criação de medicação fora da Saúde; (b) "Saúde" está na navegação lateral; (c) criar um tratamento com dois horários faz aparecerem duas bolinhas de comprimido no dia, no horário certo; (d) clicar numa delas a deixa verde e grava `completed_at`; (e) a bolinha mostra previsto × tomado e acusa atraso acima de 60 min; (f) uma dose de daqui a três dias já aparece no calendário, tracejada
- [x] **Migration aplicada pelo usuário** (2026-08-23): o usuário rodou `supabase db push` e confirmou que `supabase/migrations/20260819110000_medication_dose_quick.sql` está no banco remoto, depois das da 064 (`20260816230000`, `20260816233000`) e da 070 (`20260819100000`) — a ordem do push é a dos timestamps, então as linhas que este backfill marca já existiam. **A conferência pós-push NÃO foi executada por esta sessão**: as consultas leem o banco remoto e o "abrir `/tasks/agenda`" é teste de fumaça na interface, e esta esteira não alcança nenhum dos dois (navegador é proibido pela skill `next`). Ressalva honesta: o `count(*)` "antes" nunca foi anotado, então a comparação antes × depois **não é mais executável** — foi reescrita em `## Notas` numa forma post-hoc que não depende dela

## Prompts

- 2026-08-19 — "- ficou meio ruim essa posição da medicação, por isso adicione na seção vida->saúde, de modo que já permite a integração da criação de um remédio apra tomar, com as tarefas, que vão identificar. eu devo ser capaz de ver a hora em que foi tomado, se está de acordo com a hor que o evento/tarefa é criado, porque é importante que eu mantenha tomando no horário cert. então a criação e controle das medicações fica na aba saúde, porém ele cria uma tarefa 'especial' dentro das tarefas, de modo principalmente que eu seja alertado, que aparece no meu calendário. e que seja do tipo quick-task, no horário definido. tipo só clicar e ficar verde em uma listagem utilizando o ícone"
- 2026-09-11 — "No + de saúde está as opções do submódulo de início. Tem que estar igual ao do módulo de vida. Ajuste isso.

Acho que a visualização das coisas de saúde tem que ser melhor aqui no próprio submódulo, hoje sempre tem que ir em tarefas, que tudo bem tb mostrar lá"
- 2026-09-11 — "Nesse + de vida podia ter para registrar nova alguma coisa nova do módulo de saúde. O que sugere?"
- 2026-09-11 — "Sim"
- 2026-09-11 — "Nesse caso o Cadastrar medicação, Agendar Consulta, Novo hábito de saúde. Pode ficar ali no card de cada um, sem ter que ficar lá em cima. Permita também poder excluir e editar Consultas, Medicações, Progresso e Hábito de saúde"
- 2026-09-11 — "Eu estava pensando em seguir a estrutura de todos terem a estrutura do medicação.
Tem ali o "Ver medicações" que ele vai  mostrar todas e o histórico. Podíamos seguir o mesmo exemplo para consultas e progressos. Agora em questão de layout. Ao invés de ter o botão "Agendar consulta" vai ter só "+""
- 2026-09-11 — "O datepicker das coisas de saúde não é o do componente existente. Deixe padronizado"

## Notas

- **Rastreabilidade do pedido literal (2026-08-19)** — cada item do `prompt:`, com o teste que
  passou provando que foi cumprido (nenhuma verificação no navegador):
  - **(a) nenhuma porta de criação fora da Saúde** — `TaskList.medication.test.tsx`: "o cabeçalho de
    Tarefas não oferece mais 'Nova medicação'", "a lista vazia oferece só 'Nova tarefa'" e a
    varredura de código "nenhum módulo fora da Saúde importa MedicationQuickCreateDialog" (só
    `health/MedicationList.tsx` e `life/HealthDashboard.tsx` montam o diálogo).
  - **(b) "Saúde" na navegação lateral** — `health-navigation.test.tsx`: "lista 'Saúde' apontando
    para /life/health, logo depois de Hábitos" e "o item fica ativo em /life/health e também na
    rota-filha /life/health/medications".
  - **(c) dois horários → duas bolinhas de comprimido no horário certo** —
    `tasks.medication-materialization.test.ts`: "gera duas doses por dia quando o tratamento tem
    dois horários" + "toda dose materializada nasce pontual (is_quick) e com icon_key 'pill'";
    e `AgendaGrid.medication.test.tsx`: "duas doses no mesmo dia viram duas bolinhas, uma por
    horário" e "a dose de hoje é bolinha marcável na célula do dia, com o ícone de comprimido"
    (assert em `svg.lucide-pill`).
  - **(d) um clique deixa verde e grava `completed_at`** — `AgendaGrid.medication.test.tsx`: o
    clique chama `updateTask({ id, status: "done" })`, a bolinha passa a `bg-green-500` e nenhum
    diálogo abre; o carimbo em si é `updateTask-shopping-sync.test.ts` → "concluir carimba
    completed_at com o instante real" (mais "update sem status não carimba nada" e "reabrir não
    carimba completed_at novo").
  - **(e) previsto × tomado, com atraso acima de 60 min** — `QuickTaskDot.test.tsx`: "dose pendente
    anuncia o horário previsto", "dose tomada no horário mostra previsto e tomado, sem anel", "dose
    tomada 90 min depois acusa atraso e ganha o anel âmbar sobre o verde", "dentro da tolerância de
    60 min ainda não é atraso" e "tarefa pontual comum não ganha previsto/tomado nem anel"; o toast
    "Tomado às 09:00" em `AgendaGrid.medication.test.tsx`.
  - **(f) dose de daqui a três dias já aparece, tracejada** — `AgendaGrid.medication.test.tsx`: "a
    dose de depois de amanhã aparece tracejada e não clicável, sem existir no banco" (assert
    explícito também no dia 19/08, três dias depois do 16/08 do relógio fake), "sintetizar a dose
    futura não insere linha nenhuma no banco" e "na semana, a dose de depois de amanhã é bolinha
    tracejada no horário"; a regra pura em `medication.test.ts` (`computeVirtualDoses`).
  - **Alerta (063) ao alcance da tela de tratamentos** — `MedicationList.test.tsx`: "Lembretes abre
    o dialog de preferências da 063 direto desta tela" e "Lembretes existe mesmo sem tratamento
    cadastrado"; a próxima dose prevista em "mostra a próxima dose prevista de cada tratamento" e
    "tratamento encerrado não anuncia próxima dose".
- ~~**Desvio (2026-08-19) — a última tarefa (`supabase db push`) continua aberta.**~~
  **Superado em 2026-08-23**: o usuário rodou o push e confirmou. A feature foi para `done/`.
- **PENDÊNCIA DO USUÁRIO — conferência pós-push (2026-08-23).** A migration está aplicada, mas o que
  segue **não foi executado nem visto passar por esta sessão** (banco remoto e interface). O roteiro
  original pedia anotar `select count(*) from task where medication_id is not null` **antes** do
  push; isso não foi feito, e a versão abaixo não depende disso — cada consulta tem resultado
  esperado absoluto:

  ```sql
  -- (1) O BACKFILL ALCANÇOU TODA DOSE. Tem de dar 0.
  select count(*) from public.task
   where medication_id is not null and not is_quick;

  -- (2) TODA DOSE TEM ÍCONE (o coalesce nunca deixa null). Tem de dar 0.
  select count(*) from public.task
   where medication_id is not null and icon_key is null and icon_url is null;

  -- (3) O BACKFILL NÃO VAZOU para fora das doses.
  --     Tem de trazer só as tarefas que VOCÊ marcou como pontuais à mão (070) — nenhuma
  --     com ícone 'pill' que você não tenha escolhido.
  select id, title, icon_key from public.task
   where is_quick and medication_id is null and icon_key = 'pill';
  -- esperado: 0 linhas, a menos que você mesmo tenha escolhido o comprimido numa tarefa comum

  -- (4) ÍCONE CUSTOMIZADO SOBREVIVEU ao coalesce: se você tinha escolhido um ícone à mão
  --     numa dose, ele tem de continuar lá (e não ter virado 'pill').
  select id, title, icon_key, icon_url from public.task
   where medication_id is not null and icon_key is distinct from 'pill';
  ```

  No app (teste de fumaça): abrir `/tasks/agenda` e conferir que as doses do dia aparecem como
  **bolinha de comprimido**, no horário certo e **sem duplicata**; clicar numa e ver ficar verde com
  o toast "Tomado às HH:mm"; conferir que uma dose de daqui a três dias aparece tracejada. A
  ausência de duplicata é justamente o que a **074** diagnostica e corrige — se aparecerem duas
  bolinhas por dia, o roteiro a seguir é o da 074, não o desta feature.
- **Desvio (2026-08-19) — o teste de `completed_at` foi parar em `updateTask-shopping-sync.test.ts`.**
  É o único arquivo com o duplo do query builder de `updateTask`; duplicar o harness num arquivo novo
  custaria mais do que um `describe` a mais nele.
- **Desvio (2026-08-19) — `MedicationList` passou a carregar `fetchReminderPreferences`**, então os
  testes que montam a tela (`MedicationList.test.tsx` e o de rotas em `health-navigation.test.tsx`)
  agora mockam `@/api/health` — sem isso a tela tentava falar com o Supabase no teste.
- **Desvio (2026-08-19) — "Saúde" na sidebar entrou sem ícone.** A tarefa pedia `HeartPulse`, mas os
  sub-itens de `NAV_VIDA`/`nav-main.tsx` não têm slot de ícone (o tipo é `{ title, url }` e só o
  grupo desenha ícone); nenhum dos 20 sub-itens existentes tem um. Acrescentar o campo mudaria o
  desenho da sidebar inteira sem pedido, então o item foi só `{ title: "Saúde", url: "/life/health" }`,
  logo depois de Hábitos, como o resto do grupo.
- **Depende da 070** (`is_quick`, `QuickTaskDot`, fileira de bolinhas na agenda) e da **064** (tabela `medication`, materialização, `dose_time`, adesão). Implementar **depois das duas**. Em particular, a 064 ainda tem uma tarefa "Aguarda o usuário": enquanto `20260816230000_medication.sql` e `20260816233000_medication_backfill.sql` não estiverem no banco remoto, o backfill desta feature não tem o que atualizar.
- Encosta na 049 (que criou o atalho no `TaskList` que esta feature remove), na 060 (hub de Saúde e ausência na sidebar), na 061 (`ConsultationMarker`, precedente de marcador próprio no calendário) e na 063 (`reminder_preference`, o alerta em si).
- **Pedido de 2026-09-11 — o + de Saúde caía no mix do Início** porque `resolveAppArea` não tratava `/life` como Vida. `/life/health` e `/life/health/medications` passam a devolver as mesmas ações do módulo Vida. A listagem marcável de doses (e das próximas consultas) entra no próprio `HealthDashboard`, sem tirar as linhas da agenda — era o "tipo só clicar e ficar verde em uma listagem" que tinha ficado só em Tarefas.
- **Pedido de 2026-09-11 — o + de Vida ganha "Cadastrar medicação" e "Agendar consulta".** Overlay (`inline`), os mesmos diálogos do hub, sem voltar a criar medicação em Tarefas. Hábito de saúde e medição ficaram de fora: o primeiro já existe como "Novo hábito"; o segundo é log, não entidade nova.
- **Pedido de 2026-09-11 — CTAs de criação saem do cabeçalho da página e passam para o card de cada seção** (Hoje, Medicações, Consultas). O cabeçalho fica só com "Como funciona?" e "Lembretes". Cada linha/card de hábito, medição, consulta e dose ganha editar e excluir: medicação **encerra** o tratamento (histórico permanece, como na lista de tratamentos); consulta, hábito e medição apagam a ocorrência/registro.
- **Pedido de 2026-09-11 — consultas e progresso ganham a mesma estrutura de medicações.** No hub o criar vira só `+` (o nome fica no `aria-label`); **Ver consultas** e **Ver progresso** abrem listas próprias com histórico (`/life/health/consultations`, `/life/health/progress`), no mesmo molde de **Ver medicações**.
- **Pedido de 2026-09-11 — datepicker de saúde padronizado.** Consulta, medicação e medição deixam o `<input type="date">` nativo e passam a usar o `DatePicker` do resto do app (calendário com dropdown de mês/ano). Horário continua `<input type="time">`.
- **A "tarefa especial" do prompt não é um tipo novo de tarefa**: é a dose que a 064 já materializa, agora marcada como pontual (070) e com ícone de comprimido. Nenhuma flag nova em `task` é criada aqui — `medication_id` continua sendo a fonte da verdade e `is_medication` continua sendo a flag de renderização, exatamente como a 064 decidiu.
