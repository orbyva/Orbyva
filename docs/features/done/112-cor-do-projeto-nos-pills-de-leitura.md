---
prompt: |-
  Melhoria de interface pedida pelo usuário: "nas notas a pill do projeto não está com a cor do
  projeto" e "ao clicar nas pills do projeto, ao longo do codigo, ir para os projetos".

  Esta feature aplica o `ProjectPill` (feature 111) nos três lugares onde o pill é só leitura e hoje
  está sem cor ou sem destino: a lista de Notas, a Lista de Compras e o diálogo de evento da Agenda.

  Decidido no desenho:
  - A cor do projeto é a única pista visual de "de quem é isso" fora da página do projeto — perdê-la
    nas Notas e em Compras quebra o reconhecimento que a Lista/Kanban já dão.
  - A cor vem sempre de `project.color`, nunca de `variant="secondary"`: o pill sem cor deixa de
    existir.
  - O pill de leitura navega para `/tasks/projects/:id`. (O pill editável continua abrindo o picker
    — isso é a feature 113.)
  - Nas Notas o pill sai de dentro do botão que abre a nota: link aninhado em botão não é estilo, é
    markup quebrado — `<a>` dentro de `<button>` é HTML inválido e o clique não chega.
  - Na Agenda o pill absorve a navegação e o botão separado "Ir para o projeto" sai: dois
    elementos para o mesmo destino na mesma linha é ruído.
  - Fora de escopo: mudar o modelo de dados de projeto, o filtro de tarefas (feature 097) e o
    `ProjectsRail`.
---

# 112 — Cor do projeto e ida ao projeto nos pills de leitura

## Contexto
Depende de 111 (o componente `ProjectPill` e a constante `PROJECT_FALLBACK_COLOR` precisam existir).
Pode ser implementada em paralelo com 113.

Em três telas o pill de projeto é um `Badge` cinza com o nome dentro e nada mais: `/notes`
(`Notes.tsx:206-210`), `/shopping-list` (`ShoppingList.tsx:355-359`) e o diálogo de evento da Agenda
(`AgendaGrid.tsx:1001-1010`). Nenhum deles mostra a cor do projeto, e só a Agenda leva ao projeto —
por um botão separado ao lado. Esta feature troca os três pelo `ProjectPill` colorido e clicável.

## Decisões
- A cor vem sempre de `project.color`; `Badge variant="secondary"` com nome pelado deixa de existir
  nestas três telas.
- O pill de leitura leva a `/tasks/projects/:id`.
- Nas Notas o pill vira **irmão** do botão que abre a nota, na mesma linha do título — não filho
  dele. Para não criar dois tab stops para a mesma ação, o alvo de clique secundário (bloco de
  resumo/data) recebe `tabIndex={-1}` e `aria-hidden="true"`; o botão do título é o único focável.
- Nas Notas e em Compras, os mapas `projectNameById` (que só guardam o nome) viram
  `projectById: Map<string, Project>` — o formato que `AgendaGrid.tsx:350` já usa. O pill precisa do
  objeto inteiro, não do nome.
- Na Agenda, o botão "Ir para o projeto" (`AgendaGrid.tsx:1012-1019`) é **removido**; o pill passa a
  ser o destino. O rótulo neutro `EVENT_WITHOUT_PROJECT_LABEL` ("Recebido por convite") continua
  aparecendo para evento sem projeto, e **sem link** — não há projeto para onde ir.
- Em Compras o pill continua aparecendo só quando não há filtro de projeto ativo
  (`!projectFilter`), como hoje: com o filtro ligado, todas as categorias são do mesmo projeto e
  repetir o nome em cada seção é ruído.

## Tarefas
- [x] `src/pages/admin/notes/Notes.tsx:66-73`: trocar o memo `projectNameById` por
      `projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])`.
- [x] `src/pages/admin/notes/Notes.tsx:190-210`: reestruturar o cartão da nota — a linha do título
      (ícone + `<h2>` + pill) deixa de ser filha do `<button>`; o `<button>` que abre a nota passa a
      envolver só o título, e o bloco de resumo/data vira um segundo alvo de clique com
      `tabIndex={-1}` e `aria-hidden="true"`. O pill entra como irmão, na mesma linha.
- [x] `src/pages/admin/notes/Notes.tsx`: o `Badge variant="secondary"` do projeto vira
      `<ProjectPill project={projectById.get(note.project_id)} to={`/tasks/projects/${note.project_id}`} />`,
      renderizado só quando a nota tem `project_id` e o projeto existe no mapa.
- [x] Teste `src/pages/admin/notes/__tests__/Notes.project-pill.test.tsx`: com uma nota vinculada a
      um projeto de cor conhecida, (a) a bolinha do pill tem a cor do projeto; (b) o pill é
      `<a href="/tasks/projects/p1">`; (c) `container.querySelector("button a")` é `null` — nenhum
      link dentro de botão; (d) clicar no pill não navega para `/notes/n1`; (e) clicar no título
      navega para `/notes/n1`.
- [x] `src/pages/admin/shopping/ShoppingList.tsx:144-150`: trocar `projectNameById` por
      `projectById: Map<string, Project>`.
- [x] `src/pages/admin/shopping/ShoppingList.tsx:355-359`: o `Badge variant="secondary"` do projeto
      da categoria vira `<ProjectPill ... to={`/tasks/projects/${category.project_id}`} />`,
      mantendo a condição `category && !projectFilter && projeto existe`.
- [x] Teste em `src/pages/admin/shopping/__tests__/ShoppingList.project-filter.flow.test.tsx` (ou
      arquivo novo ao lado): sem filtro, a categoria de projeto mostra o pill com a cor do projeto e
      `href="/tasks/projects/p1"`; com `?project=p1` na URL, o pill não aparece nas seções.
- [x] `src/pages/admin/tasks/AgendaGrid.tsx:1001-1010`: o `Badge variant="outline"` do projeto no
      diálogo de evento vira `<ProjectPill project={projectById.get(...)} to={...} />`; manter o
      `Badge` neutro com `EVENT_WITHOUT_PROJECT_LABEL` para evento sem projeto.
- [x] `src/pages/admin/tasks/AgendaGrid.tsx:1012-1019`: remover o `<Button asChild>` com
      "Ir para o projeto" e o `<Link>` dentro dele; conferir se `ExternalLink` e `Link` ainda são
      usados no arquivo e remover o import que ficou órfão.
- [x] Atualizar `src/pages/admin/tasks/__tests__/AgendaGrid.invite-event.test.tsx:137,153`: a
      afirmação sobre o texto "Ir para o projeto" passa a ser sobre o pill — evento com projeto tem
      `<a href="/tasks/projects/...">` com o nome do projeto; evento sem projeto mostra
      "Recebido por convite" e **nenhum** link para projeto.
- [x] `npm test -- src/pages/admin/notes src/pages/admin/shopping src/pages/admin/tasks/__tests__/AgendaGrid.invite-event.test.tsx`
      verde.
- [x] `npm run lint` e `npm run build` sem erro novo.

## Prompts

## Notas

- **Suíte de Notas é instável com a paralelização padrão do Vitest nesta máquina.** Rodando
  `npm test -- src/pages/admin/notes src/pages/admin/shopping src/pages/admin/tasks/__tests__/AgendaGrid.invite-event.test.tsx`
  sem limitar workers, caem por timeout testes que não têm nada a ver com esta feature
  (`Notes.flow > escrever título e conteúdo salva sozinho`, `CanvasEditor > renomear grava o
  título`, `notaSemSintaxe > barra + menu /`). Medido: com o código **desta feature revertido**
  (`git stash`), a mesma linha de comando falhou em 2 de 3 rodadas, nos mesmos testes — é
  ambiente, não regressão. Com `--maxWorkers=3` fecha verde em todas as rodadas. Por isso o
  roteiro abaixo carrega `--maxWorkers=3`.
- O `<button>` que abre a nota passou a envolver **só o `<h2>`** do título. Isso encolhe o alvo de
  clique do título, mas o resumo/data logo abaixo continua clicável (é o segundo alvo, com
  `tabIndex={-1}`/`aria-hidden`), então o cartão inteiro segue abrindo a nota — com um tab stop só.
- Em `ShoppingList.tsx` o corpo do `groups.map` virou bloco (`=> { ... return ( ... ) }`) para
  resolver `categoryProject` uma vez por seção em vez de chamar `projectById.get` duas vezes na
  mesma condição.
- No diálogo da Agenda o pill ficou dentro de uma `<div>`: o `Badge` é `inline-flex` e o
  container é `space-y-3`, que só separa irmãos de nível de bloco.

## Como testar

Este roteiro só faz sentido com a feature 111 já implementada — é ela que cria o `ProjectPill`.

1. **Pré-requisitos**
   - Sem migration nem seed novos.
   - `npm run dev`, logado com o usuário de sempre.
   - Dados necessários: um projeto com cor bem distinta (ex.: "Obra da casa", vermelho); **uma nota
     vinculada a esse projeto** e uma nota sem projeto; **uma categoria de compras** vinculada a
     esse projeto e uma sem projeto; **um evento de agenda** com esse projeto.

2. **Verificação automatizada**
   - `npm test -- src/pages/admin/notes/__tests__/Notes.project-pill.test.tsx`
     — passou = **8 testes**. O pill das Notas tem a bolinha em `#ff6600` (a cor do projeto do
     fixture), é `<a href="/tasks/projects/p1">`, `container.querySelector("button a")` é `null`,
     clicar nele leva a `/tasks/projects/p1` e **não** a `/notes/n1`, e clicar no título leva a
     `/notes/n1`. Cobre também nota sem projeto, projeto apagado e o `tabIndex={-1}` do resumo.
   - `npm test -- src/pages/admin/shopping/__tests__/ShoppingList.project-filter.flow.test.tsx`
     — passou = **11 testes** (6 da feature 052 + 5 desta). Os desta feature vivem no describe
     "Lista de Compras — pill do projeto na seção da categoria (feature 112)": cor e `href` por
     seção, sumiço do badge cinza, pill ausente com `?project=p1`, categoria sem projeto sem pill,
     e projeto sem cor caindo em `PROJECT_FALLBACK_COLOR`.
   - `npm test -- src/pages/admin/tasks/__tests__/AgendaGrid.invite-event.test.tsx`
     — passou = **4 testes**. O diálogo do evento com projeto tem **um único** link, o pill, com
     `href="/tasks/projects/project-1"` e bolinha `#8b5cf6`; o texto "Ir para o projeto" não
     existe mais; o evento sem projeto mostra "Recebido por convite" sem link nenhum no diálogo.
   - `npm test -- --maxWorkers=3 src/pages/admin/notes src/pages/admin/shopping src/pages/admin/tasks/__tests__/AgendaGrid.invite-event.test.tsx`
     — passou = `Test Files 24 passed (24)` / `Tests 221 passed (221)`. **O `--maxWorkers=3` não é
     enfeite**: sem ele, esta máquina derruba por timeout testes de Notas que não têm relação com
     a feature (ver `## Notas`).
   - `npm run lint` — passou = `0 errors, 88 warnings`, a mesma linha de base de antes da feature
     (sem import órfão de `ExternalLink`/`Link` em `AgendaGrid.tsx` nem de `Badge` em `Notes.tsx`).
   - `npm run build` — passou = `✓ built in …`, sem erro de tipo nos mapas que deixaram de ser
     `Record<string, string>`.

3. **Verificação manual, passo a passo**
   1. Vá para `/notes`. **Esperado:** a nota vinculada mostra o pill com a **bolinha na cor do
      projeto** ao lado do título (antes era um badge cinza sem bolinha). O contorno do pill é
      fino (`variant="outline"`), não o fundo cinza sólido de antes.
   2. Clique no **pill** dessa nota. **Esperado:** vai para `/tasks/projects/<id>`, a página do
      projeto — **não** abre o editor da nota.
   3. Volte para `/notes` e clique no **título** da mesma nota. **Esperado:** abre `/notes/<id>`,
      o editor.
   4. Vá para `/shopping-list` sem filtro. **Esperado:** a seção da categoria vinculada mostra o
      pill colorido do projeto ao lado do nome da categoria; clicar nele vai para a página do
      projeto.
   5. Selecione esse projeto no filtro de `/shopping-list`. **Esperado:** o pill some das seções
      (o nome do projeto já está no topo da página).
   6. Vá para `/tasks/agenda`, clique num evento que tem projeto. **Esperado:** no diálogo, o pill
      do projeto aparece **com a bolinha colorida** e é clicável; **não existe mais** o botão
      separado "Ir para o projeto". O botão **Convidar** continua ao lado do **Excluir**, na linha
      de baixo — só o "Ir para o projeto" saiu.
   7. Clique no pill do diálogo. **Esperado:** vai para `/tasks/projects/<id>`.

4. **Casos de borda e caminhos negativos**
   - Nota **sem projeto**: nenhum pill na linha do título — nem cinza, nem "Sem projeto".
   - Projeto **sem cor** definida: a bolinha aparece cinza `#94a3b8`, o pill continua clicável.
   - Evento **recebido por convite** (`project_id` nulo): mostra "Recebido por convite", sem
     bolinha e sem link; o botão de convidar continua onde estava.
   - Nota cujo `project_id` aponta para um projeto que não veio em `fetchProjects` (apagado): o
     pill simplesmente não é renderizado — nada de pill vazio nem de link para `/tasks/projects/`.
   - Com o teclado: `Tab` pela lista de notas para em **um** alvo por nota (o título), mais o
     pill do projeto quando a nota tem projeto (é um link de verdade) e o botão de excluir. O que
     **não** pode acontecer é o mesmo destino (`/notes/<id>`) aparecer duas vezes na sequência de
     `Tab` — o bloco de resumo/data é `tabIndex={-1}`.
   - Clicar no **resumo/data** da nota (abaixo do título): abre a nota, igual ao título.

5. **Sinais de que quebrou**
   - Console com `validateDOMNesting: <a> cannot appear as a descendant of <button>` em `/notes` —
     o pill continuou dentro do botão.
   - Clicar no pill da nota abre o editor da nota em vez do projeto — o `stopPropagation` do
     `ProjectPill` não está valendo, ou o pill ainda é filho do botão.
   - Pill aparece sem bolinha (só o nome, fundo cinza) — o `Badge variant="secondary"` antigo ficou.
   - Diálogo de evento sem nenhuma forma de ir ao projeto — o botão foi removido e o pill não
     recebeu o `to`.
   - Tela branca em `/shopping-list` com `TypeError: projectById.get is not a function` — algum
     chamador do mapa antigo ficou para trás.
   - Em `/notes`, `Tab` parando duas vezes na mesma nota antes de chegar no botão de excluir — o
     `tabIndex={-1}`/`aria-hidden` do bloco de resumo se perdeu.
