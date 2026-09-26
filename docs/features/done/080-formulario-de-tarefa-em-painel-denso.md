---
prompt: |
  - Vamos mudar a ordem dos inputs, na criação de uma tarefa, o mais importante para prencher, que deve vir primeiro, é:
      - título + Descrição (colocar descrição ocupando um espaço menor, de modo que dê para fazre um toggle e aí sim aparece o atual editor)
      - projeto, coloque ele ocupando metade da linha, somente ou até um terço
        - os outros 2 terços devem ser os operadores de tempo:
          - cronômetro para duração. Data Limite
          - ícone de recorrência, abre um outro modal com as informações de recorrência, o que está abaixo de 'Esta tarefa se repete?' de modo que
        - Em geral: o ícone está ocupando uma linha inteira, assim como a prioridade, precisa ser mais como um painel de piloto de avião, algo que tenha muita informação, mas de maneira coerente. não um embaixo do outro de maneria burra. faça tudo caber em uma página.
---

# 080 — Formulário de tarefa como painel denso, numa página só

## Contexto

`TaskFormFields.tsx` (feature `done/042`) é a fonte única do formulário de tarefa, usada pelos três
call sites: `TaskList.tsx:943`, `ProjectDetail.tsx:996` e `AgendaGrid.tsx:766` (feature `done/043`).
Ele é **4 abas** (Geral / Data e repetição / Organização / Registros de tempo), com
`FORM_FIELDS_CLASS = "grid grid-cols-1 gap-4"` — ou seja, **uma coluna, um campo por linha**, dentro
de cada aba.

O resultado é o que o prompt descreve: Título, Descrição, Projeto (um `ProjectPicker` que é uma
lista rolável de `max-h-48`, ~192px de altura), Ícone, Prioridade e Marco ocupando **seis linhas
inteiras** só na aba "Geral" — e prazo, horário, duração e recorrência escondidos atrás de outra
aba, embora sejam justamente o que se preenche junto com o título. Nada cabe numa tela; e o que o
usuário chama de "operadores de tempo" está separado do resto por um clique de aba.

Peças que já existem e que tornam a densidade possível sem inventar componente:
- `ProjectBadgeButton.tsx` — o `ProjectPicker` dentro de um `Popover`, ocupando **uma linha só**. É o
  que a edição rápida da Lista/Kanban/Gantt já usa (`TaskQuickFields.tsx`).
- `TaskDurationQuickPick.tsx` — gatilho de uma linha (ícone `Timer` + duração formatada) que abre um
  popover com presets 15/30/60/90/120/240 + personalizado.
- `TaskIconPicker`, `TaskPriorityField`, `TaskMilestoneField`, `TagCombobox`, `TaskSubtasksField`,
  `TaskTimeEntriesField` — todos já isolados.
- `TaskRecurrenceField.tsx` (556 linhas) já tem a divisão exata que o prompt pede: o bloco de
  data/hora/início/duração (`:330-372`) e, **abaixo de "Esta tarefa se repete?"** (`:307`), toda a
  configuração de repetição (frequência, intervalo, dias da semana, modo mensal, término) e o
  vínculo com Recorrência Financeira (`:507+`).

Este redesenho foi conferido contra a skill `form-design` — o que ela manda manter, o que ela
autoriza a flexibilizar aqui e por quê está registrado nas Decisões.

## Decisões

- **As abas Geral / Data e repetição / Organização somem: viram um painel único, rolável no
  máximo o mínimo.** É o "faça tudo caber em uma página". A aba **"Registros de tempo"** vira uma
  seção colapsada no fim (só em modo edição): é histórico somente-leitura, não faz parte do
  preenchimento.
- **Ordem, exatamente como o prompt pede**:
  1. **Título** (linha inteira, obrigatório, foco automático).
  2. **Descrição colapsada** — um gatilho de uma linha ("+ Descrição", ou as primeiras ~80 letras
     quando já há conteúdo, com um ponto indicando que existe texto). Clicou, abre o
     `TaskDescriptionField` atual (abas Escrever/Visualizar), inteiro, sem mudança nenhuma nele.
  3. **Linha de 3 colunas**: **Projeto** em 1/3 (via `ProjectBadgeButton`, uma linha) e os
     **operadores de tempo** nos 2/3 restantes: **Duração** (`TaskDurationQuickPick`), **Data
     limite** (+ **Horário**, que já só aparece quando há data) e o **ícone de recorrência**, um
     botão que abre o modal novo.
  4. **Linha de "instrumentos"**: Ícone, Prioridade, Marco e Tarefa pontual **lado a lado**, não um
     por linha. É a queixa literal ("o ícone está ocupando uma linha inteira, assim como a
     prioridade").
  5. **Linha de 2 colunas**: Tags e Link externo.
  6. **Subtarefas**, seção colapsável.
  7. **Registros de tempo**, seção colapsável, só em edição.
- **A recorrência sai para um modal próprio** (`TaskRecurrenceDialog`), com tudo que hoje está
  **abaixo de "Esta tarefa se repete?"**: modo (Não / Simples / Vinculada), frequência, intervalo,
  dias da semana, modo mensal, término e o vínculo com Recorrência Financeira. Início/Prazo/Horário/
  Duração **ficam no painel**, porque são preenchidos em toda tarefa, não só nas repetidas. O botão
  que abre o modal mostra o estado atual em texto curto ("Não se repete" / "A cada 1 semana, seg e
  qua"), para a informação não desaparecer atrás do clique.
- **Sobre a regra de coluna única da `form-design`**: a skill manda coluna única por padrão e abre
  duas exceções, e as duas se aplicam aqui — (a) a própria skill dispensa a regra em "formulários
  internos de uso repetido por usuário treinado (admin/dashboard interno)", que é exatamente este
  caso, e o pedido é explicitamente por densidade ("painel de piloto de avião"); (b) os agrupamentos
  escolhidos são unidades mentais inseparáveis, não economia de espaço à toa — Prazo+Horário+Duração
  +Recorrência são "quando", Ícone+Prioridade+Marco+Pontual são "que tipo de coisa é", Tags+Link são
  "onde isso se encaixa". **Não** vamos juntar campos sem parentesco só para encurtar a tela.
- **O que a skill manda manter, e fica mantido, mesmo com a densidade**:
  - **Label acima de cada campo, sempre visível** (`FormLabel`). Sem floating label, sem placeholder
    fazendo as vezes de label. Controles que viram ícone (recorrência) ganham **caption visível** ao
    lado, além de `aria-label` e tooltip — ícone mudo não é label.
  - **Obrigatório e opcional marcados explicitamente** — `FormLabel required` no Título (com
    `aria-required`), `optional` no resto, como já é hoje.
  - **Widget pelo número de opções**: Prioridade (4) continua em botões visíveis, nunca dropdown;
    modo de recorrência (3) idem; Projeto vai para popover **com busca** se a lista passar de ~15
    projetos (a regra de 15+ da skill), senão continua a lista clicável de 1 clique do
    `ProjectPicker`.
  - **Largura reflete o dado**: Título largo, Horário estreito, "Repetir a cada" estreito.
  - **Alvo de toque**: no mobile o painel colapsa para **uma coluna** e os controles voltam a ter
    altura confortável (≥44px de área clicável). Densidade é afordância de desktop; espremer três
    colunas num celular é o erro que a skill previne.
  - **Validação no blur, mensagem afirmativa** — vale para o Link externo (URL) e para o prazo de
    subtarefa (`isSubtaskDueDateValid`, que hoje só falha no `handleSave`, sem dizer nada antes).
- **O campo "Data limite" do bloco 3 carrega os atalhos da `083` junto.** A feature
  `083-atalhos-de-prazo-na-criacao-de-tarefa` põe `[Hoje] [Esta semana] [Este mês]` antes do botão de
  calendário, hoje dentro de `TaskRecurrenceField`. As duas são independentes e nenhuma bloqueia a
  outra: se a `083` entrar primeiro, o bloco 3 **move** o `TaskDueShortcuts` junto com o `DatePicker`
  (não pode sumir no refactor); se a `080` entrar primeiro, a `083` pluga o componente direto no
  bloco 3. É a única costura entre as duas — a `083` não muda layout, e esta aqui não muda
  semântica de data.
- **Sem campo novo e sem campo removido.** Todos os campos de hoje continuam existindo e salvando
  igual — é reorganização e progressive disclosure, não mudança de modelo. Nenhuma migration.
- **Os três call sites passam a usar a mesma largura de dialog** (`FORM_DIALOG_CONTENT_CLASS_LG`):
  `ProjectDetail.tsx` e o segundo dialog de `AgendaGrid.tsx` usam hoje a classe estreita, e o painel
  de 3 colunas ficaria espremido lá. É a diferença cosmética que a `042` deixou pendente de decidir.
- **A prop `formTab`/`onFormTabChange` do `TaskFormFields` some** e os três call sites param de
  guardar esse estado. O único uso real dela era resetar para "geral" ao abrir uma subtarefa — com
  painel único isso deixa de existir.
- **Fora de escopo**: mudar o conteúdo do editor de descrição, do `TagCombobox`, das subtarefas ou
  dos registros de tempo; e o quick-edit inline da Lista/Kanban/Gantt (`TaskQuickFields`), que já é
  denso e não foi citado.

## Tarefas

- [x] Criar `src/pages/admin/tasks/CollapsibleField.tsx`: gatilho de uma linha (label + resumo do
      conteúdo + chevron) que revela o filho, com `aria-expanded`/`aria-controls` e estado inicial
      por prop. É o que serve Descrição, Subtarefas e Registros. Verificação: `npm run build && npm run lint`
- [x] Testar `CollapsibleField` (`src/pages/admin/tasks/__tests__/CollapsibleField.test.tsx`):
      começa fechado, abre no clique e no Enter/Espaço, o resumo aparece quando há conteúdo, e o
      conteúdo do filho não é desmontado ao fechar (não perder o que foi digitado).
      Verificação: `npm test src/pages/admin/tasks`
- [x] Criar `src/pages/admin/tasks/TaskRecurrenceDialog.tsx`: `Dialog` que recebe o mesmo
      `TaskRecurrenceValue`/`onChange` e renderiza **só** o que hoje está abaixo de "Esta tarefa se
      repete?" em `TaskRecurrenceField.tsx` (modo, frequência, intervalo, dias da semana, modo
      mensal, término, vínculo com Recorrência Financeira). Verificação: `npm run build && npm run lint`
- [x] Extrair esse bloco de `TaskRecurrenceField.tsx` para um componente reutilizado pelo dialog, em
      vez de duplicar as ~230 linhas — `TaskRecurrenceField` continua existindo para o caso subtarefa
      (`isSubtask`, que já renderiza só Prazo/Horário). Verificação: `npm run build`
- [x] Criar `formatRecurrenceSummary(value)` puro em `src/domain/tasks/recurrence.ts`: "Não se
      repete", "A cada 1 semana, seg e qua", "Todo dia 15, até 30/06/2026", "Vinculada a «Aluguel»".
      Verificação: `npm run build`
- [x] Testar `formatRecurrenceSummary` em `src/domain/tasks/__tests__/recurrence.test.ts`: sem regra;
      diária; semanal com e sem dias; mensal por dia e por dia-da-semana; com `until`; com `count`;
      vinculada a Recorrência Financeira. Verificação: `npm test src/domain/tasks`
- [x] Testar `TaskRecurrenceDialog`: abre com o estado atual, mudar frequência propaga o `onChange`,
      fechar sem mexer não altera nada, e "Não" limpa `recurrence_rule` e `linked_recurring_id`.
      Verificação: `npm test src/pages/admin/tasks`
- [x] `TaskFormFields.tsx`: remover `Tabs`/`TabsList`/`TabsContent` do corpo principal e as props
      `formTab`/`onFormTabChange`; montar o painel único. Verificação: `npm run build`
- [x] `TaskFormFields.tsx` — bloco 1: Título em linha inteira, `required`, `aria-required`,
      `autoFocus` em modo criação. Verificação: `npm run build && npm run lint`
- [x] `TaskFormFields.tsx` — bloco 2: Descrição dentro do `CollapsibleField`, com o resumo das
      primeiras ~80 letras quando há conteúdo; o `TaskDescriptionField` atual entra intacto.
      Verificação: teste de que o editor aparece só depois do toggle e o texto digitado sobrevive a
      fechar/abrir
- [x] `TaskFormFields.tsx` — bloco 3: grade `sm:grid-cols-3` com Projeto em 1 coluna
      (`ProjectBadgeButton`, mantendo o caso "herdado da tarefa principal" que existe hoje quando
      `editing?.parent_task_id`) e os operadores de tempo em 2 colunas: Duração
      (`TaskDurationQuickPick`), Data limite (`DatePicker`), Horário (só com data) e o botão de
      recorrência com o resumo. Verificação: `npm run build && npm run lint`
- [x] Bloco 3, atalhos de prazo (costura com a `083`): se `TaskDueShortcuts` já existir, ele vem
      **antes** do `DatePicker` de Data limite, chamando o mesmo handler de mudança de prazo (o que
      reconstrói a `recurrence_rule`); se a `083` ainda não tiver sido implementada, nada a fazer
      aqui — ela pluga no bloco 3 quando chegar. Verificação: teste em `TaskFormFields.test.tsx` de
      que os três atalhos aparecem no bloco 3 (ou que a tarefa é no-op, registrando em `## Notas`)
- [x] `TaskFormFields.tsx` — bloco 4: linha de instrumentos com Ícone, Prioridade, Marco e Tarefa
      pontual lado a lado (`flex flex-wrap`), cada um com sua label visível; manter a exclusão mútua
      entre "Tarefa pontual" e Duração que já existe. Verificação: `npm run build && npm run lint`
- [x] `TaskFormFields.tsx` — bloco 5: Tags e Link externo em `sm:grid-cols-2`. Verificação:
      `npm run build && npm run lint`
- [x] `TaskFormFields.tsx` — blocos 6 e 7: Subtarefas e Registros de tempo em `CollapsibleField`,
      Registros só quando `editing`. Verificação: `npm run build && npm run lint`
- [x] Responsividade: abaixo de `sm` o painel vira uma coluna e os controles voltam à altura
      confortável (área de toque ≥44px). Verificação: teste com `matchMedia` mockado (o projeto já
      tem `src/hooks/use-media-query.ts`) ou asserção sobre as classes
- [x] Validação no blur do Link externo, com mensagem afirmativa ("Comece com https://") em vez de
      "inválido", sem bloquear a digitação. Verificação: teste em `TaskFormFields.test.tsx`
- [x] Validação de prazo de subtarefa passa a avisar no próprio campo, no blur, em vez de só falhar
      no `handleSave` (`isSubtaskDueDateValid` já existe e continua sendo a fonte da regra).
      Verificação: teste em `TaskFormFields.test.tsx`
- [x] `TaskList.tsx`, `ProjectDetail.tsx` e `AgendaGrid.tsx`: remover o estado `formTab`/`setFormTab`
      e o `type TaskFormTab` importado; padronizar os três `DialogContent` em
      `FORM_DIALOG_CONTENT_CLASS_LG`. Verificação: `npx tsc -p tsconfig.app.json --noEmit && npm run lint`
- [x] Atualizar `src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx`: os testes de navegação
      entre abas somem e viram testes de painel — todos os campos presentes de uma vez, campo Projeto
      só com a prop, Registros só em edição, ordem dos blocos na ordem pedida.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Rodar e ajustar as suítes que abrem o dialog completo por outro caminho
      (`TaskList.subtask-edit.test.tsx`, `ProjectDetail.subtask-edit.test.tsx`,
      `AgendaGrid.test.tsx`, `TaskList.medication.test.tsx`) — nenhuma pode depender das abas.
      Verificação: `npm test src/pages/admin/tasks`
- [x] Teste de não-regressão de salvamento: criar e editar uma tarefa preenchendo **um campo de cada
      bloco** (título, descrição, projeto, duração, prazo, horário, recorrência pelo modal, ícone,
      prioridade, marco, pontual, tag, link, subtarefa) e conferir o payload de `createTask`/
      `updateTask`. Verificação: `npm test src/pages/admin/tasks`
- [x] Acessibilidade como tarefa própria: percorrer o painel só pelo teclado (Tab na ordem visual,
      abrir/fechar os colapsáveis, abrir o modal de recorrência e voltar o foco para o botão que o
      abriu), e conferir que todo controle tem nome acessível. Verificação: testes de teclado em
      `TaskFormFields.test.tsx`
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`
      (+ `npm run check:bundle`), com a contagem registrada em `## Notas`
- [x] Verificação do pedido literal: com o dialog aberto em desktop (largura `lg`), **todos** os
      campos do fluxo de criação estão visíveis sem rolagem, na ordem pedida, e Ícone e Prioridade
      **não** ocupam mais uma linha inteira cada

## Prompts

## Notas

- **`TaskRecurrenceField.tsx` foi apagado, contrariando a Decisão que dizia mantê-lo.** A Decisão
  supunha que ele seguiria servindo o caso subtarefa; na prática o bloco 3 passou a montar
  Data limite/Horário direto (com `maxDate` da tarefa-mãe **e** o aviso inline que o componente
  antigo não tinha), e nenhum call site sobrou. Manter um componente que ninguém renderiza seria
  pior do que apagá-lo: a `083` tem duas tarefas mandando plugar `TaskDueShortcuts` nos dois ramos
  dele, e o atalho simplesmente não apareceria na tela. **Hand-off explícito para a `083`** (não
  edito o arquivo dela, por instrução da esteira): os dois "Plugar em `TaskRecurrenceField.tsx`"
  viram **um** só — `TaskDueShortcuts` entra no bloco 3 de `TaskFormFields.tsx`, no campo
  "Data limite", antes do `DatePicker`, chamando `editor.selectDueDate(iso)`; o `maxDate` do ramo
  subtarefa é o mesmo `parentDueDate` que já está calculado ali. É exatamente a alternativa que as
  Decisões da `083` já previam ("se a `080` entrar antes, direto no bloco 3"), e o ponto exato está
  marcado com um comentário no código.
- **Atalhos de prazo da `083` (costura): tarefa no-op nesta rodada.** `TaskDueShortcuts` ainda não
  existe (a `083` está em `todo/`), então não há o que mover. O gancho ficou registrado no código:
  o bloco 3 tem um comentário no campo "Data limite" dizendo exatamente onde o componente entra
  (antes do `DatePicker`) e por qual handler ele tem de passar (`editor.selectDueDate`, nunca
  `setForm` cru — é o que reconstrói a `recurrence_rule`).
- **A recorrência precisou de um hook, não só de um dialog.** Mover a configuração de repetição
  para o `TaskRecurrenceDialog` separaria o **prazo** (que ficou no painel) do estado que
  reconstrói a `recurrence_rule` (frequência/intervalo/dias/término). Sem isso, escolher
  "Recorrência simples" antes de existir prazo e só então preencher a data deixaria de gerar a
  regra — mudança de comportamento silenciosa. Daí `useTaskRecurrenceEditor` (estado + handlers,
  movidos verbatim de `TaskRecurrenceField`), instanciado **no painel** e passado ao dialog.
  `TaskRecurrenceRules` é o JSX abaixo de "Esta tarefa se repete?", usado pelo dialog e ainda pelo
  `TaskRecurrenceField` — nada duplicado.
- **`CollapsibleField` não usa o `Collapsible` do Radix.** O `CollapsibleContent` desmonta o filho
  ao fechar e, com `forceMount`, nunca o esconde (`children: isOpen && children` e
  `hidden: !isOpen` no mesmo `isOpen`). Aqui o filho tem de continuar **montado** — fechar a
  Descrição no meio da digitação não pode perder o texto. Implementado com `hidden` manual.
  Exceção: os Registros de tempo usam `lazy`, porque buscam da API ao montar e uma seção fechada
  não deve gerar requisição.
- **Bug pré-existente encontrado e corrigido: `openEdit` nunca carregava `estimated_duration`.** Os
  três call sites montavam o form sem esse campo, então editar uma tarefa com duração mostrava
  "+ Duração" (e a duração só podia ser criada, nunca vista/ajustada). Invisível enquanto o campo
  morava numa aba secundária; com a duração em destaque no bloco 3, viraria defeito à vista.
  Coberto por `TaskList.form-panel.test.tsx` ("editar: o painel abre com os valores atuais").
- **Aviso de prazo de subtarefa é derivado, não guardado em estado.** `DatePicker` não emite blur
  (o valor é escolhido no popover), então "avisar no blur" virou "avisar assim que o valor é
  inválido" — o que também cobre abrir uma subtarefa que **já** estava inválida, caso que antes só
  estourava como toast no `handleSave`. A regra continua sendo `isSubtaskDueDateValid`, e o
  `handleSave` continua bloqueando o salvamento.
- **`ProjectBadgeButton` ganhou busca acima de 15 projetos** (`PROJECT_SEARCH_THRESHOLD`), cumprindo
  a Decisão "widget pelo número de opções" da `form-design`. Não havia tarefa separada para isso;
  entrou junto do bloco 3.
- **Textos encurtados (copy, não comportamento)**: o checkbox de Marco passou de "Marcar como marco
  (data única, sem duração, aparece como ponto no Gantt)" para "Marco no Gantt (sem duração)", e o
  de Tarefa pontual perdeu o rabicho "— vira bolinha marcável na agenda". As frases antigas
  sozinhas ocupavam a linha inteira, que é literalmente a queixa do pedido. Os `FormLabel` acima
  ("Marco", "Tarefa pontual") seguem visíveis e explícitos.
- **Nomes acessíveis que faltavam, achados pela tarefa de acessibilidade**: os dois `DatePicker` do
  bloco 3 se chamavam ambos "Selecione a data" (daí o novo prop `ariaLabel`), e o input do
  `TagCombobox` não tinha nome nenhum (só placeholder) — agora `aria-label="Tags"`.
- **A devolução de foco do Radix (`FocusScope`) não é observável neste jsdom.** Confirmado com um
  caso mínimo (Dialog puro do `ui/dialog`, sem nada nosso em volta): depois do `Escape` o foco vai
  para o `body`. O teste de teclado cobre o que dá para garantir — `aria-haspopup="dialog"` no
  gatilho, abrir/fechar por teclado e o gatilho continuar focável e operante.
- **Testes ajustados por seletor (18, em 3 arquivos)**, todos por causa da troca de abas por painel:
  `TaskList.subtask-edit.test.tsx` (7), `ProjectDetail.subtask-edit.test.tsx` (5) e
  `AgendaGrid.test.tsx` (6). Nenhuma asserção de comportamento foi enfraquecida — as buscas por
  `role="tab"`/posição viraram buscas por rótulo/role dentro do dialog, e as que dependiam de
  "trocar para a aba Data" viraram asserções sobre o aviso no próprio campo.
- **Contagem final da suíte**: 205 arquivos / 2122 testes / 0 falhas (baseline antes da 080:
  202 / 2060). `npx tsc -p tsconfig.app.json --noEmit` limpo, `npm run build` OK, `npm run lint`
  com 0 erros (80 warnings pré-existentes de `react-refresh/only-export-components`),
  `npm run check:bundle` "Bundle budget OK" (teto de rota 160 KB gzip mantido).
- **Verificação do pedido literal, por código** (sem Chrome, como a skill `next` exige):
  `TaskFormFields.test.tsx` cobre cada frase do prompt — "todos os campos do fluxo de criação
  aparecem de uma vez, sem clique nenhum"; "a ordem dos blocos é a pedida"; "bloco 3: Projeto ocupa
  1/3 da linha e os operadores de tempo os outros 2/3"; "Ícone e Prioridade dividem a mesma linha de
  instrumentos"; "cabe em uma página: o painel inteiro são poucos blocos de topo, não um campo por
  linha" (≤7 blocos, contra as 4 abas com 6 linhas só na "Geral").
