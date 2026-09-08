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

# 104 — Arrastar na grade de horas para criar (tipo Google Agenda)

## Contexto

Cobre o item "Permitir criar eventos com arrastar no próprio layout (Tipo Google Agendas)" do
segundo bullet do `prompt:`. **Depende da 103**, que é quem constrói os dialogs de criação de evento
e de tarefa; esta feature só acrescenta o gesto que os abre já preenchidos.

A grade de horas já tem toda a geometria necessária. `AgendaHourGrid.tsx` desenha, por dia, uma
coluna `relative` de altura fixa `HOURS.length * HOUR_ROW_PX` (24 × 56px, `:27-28`, `:329-334`), com
os itens posicionados de forma absoluta em `top`/`height` percentuais calculados por
`layoutTimedItems` (`src/domain/tasks/calendar.ts:273`). O que não existe é qualquer handler de
ponteiro no **fundo** dessa coluna: clicar num espaço vazio não faz absolutamente nada hoje. Depois
da 103 haverá caminho de criação, mas ele começa sempre por um menu ou por um `+` — o pedido é
desenhar a faixa de horário com o próprio gesto.

Não há biblioteca de drag para isto no projeto: `@dnd-kit` é usado para reordenação de listas e o
Gantt é do `@svar-ui/react-gantt`, com API própria (`api.intercept("drag-task", …)`,
`GanttChart.tsx:482`). O gesto aqui é ponteiro puro sobre um canvas próprio.

## Decisões

- **Gesto**: `pointerdown` no fundo da coluna do dia → `pointermove` → `pointerup`. Durante o
  arrasto, um bloco fantasma translúcido mostra a faixa selecionada com o rótulo `HH:mm – HH:mm`,
  para o usuário ver o que vai criar antes de soltar.
- **Snap de 15 minutos** (`SNAP_MINUTES = 15`) e **duração mínima de 15 minutos**. Sem snap, um
  arrasto de mouse produz "09:07 – 10:23" e o usuário conserta no formulário toda vez — o gesto
  perderia a graça.
- **Clique sem mover = faixa padrão de `DEFAULT_ITEM_DURATION_MINUTES` (30 min)** começando no slot
  clicado. É o caso degenerado do mesmo gesto, é o que o Google Agenda faz, e é o que dá um caminho
  de criação por toque (ver a decisão de touch abaixo).
- **Arrasto invertido (de baixo para cima) é válido** — normaliza início/fim. Quem arrasta "das 11h
  para as 9h" quer 09:00–11:00, não um erro.
- **Clamp no fim do dia**: a faixa nunca passa de 24:00 nem começa antes de 00:00, mesmo que o
  ponteiro saia da coluna. Sair pela borda é o caminho normal de um arrasto rápido.
- **Ao soltar, abre um menu de duas opções ("Evento" / "Tarefa") ancorado na faixa**, e a escolha
  abre o dialog correspondente da 103 já preenchido. É um clique a mais que o Google Agenda, e é
  deliberado: a Agenda tem **dois** tipos de item de primeira classe, e o pedido cita os dois
  ("Permitir Criar Tarefas também"); adivinhar erraria metade das vezes. **Descartado** — abrir
  direto o dialog de evento com um botão "transformar em tarefa" dentro: esconde metade do recurso
  atrás de uma conversão, e o formulário de tarefa não é um superset do de evento.
- **Sem memória do último tipo escolhido.** Um menu que muda de padrão sozinho é estado escondido;
  o menu é o mesmo vocabulário do botão "Novo" da 103.
- **O que a faixa preenche:**
  - evento → `date`, `startTime` e `endTime` (portanto `ends_at` real, não os 30 min de fallback);
  - tarefa → `due_date`, `due_time` e `estimated_duration` (minutos da faixa), que é exatamente o
    que `getItemTimeRange` (`calendar.ts:111`) lê para desenhar o bloco de volta no mesmo lugar.
- **Onde o gesto NÃO vale, e por quê:**
  - **por cima de um item existente** — o `pointerdown` do bloco continua abrindo o item
    (`stopPropagation`); arrastar em cima de uma reunião é tentar mexer nela, não criar outra;
  - **na faixa "Sem horário"** (`UntimedStrip`) — não há eixo de tempo ali;
  - **na visão Mês** — a célula não tem eixo de tempo; lá o gesto de criar continua sendo o `+` da
    103. (Arrastar por vários dias no mês criaria evento de múltiplos dias, que `project_event` até
    representa, mas que nenhuma visão desenha hoje — seria um item invisível.)
- **Touch não inicia seleção.** Em `pointerType === "touch"`, o `pointerdown` no fundo não arrasta:
  a grade rola verticalmente (`overflow-y-auto`, `:308`), e capturar o gesto mataria o scroll no
  celular. O toque simples continua valendo como o clique degenerado (faixa de 30 min), então o
  caminho de criação existe no mobile sem quebrar a rolagem.
- **Limiar de 4px (`DRAG_THRESHOLD_PX`) antes de assumir arrasto**, com `setPointerCapture` só
  depois do limiar. Abaixo dele é clique — senão um tremor de mouse vira uma faixa de 15 min e o
  clique degenerado nunca acontece.
- **`Escape` durante o arrasto cancela** (some o fantasma, nada é criado), e soltar fora da coluna
  também cancela em vez de criar algo em horário adivinhado. Cancelar tem de ser mais fácil que
  desfazer, porque não há desfazer.
- **A matemática mora no domínio, não no componente**: `src/domain/tasks/agendaDrag.ts` (novo), puro
  e testável sem DOM. O componente só entrega offsets em pixels e a altura total da coluna. É o
  mesmo corte que `layoutTimedItems` já fez para o posicionamento.
- **Acessibilidade**: o gesto é de ponteiro e não substitui nada — o caminho por teclado é o botão
  "Novo" e o `+` por dia, ambos da 103. Fica registrado explicitamente para não passar por
  esquecimento numa revisão futura.
- **Fora de escopo**: mover ou redimensionar item **existente** por arrasto. Não foi pedido ("criar
  eventos com arrastar"), e mover uma dose de medicação ou uma ocorrência virtual abre um conjunto de
  regras próprio (série vs. ocorrência) que não cabe aqui. Editar horário continua sendo pelo dialog
  da 103.
- **Sem migration, sem API nova** — a 103 já criou tudo que grava.

## Tarefas

- [x] `src/domain/tasks/agendaDrag.ts` (novo): `SNAP_MINUTES`, `MIN_DRAG_DURATION_MINUTES`,
      `DRAG_THRESHOLD_PX` e `minutesFromOffset(offsetPx, totalPx, snapMinutes)` — converte um offset
      vertical em minutos desde a meia-noite, com snap e clamp em `[0, 1440]`.
      Verificação: `npm run build && npm run lint`
- [x] `agendaDrag.ts`: `normalizeDragRange(anchorMinutes, pointerMinutes)` →
      `{ startMinutes, durationMinutes }` — normaliza arrasto invertido, aplica duração mínima,
      e nunca deixa a faixa passar de 24:00 (encosta o início para trás se preciso).
      Verificação: `npm run build && npm run lint`
- [x] `agendaDrag.ts`: `formatRangeLabel({ startMinutes, durationMinutes })` → `"09:00 – 10:30"`,
      para o rótulo do fantasma. Exportar tudo no `index.ts` do domínio.
      Verificação: `npm run build && npm run lint`
- [x] `src/domain/tasks/__tests__/agendaDrag.test.ts` (novo): `minutesFromOffset` com snap (arredonda
      para o múltiplo de 15 mais próximo), offset negativo e offset maior que a altura (clamp), e
      altura zero (divisão por zero não pode virar `NaN`).
      Verificação: `npm test src/domain/tasks`
- [x] Mesmo arquivo: `normalizeDragRange` — arrasto normal, invertido, arrasto de zero (vira a
      duração mínima), faixa que estouraria as 24:00, e `formatRangeLabel` incluindo o caso que
      termina exatamente em 24:00. Verificação: `npm test src/domain/tasks`
- [x] `AgendaHourGrid.tsx`: estado de seleção (`dragState`: dia, `anchorMinutes`,
      `pointerMinutes`, `armed`) e handlers `onPointerDown`/`onPointerMove`/`onPointerUp` no fundo da
      coluna do dia, ignorando `pointerType === "touch"` para o arrasto e respeitando
      `DRAG_THRESHOLD_PX` antes de armar. Sem UI ainda.
      Verificação: `npm run build && npm run lint`
- [x] `AgendaHourGrid.tsx`: bloco fantasma posicionado por `top`/`height` percentuais, translúcido,
      `pointer-events-none`, com o rótulo `formatRangeLabel` e `aria-hidden`.
      Verificação: `npm run build && npm run lint`
- [x] `AgendaHourGrid.tsx`: `stopPropagation` no `pointerdown` dos blocos de item e das fileiras de
      bolinhas — arrastar sobre um item existente não pode iniciar seleção.
      Verificação: `npm run build && npm run lint`
- [x] `AgendaHourGrid.tsx`: cancelamento — `Escape` durante o arrasto e `pointercancel`/saída da
      coluna limpam o estado sem criar nada; `releasePointerCapture` no fim, sempre.
      Verificação: `npm run build && npm run lint`
- [x] `AgendaHourGrid.tsx`: nova prop opcional `onCreateInRange({ dayKey, startMinutes,
      durationMinutes })`. **Ausente = gesto desligado**, mesmo padrão "presença de prop = recurso
      aparece" que `onOpenDay` já usa — é o que mantém o drill-down "Focar dia" do Gantt intacto.
      Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: passar `onCreateInRange` para `AgendaHourGrid`, abrindo o menu "Evento /
      Tarefa" (o mesmo da 103) ancorado na faixa e, na escolha, o dialog correspondente já preenchido
      com data, horário e duração. Verificação: `npm run build && npm run lint`
- [x] `AgendaGrid.tsx`: fechar o menu sem escolher descarta a faixa (nada fica pendente em estado).
      Verificação: `npm run build && npm run lint`
- [x] `src/pages/admin/tasks/__tests__/AgendaHourGrid.drag.test.tsx` (novo): helper que faz stub de
      `getBoundingClientRect` da coluna (jsdom não tem layout) e dispara
      `pointerDown`/`pointerMove`/`pointerUp`; arrastar das 09:00 às 10:30 chama `onCreateInRange`
      com `startMinutes: 540, durationMinutes: 90`. Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: clique sem movimento chama com 30 min; arrasto invertido devolve a faixa
      normalizada; movimento abaixo do limiar conta como clique; `pointerType: "touch"` não arrasta
      (só o clique degenerado). Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: `pointerdown` em cima de um bloco existente **abre o item** e **não** dispara
      `onCreateInRange`; `Escape` no meio do arrasto não cria nada; sem a prop `onCreateInRange` o
      gesto não existe (não-regressão do "Focar dia" do Gantt).
      Verificação: `npm test src/pages/admin/tasks`
- [x] `src/pages/admin/tasks/__tests__/AgendaGrid.drag-create.test.tsx` (novo): arrastar na visão
      Dia → escolher "Evento" → o dialog abre com data/início/fim da faixa → salvar chama
      `createProjectEvent` com `ends_at` correspondente à duração arrastada.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: a mesma faixa escolhendo "Tarefa" abre o formulário com `due_date`, `due_time` e
      `estimated_duration` da faixa, e o `createTask` os grava — a tarefa reaparece no mesmo lugar da
      grade depois do reload. Verificação: `npm test src/pages/admin/tasks`
- [x] Mesmo arquivo: na visão **Mês** o gesto não existe (o caminho continua sendo o `+` da 103), e
      arrastar sobre a faixa "Sem horário" também não cria nada.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Não-regressão: `AgendaHourGrid.test.tsx` e a suíte de Agenda continuam verdes — posicionamento,
      overlap, fileiras de bolinhas e faixa "Sem horário" não podem ter mudado.
      Verificação: `npm test src/pages/admin/tasks`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos, com a contagem de
      arquivos/testes antes e depois em `## Notas`.
- [x] Verificação do pedido literal: dá para criar um evento **arrastando no próprio layout** da
      Agenda (tipo Google Agenda), com o horário desenhado pelo gesto, e a mesma faixa também cria
      tarefa. Rastreabilidade trecho → teste em `## Notas`.

## Prompts

_(Nenhum pedido novo do usuário durante a implementação — tudo saiu do `prompt:` do frontmatter.)_

## Notas

- **Ancoragem do menu na faixa, sem mudar a assinatura de `onCreateInRange`.** O plano queria o menu
  "Evento/Tarefa" ancorado na faixa, mas quando ele abre o fantasma já sumiu e não sobra elemento na
  tela para servir de gatilho — e a `AgendaGrid` só recebe `{ dayKey, startMinutes, durationMinutes }`,
  sem coordenada nenhuma. Em vez de inchar o payload com um retângulo (a assinatura está escrita no
  plano e é o que os testes de componente checam), a `AgendaGrid` embrulha a grade num `div` com
  `onPointerUpCapture` e guarda o ponto do `pointerup`: a **fase de captura** roda antes do handler da
  coluna que chama `onCreateInRange`, então quando a faixa chega o ponto já está no `ref`. O gatilho
  do `DropdownMenu` é um `<span>` de tamanho zero em `position: fixed` nesse ponto. Efeito colateral:
  `NewAgendaItemMenu` ganhou `open`/`onOpenChange` opcionais (controlado só neste call site; o botão
  "Novo" e o `+` do dia seguem se governando sozinhos).
- **`data-testid="day-column-<dia>"` na coluna do dia.** O fundo da coluna é o alvo do gesto e não tem
  texto nem papel ARIA próprio (é fundo, de propósito — quem tem papel são os itens). Sem esse
  gancho não havia como disparar `pointerdown` no lugar certo em jsdom.
- **`pointerup` agora limpa o estado antes de decidir se cria.** Achado durante a tarefa de
  cancelamento: soltar o ponteiro numa coluna diferente da do `pointerdown` (semana, ponteiro ainda
  não capturado) caía no `return` da guarda **antes** do `setDrag(null)` e deixava o fantasma
  pendurado sem dono. Agora o `pointerup` do mesmo `pointerId` sempre encerra o gesto, e só a criação
  depende de a coluna ser a mesma. Coberto por "soltar numa coluna que não é a do início".
- **Ordem dos arquivos de teste.** O harness de ponteiro (`stubColumnRect` + `pointerDown/Move/Up`)
  nasceu junto com a tarefa de cancelamento, e não na tarefa que o plano previa — sem uma assertiva
  de comportamento não dava para marcar a tarefa (regra da skill `next`, que proíbe Chrome). As
  tarefas seguintes só acrescentaram casos ao mesmo arquivo.
- **Contagem da suíte** (`npm test`, projeto inteiro): antes da 104, 255 arquivos / 2867 testes;
  depois, **258 arquivos / 2901 testes** — +3 arquivos (`agendaDrag.test.ts` 15,
  `AgendaHourGrid.drag.test.tsx` 13, `AgendaGrid.drag-create.test.tsx` 6) e +34 testes. `npm run build`,
  `npm run lint` (0 erros, 91 warnings pré-existentes de `react-refresh/only-export-components`) e
  `npm run check:bundle` ("Bundle budget OK") limpos.
- **Flakiness pré-existente, não da 104:** rodar só `npx vitest run src/pages/admin/tasks` derruba
  `TaskList.form-panel` (e às vezes `TaskList.external-links`) por estourar o `testTimeout` de 5s sob
  concorrência. Reproduz **com os arquivos da 104 removidos** (aí falham 2 em vez de 1) e some no
  `npm test` completo, que passa 258/258. Nada a ver com o gesto; fica registrado para não virar
  caça-fantasma na próxima feature.

### Rastreabilidade do `prompt:` → artefato

| Trecho do `prompt:` | Prova |
| --- | --- |
| "Permitir criar eventos com arrastar no próprio layout (Tipo Google Agendas)" | `AgendaGrid.drag-create.test.tsx` → "arrastar das 09:00 às 10:30 → «Evento» abre o formulário com data, início e fim da faixa" e "salvar grava o evento com ends_at correspondente à duração arrastada" (`createProjectEvent` com 90 min reais, não os 30 de fallback) |
| "com o horário desenhado pelo gesto" | `AgendaHourGrid.drag.test.tsx` → faixa 540/90 no arrasto normal, 540/120 no invertido, 540/30 no clique e no toque; fantasma "09:00 – 10:30" durante o movimento |
| "Permitir Criar Tarefas também" | `AgendaGrid.drag-create.test.tsx` → "«Tarefa» abre o formulário e grava due_date, due_time e estimated_duration da faixa", incluindo o bloco reaparecendo às 09:00 com 90 min depois do reload |
| "Mesmo componente que está hoje em tarefas -> Agenda" | O gesto vive na `AgendaHourGrid` já compartilhada; sem a prop `onCreateInRange` ela continua idêntica — "arrastar não desenha faixa nem chama nada (não-regressão do «Focar dia» do Gantt)" e os 14 arquivos `Agenda*` verdes (151 testes) |
