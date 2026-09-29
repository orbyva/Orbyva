---
prompt: |-
  Melhoria de interface pedida pelo usuário: "ao clicar nas pills do projeto, ao longo do codigo, ir
  para os projetos".

  Esta feature cobre o caso do pill **editável** — o `ProjectBadgeButton`, usado na Lista, no
  Kanban, no Gantt e no formulário de tarefa.

  Decidido no desenho (Pergunta P1 do planejamento, respondida pelo usuário com "Recomendado"):
  - O caminho para o projeto a partir de um pill editável é um item "Ir para o projeto" no **topo do
    popover** do `ProjectBadgeButton` — preserva a troca de projeto em 1 clique e dá o destino sem
    um segundo pill na linha.
  - O pill de leitura navega; o pill editável continua abrindo o picker. Trocar o clique do editável
    por navegação tiraria a troca de projeto em 1 clique da Lista, do Kanban e do Gantt
    (features 029/033).
---

# 113 — "Ir para o projeto" no pill editável

## Contexto
Depende de 111 (o `ProjectBadgeButton` é recomposto lá em cima do `ProjectPill`). Pode ser
implementada em paralelo com 112.

Nas telas de tarefa o pill é editável: clicar abre o `ProjectPicker` num popover para trocar o
projeto do registro. Esse clique não pode virar navegação — seria perder a troca em 1 clique que as
features 029/033 entregaram. O destino entra como uma opção **dentro** do popover.

## Decisões
- Item "Ir para o projeto" no **topo** do `PopoverContent` do `ProjectBadgeButton`, acima do campo
  de busca e do `ProjectPicker`. É um `<Link to={"/tasks/projects/" + value}>`, não um botão com
  `navigate()` — link de verdade abre em nova aba com ctrl/cmd-clique, que é metade do valor de
  "ir para o projeto".
- O item **só aparece quando há projeto selecionado** (`value !== null`). Tarefa sem projeto não
  tem para onde ir, e um item morto no topo do popover é pior que item nenhum.
- Clicar no item fecha o popover (`setOpen(false)`) — senão o popover fica órfão sobre a tela nova.
- O `stopPropagation` do `PopoverContent` (`ProjectBadgeButton.tsx:56` no código entregue) continua: o popover vive
  dentro de linhas clicáveis da Lista/Kanban/Gantt.
- O pill editável em si não muda de comportamento: continua abrindo o picker no clique.
- Consumidores do `ProjectBadgeButton`, que ganham o item de graça e não precisam de
  alteração: `src/pages/admin/tasks/TaskQuickFields.tsx:109` (Lista, Kanban e Gantt, via
  `TaskViews.tsx`/`GanttChart.tsx:186`) e `src/pages/admin/tasks/TaskFormFields.tsx:304`
  (formulário de tarefa). São os quatro lugares a conferir na verificação manual.

## Tarefas
- [x] `src/pages/admin/tasks/ProjectBadgeButton.tsx`: acrescentar, como primeiro filho do
      `PopoverContent`, um `<Link>` "Ir para o projeto" para `/tasks/projects/{value}`, renderizado
      só quando `value` não é `null`; `onClick` fecha o popover.
- [x] Estilo do item: mesma métrica das linhas do `ProjectPicker`
      (`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted`),
      com ícone `ExternalLink` (`h-3.5 w-3.5`) e um separador (`border-b`/`mb-1.5`) entre ele e o
      resto do popover — ele é navegação, não uma opção de escolha de projeto.
- [x] Teste `src/pages/admin/tasks/__tests__/ProjectBadgeButton.go-to-project.test.tsx`:
      (a) com projeto selecionado, abrir o popover mostra "Ir para o projeto" como
      `<a href="/tasks/projects/p1">`; (b) com `value={null}` o item **não** aparece;
      (c) escolher outro projeto no picker continua chamando `onChange` com o id certo;
      (d) clicar no item fecha o popover (o `ProjectPicker` some do documento).
- [x] Conferir que abrir o popover a partir de uma linha clicável não dispara o clique da linha:
      afirmar no teste que um handler no elemento-pai não foi chamado.
- [x] `npm test -- src/pages/admin/tasks/__tests__/ProjectBadgeButton.go-to-project.test.tsx src/pages/admin/tasks/__tests__/TaskViews.test.tsx src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx`
      verde.
- [x] `npm run lint` e `npm run build` sem erro novo.
- [x] Achado pela suíte completa, não pelo plano: `src/pages/admin/tasks/__tests__/GanttChart.test.tsx`
      montava o `GanttChart` **sem** Router. Com o `<Link>` no popover isso virou
      `TypeError: Cannot destructure property 'basename' of 'React$1.useContext(...)' as it is null`.
      Envolver os dois helpers `renderGantt` (blocos das features 039 e 045) em `<MemoryRouter>` —
      o Gantt é elemento de rota no app, então o harness é que estava fora do real.

## Prompts

## Notas

Dois desvios pequenos do plano, decididos na implementação (nenhum pedido do usuário):

- O separador saiu num `<div className="mb-1.5 border-b pb-1.5">` **em volta** do `<Link>`, em vez
  de `border-b`/`mb-1.5` no próprio link. Motivo: o plano manda o item ter exatamente a métrica das
  linhas do `ProjectPicker` (`px-2 py-1.5` + `hover:bg-muted`), e pendurar borda e margem no link
  faria a área de hover engolir o `pb-1.5` da borda. Com o wrapper, o alvo de hover fica idêntico ao
  das linhas do picker e a borda é só a moldura.
- O arquivo de teste ganhou um sexto caso além dos quatro (a-d) pedidos: `(a')` afirma, com 16
  projetos (acima de `PROJECT_SEARCH_THRESHOLD`), que o campo de busca e o `ProjectPicker` vêm
  **depois** do link no documento. Sem ele, "primeiro filho do `PopoverContent`" não tinha nenhuma
  prova — o item podia migrar para o fim do popover com os quatro testes originais todos verdes.

Os seis testes foram conferidos contra o código por mutação, um de cada vez, revertendo depois: sem
`setOpen(false)` cai só o `(d)`; com a guarda `{value && …}` trocada por `{true && …}` cai só o
`(b)`; sem o `stopPropagation` do `PopoverContent` cai só o da linha clicável; com o bloco movido
para depois do picker cai só o `(a')`. Nenhum dos testes passa por acidente.

O `ExternalLink` é `aria-hidden`, então o nome acessível do item é exatamente "Ir para o projeto" —
é por esse nome que os testes o encontram, e é o que um leitor de tela anuncia.

A suíte completa pegou o que os testes da feature não pegariam: `GanttChart.test.tsx` renderizava o
`GanttChart` solto, sem Router. Enquanto o popover só tinha `<button>`s isso passava; o `<Link>`
desta feature quebrou os dois helpers `renderGantt`. O conserto foi no teste, não no componente — o
Gantt é elemento de rota (`routes.tsx`), então quem estava fora do real era o harness. Fazer o
componente tolerar ausência de Router seria esconder a divergência e deixar o próximo `<Link>`
quebrar de novo.

A trinca do plano (`ProjectBadgeButton.go-to-project`, `TaskViews`, `TaskFormFields`) estava verde
**enquanto** o Gantt quebrava: o `ProjectBadgeButton` chega ao Gantt por `TaskQuickFields`, que
`TaskViews.test.tsx` não cobre. Por isso a suíte inteira é parte do fechamento, e não os testes da
feature sozinhos.

## Como testar

Este roteiro só faz sentido com a feature 111 já implementada — é ela que recompõe o
`ProjectBadgeButton`.

1. **Pré-requisitos**
   - Sem migration nem seed novos.
   - `npm run dev`, logado com o usuário de sempre.
   - Dados necessários: um projeto com pelo menos uma tarefa vinculada, e uma tarefa **sem**
     projeto.

2. **Verificação automatizada**
   - `npm test -- src/pages/admin/tasks/__tests__/ProjectBadgeButton.go-to-project.test.tsx`
     — **6 testes, todos verdes**. Passou = o item aparece com o `href` certo quando há projeto
     (`a`), fica acima da busca e do picker mesmo com 16+ projetos (`a'`), some por completo quando
     não há projeto (`b`), a troca de projeto continua chamando `onChange` sem navegar (`c`), clicar
     no item navega e fecha o popover (`d`), e nem o gatilho nem o item disparam o clique da linha
     de trás.
   - `npm test -- src/pages/admin/tasks/__tests__/ProjectBadgeButton.test.tsx src/pages/admin/tasks/__tests__/TaskViews.test.tsx src/pages/admin/tasks/__tests__/TaskFormFields.test.tsx src/pages/admin/tasks/__tests__/GanttChart.test.tsx`
     — passou = o gatilho da 111 e as quatro telas que montam o pill editável não regrediram.
     `GanttChart.test.tsx` **não** estava no plano e é obrigatório aqui: foi o único a quebrar com a
     mudança (montava o Gantt sem Router), e é o Gantt que a trinca original não cobria.
     (`ProjectBadgeButton.test.tsx`, da feature 111, não estava no plano e foi acrescentado aqui: é
     ele que guarda o gatilho — pill, cor e "nada de `<button>`/`<a>` dentro do `<button>`" —, e
     este é o arquivo que a 113 mexe.)
   - `npm run lint` — passou = **`0 errors, 88 warnings`**. Os 88 avisos são a linha de base do
     repositório (`react-refresh/only-export-components` espalhado), não regressão desta feature:
     o número tem que continuar 88, e o de erros, 0.
   - `npm run build` — passou = termina em `✓ built in …` seguido do bloco `PWA`. O `tsc -b` roda
     como primeiro passo do script, então build verde já cobre o typecheck.

3. **Verificação manual, passo a passo**
   1. Vá para `/tasks`, aba **Lista**. Clique no pill de projeto de uma tarefa **que tem projeto**.
      **Esperado:** o popover abre com "Ir para o projeto" no topo, separado da lista de projetos
      logo abaixo.
   2. Clique em "Ir para o projeto". **Esperado:** vai para `/tasks/projects/<id>` e o popover fecha.
   3. Volte para `/tasks`, abra o popover da mesma tarefa e clique em **outro** projeto na lista.
      **Esperado:** o pill passa a mostrar o novo projeto (a troca em 1 clique continua valendo) e o
      popover fecha; a navegação **não** acontece.
   4. Repita o passo 1 na aba **Kanban** e na aba **Gantt**. **Esperado:** mesmo popover, mesmo item.
   5. Abra o formulário de uma tarefa (`Nova tarefa` / editar). **Esperado:** o pill do campo
      Projeto tem o mesmo item no popover.
   6. Ctrl-clique (ou cmd-clique) em "Ir para o projeto". **Esperado:** abre a página do projeto em
      nova aba — é link de verdade, não `navigate()`.

4. **Casos de borda e caminhos negativos**
   - Tarefa **sem projeto**: o popover abre direto no picker, **sem** o item "Ir para o projeto".
   - Com mais de 15 projetos cadastrados (limiar `PROJECT_SEARCH_THRESHOLD`): o campo de busca
     aparece **abaixo** do item de navegação, e digitar no campo não faz o item sumir. (A ordem já
     está coberta pelo teste `(a')`; o que sobra para o olho é só o filtro não derrubar o item.)
   - Clicar no pill de uma linha da Lista: abre o popover e **não** abre a tarefa para edição.
   - Subtarefa que herda o projeto da tarefa-mãe (`TaskFormFields`): continua mostrando
     "Herdado da tarefa principal", sem popover — não regrediu.

5. **Sinais de que quebrou**
   - O item aparece com `href="/tasks/projects/null"` ou `/tasks/projects/undefined` — a guarda de
     `value` nulo não está lá.
   - Clicar no pill navega em vez de abrir o popover — a navegação vazou para o gatilho.
   - O popover fica aberto sobre a página do projeto depois de clicar no item.
   - Clicar no pill na Lista abre também o formulário da tarefa — `stopPropagation` perdido.
   - Em teste (não no app): `TypeError: Cannot destructure property 'basename' of
     'React$1.useContext(...)' as it is null` ao abrir o popover — é o `<Link>` do item sem um
     Router acima; falta `<MemoryRouter>` no `render` daquele arquivo de teste, não é bug do
     componente.
