---
prompt: |-
  Melhoria de interface pedida pelo usuário: "nas notas a pill do projeto não está com a cor do
  projeto" e "ao clicar nas pills do projeto, ao longo do codigo, ir para os projetos".

  Esta feature é o alicerce das duas: hoje o pill de projeto existe em 5 lugares com 3 desenhos
  diferentes (com bolinha e editável, sem bolinha e morto, sem bolinha com botão separado ao lado),
  e o fallback de cor `#94a3b8` está repetido à mão em quatro arquivos.

  Decidido no desenho:
  - Um componente de pill para todo o app, não uma correção por tela — hoje são três desenhos
    divergentes e o quarto lugar nasceria divergente também.
  - Pill de projeto = bolinha `project.color` + nome, dentro de `Badge`. A cor vem sempre de
    `project.color`, nunca de `variant="secondary"`: o pill sem cor deixa de existir.
  - O componente aceita `to?: string`: com `to` vira `<Link>` para `/tasks/projects/:id`; sem `to`,
    é só um `<span>` que identifica. Isso é o que permite, nas features seguintes, o pill de
    leitura navegar sem quebrar os lugares onde ele vive dentro de um botão.
  - Fallback `#94a3b8` vira constante única (`PROJECT_FALLBACK_COLOR`), perto de `moduleColors` em
    `src/lib/design-tokens.ts`. Projeto sem cor não deixa de ter pill.
  - Fora de escopo: mudar o modelo de dados de projeto, o filtro de tarefas (feature 097) e o
    `ProjectsRail`.
---

# 111 — Pill de projeto: componente único e cor de fallback

## Contexto
Sem dependências — é a base das features 112 e 113, que só aplicam este componente nas telas.

O pill de projeto está desenhado três vezes de formas diferentes pelo app e o fallback de cor
`#94a3b8` aparece copiado em quatro arquivos de tarefas. Esta feature extrai a parte visual para um
`ProjectPill` compartilhado e recompõe o `ProjectBadgeButton` em cima dele — sem mudança visível na
tela: é refatoração preparatória, e o que prova que ela deu certo é o comportamento atual
continuar idêntico mais o teste novo do componente.

## Decisões
- Um componente de pill para todo o app, não uma correção por tela.
- A cor vem sempre de `project.color`; pill sem cor (`variant="secondary"` pelado) deixa de existir.
- `ProjectPill` aceita `to?: string`: com `to` renderiza `<Link>`; sem `to`, `<span>`. O componente
  **nunca** renderiza `<button>` — ele precisa poder viver dentro do gatilho do popover do
  `ProjectBadgeButton`, e `<button>` dentro de `<button>` é markup inválido.
- Fallback `#94a3b8` vira `PROJECT_FALLBACK_COLOR` em `src/lib/design-tokens.ts`, perto de
  `moduleColors`.
- O componente mora em `src/components/tasks/ProjectPill.tsx` (mesma pasta de `TaskRefChip.tsx`) e
  não em `src/pages/admin/tasks/`: quem consome é Notas, Compras e Agenda também, e componente
  compartilhado importado de dentro de uma página é como os três desenhos divergentes nasceram.
- Escopo fechado: o `ProjectsRail` (`src/pages/admin/tasks/ProjectsRail.tsx`) e o `ProjectPicker`
  continuam com seus botões próprios — só trocam o literal da cor pela constante. Não viram
  `ProjectPill`, porque são listas de seleção, não identificação.

## Tarefas
- [x] Criar `PROJECT_FALLBACK_COLOR = "#94a3b8"` em `src/lib/design-tokens.ts`, logo abaixo de
      `moduleColors`, com comentário dizendo que é a cor do projeto sem `color` definida.
- [x] Criar `src/components/tasks/ProjectPill.tsx`: props `{ project: Project | null; to?: string;
      emptyLabel?: string; className?: string }`. Renderiza `Badge variant="outline"` com bolinha
      (`h-1.5 w-1.5 rounded-full`, `backgroundColor: project?.color ?? PROJECT_FALLBACK_COLOR`) e o
      nome do projeto, ou `emptyLabel` (padrão `"Sem projeto"`, com `text-muted-foreground`) quando
      `project` é `null`. Com `to`, o `Badge` vira `<Link to={to}>` (`asChild`/`render as`); sem
      `to`, `<span>`.
- [x] No `ProjectPill` com `to`: `onClick` com `stopPropagation`, para o pill dentro de linha
      clicável (Lista/Kanban) navegar para o projeto sem disparar o clique da linha.
- [x] Trocar o badge inline de `src/pages/admin/tasks/ProjectBadgeButton.tsx:47-59` por
      `<ProjectPill project={project} />` dentro do `PopoverTrigger`, mantendo o `<button>` externo,
      o `stopPropagation` e as classes de hover (`hover:bg-muted`) — a aparência não pode mudar.
- [x] Trocar o literal `"#94a3b8"` por `PROJECT_FALLBACK_COLOR` em
      `src/pages/admin/tasks/ProjectPicker.tsx:54`, `src/pages/admin/tasks/ProjectsRail.tsx:51` e
      `src/pages/admin/tasks/TaskFormFields.tsx:293`.
- [x] Teste `src/components/tasks/__tests__/ProjectPill.test.tsx`: (a) a bolinha recebe
      `background-color` igual a `project.color`; (b) projeto com `color: null` cai em
      `PROJECT_FALLBACK_COLOR`; (c) `project={null}` mostra "Sem projeto"; (d) com `to` o pill é um
      `<a>` com `href="/tasks/projects/p1"`; (e) sem `to` não existe `<a>` nem `<button>` no
      componente (`container.querySelector("a,button")` é `null`).
- [x] Teste no mesmo arquivo: com `to`, clicar no pill não propaga o clique para um handler
      registrado no elemento-pai (prova do `stopPropagation`).
- [x] Rodar `npm test -- src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx
      src/pages/admin/tasks/__tests__/TaskViews.test.tsx
      src/pages/admin/tasks/__tests__/TaskList.project-filter.test.tsx` e conferir que o
      `ProjectBadgeButton` recomposto não quebrou nenhum deles.
- [x] `npm run lint` e `npm run build` sem erro novo.

## Prompts

## Notas

Desvios e descobertas da implementação (nenhum pedido novo do usuário no meio do caminho — por isso
`## Prompts` segue vazia):

- **`Badge` ganhou `asChild`** (`src/components/ui/badge.tsx`, Radix `Slot`, mesmo mecanismo que o
  `Button` já usava). O desenho pedia "o `Badge` vira `<Link>`", e o `Badge` era um `<div>` fixo:
  sem `asChild` a alternativa seria duplicar as classes do `badgeVariants` dentro do `ProjectPill` —
  o começo de mais um pill divergente, que é exatamente o que a feature veio matar. A mudança é
  aditiva: sem `asChild` o `Badge` continua sendo o `<div>` de sempre, e os outros ~30 usos do app
  não mudaram (build e suíte inteira passam).
- Efeito colateral bom: dentro do `PopoverTrigger` o pill agora é `<span>`, não `<div>` — `<div>`
  dentro de `<button>` também não é markup válido, e isso vinha de antes da feature.
- **Três testes a mais do que o arquivo pedia**, porque sem Chrome as tarefas 4 e 5 não teriam
  prova nenhuma de comportamento: `ProjectBadgeButton.test.tsx` (aparência do gatilho, ausência de
  elemento interativo aninhado, popover ainda trocando de projeto) e `ProjectFallbackColor.test.tsx`
  (`ProjectPicker` e `ProjectsRail` com projeto sem cor), mais duas asserções de cor da bolinha no
  bloco "Herdado da tarefa principal" em `TaskFormFields.test.tsx`.
- **O `Badge` também é `.rounded-full`**: a primeira versão do teste procurava a bolinha por essa
  classe e pegava o pill inteiro. A bolinha é achada por `span[aria-hidden="true"]`. Detalhe de
  teste, mas custou três falhas até aparecer.
- O `stopPropagation` foi conferido por **controle negativo**: removendo a linha do `onClick`, só o
  teste de propagação quebra; recolocando, volta a passar. É o que garante que a asserção mede o
  comportamento e não passa por acaso.
- `to` ainda não é usado por ninguém no app — é ponto de apoio das features 112 e 113. Quem
  consumir precisa passar `/tasks/projects/<id>`; o componente não monta a rota sozinho.
- **A suíte inteira é sensível a carga nesta máquina**: com a paralelização padrão do Vitest,
  rodadas do `npm test` completo derrubaram por timeout (5s/15s) conjuntos **diferentes** de testes
  pesados a cada vez (19 falhas numa rodada, 4 na seguinte, sem interseção), todos passando quando
  rodados isolados. Com `npx vitest run --maxWorkers=3` a suíte fecha verde inteira
  (284 arquivos, 3137 testes). É flake de carga, não regressão desta feature.
- `"#94a3b8"` continua em `ProjectFormDialog.tsx` e `Tags.tsx` (cor **inicial de formulário**, não
  fallback de pill) e em fixtures de teste — fora do escopo, como o desenho previa.

## Como testar

1. **Pré-requisitos**
   - Nenhuma migration nem seed: a mudança é só de front.
   - `npm install` já rodado. Para a parte manual, `npm run dev` e login com o usuário de sempre;
     é preciso ter pelo menos um projeto **com cor** e um projeto **sem cor** cadastrados em
     `/tasks/projects`.
   - Esta feature é refatoração preparatória: **nada muda na tela**. O que ela entrega é o
     `ProjectPill` e a constante que as features 112 e 113 vão usar. Se algo mudou de aparência ou
     de comportamento, é defeito, não entrega.

2. **Verificação automatizada**
   - `npm test -- src/components/tasks/__tests__/ProjectPill.test.tsx`
     — passou (7 testes) = o pill pinta a cor do projeto, cai no fallback quando `color` é nulo,
     mostra "Sem projeto" (ou o `emptyLabel`), vira `<a href="/tasks/projects/p1">` com `to`, não
     renderiza `<a>` nem `<button>` sem `to`, e o clique com `to` não borbulha para a linha de trás.
   - `npm test -- src/pages/admin/tasks/__tests__/ProjectBadgeButton.test.tsx src/pages/admin/tasks/__tests__/ProjectFallbackColor.test.tsx`
     — passou (5 testes) = o gatilho do popover recomposto mostra nome + bolinha na cor do projeto,
     mantém `hover:bg-muted`, não tem `<button>`/`<a>` aninhado, e continua abrindo o picker e
     trocando de projeto; `ProjectPicker` e `ProjectsRail` caem no fallback com projeto sem cor.
   - `npm test -- src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx src/pages/admin/tasks/__tests__/TaskViews.test.tsx src/pages/admin/tasks/__tests__/TaskList.project-filter.test.tsx`
     — passou (111 testes) = nenhuma tela que consome o `ProjectBadgeButton` regrediu.
   - `npm run lint` — passou = **0 errors** (os 88 `warning` de `react-refresh/only-export-components`
     são pré-existentes e o número não subiu com esta feature).
   - `npm run build` — passou = `tsc -b` aceita as props novas em todos os chamadores e o bundle sai
     inteiro ("✓ built in ...", seguido do PWA e do `minify-sw`).
   - `npx vitest run --maxWorkers=3` (suíte inteira) — passou = **284 arquivos, 3137 testes**, nada
     quebrado em código adjacente. Use o `--maxWorkers`: com a paralelização padrão a máquina
     estoura o timeout de testes pesados e derruba arquivos aleatórios que passam isolados.
   - `grep -n '"#94a3b8"' src/pages/admin/tasks/ProjectPicker.tsx src/pages/admin/tasks/ProjectsRail.tsx src/pages/admin/tasks/ProjectBadgeButton.tsx src/pages/admin/tasks/TaskFormFields.tsx`
     — **esperado: nenhuma linha** (exit 1). `ProjectFormDialog.tsx` e `Tags.tsx` usam o valor como
     cor inicial de formulário, não como fallback de pill — esses continuam com o literal, de
     propósito.

3. **Verificação manual, passo a passo**
   1. Abra `/tasks` na aba Lista. **Esperado:** cada tarefa com projeto mostra o pill com a bolinha
      na cor do projeto, exatamente como antes desta feature.
   2. Clique no pill de uma tarefa. **Esperado:** abre o popover de troca de projeto (comportamento
      inalterado), e o clique **não** abre a tarefa.
   3. Escolha outro projeto no popover. **Esperado:** o pill passa a mostrar o nome e a cor do
      projeto novo, e o popover fecha.
   4. Abra o formulário de uma tarefa (`Nova tarefa`). **Esperado:** o campo Projeto mostra o mesmo
      pill, com a mesma cor.
   5. Abra uma **subtarefa** já existente para edição. **Esperado:** o campo Projeto vira o bloco
      somente-leitura "Herdado da tarefa principal", com a bolinha na cor do projeto do pai (cinza
      `#94a3b8` se o projeto não tiver cor).
   6. Na aba Lista, confira a coluna de projetos à esquerda (`ProjectsRail`). **Esperado:** cada
      projeto com sua bolinha; projeto sem cor com a bolinha cinza. Clicar continua filtrando.
   - **Não há tela nova para clicar e "ir para o projeto"**: o pill só vira link quando alguém passa
     `to`, e nenhuma tela passa ainda — isso é a feature 113.

4. **Casos de borda e caminhos negativos**
   - Tarefa **sem projeto**: o pill mostra "Sem projeto" em cinza (`text-muted-foreground`) com a
     bolinha no cinza de fallback — igual a antes —, continua clicável e abre o picker.
   - Projeto **sem cor** (`color` nulo no banco): a bolinha aparece cinza `#94a3b8` no pill, no
     picker, na coluna da esquerda e no bloco herdado — não some nem fica transparente.
   - Nenhum projeto cadastrado: o popover abre com só a opção "Sem projeto"; nada quebra.
   - Mais de 15 projetos: o campo de busca do popover continua aparecendo (o `PROJECT_SEARCH_THRESHOLD`
     não foi tocado).

5. **Sinais de que quebrou**
   - Erro no console `validateDOMNesting: <button> cannot appear as a descendant of <button>` ao
     abrir `/tasks` — sinal de que o `ProjectPill` virou elemento interativo dentro do gatilho. O
     teste "o gatilho é o único elemento interativo" em `ProjectBadgeButton.test.tsx` pega isso sem
     navegador.
   - Bolinha do pill invisível, preta ou transparente em toda tarefa — a constante não está sendo
     aplicada.
   - Badge sem borda/arredondamento (aparência de texto solto) — `asChild` do `Badge` sem filho
     único válido, as classes não chegaram ao elemento.
   - `tsc` reclamando de prop inexistente em `ProjectPicker`/`ProjectsRail` — troca do literal feita
     no lugar errado.
   - Pill continua abrindo a tarefa em vez do popover — `stopPropagation` perdido na refatoração.
