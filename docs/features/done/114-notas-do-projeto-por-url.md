---
prompt: |-
  Melhoria de interface pedida pelo usuário: "link dentro do projeto para 'notas do projeto'".

  Hoje não há como chegar às notas de um projeto a partir de `/notes`, nem às notas a partir de fora
  da aba do projeto: `fetchNotes({ projectId })` existe, mas nenhuma URL a alcança.

  Decidido no desenho, com as respostas do usuário às perguntas em aberto:
  - (P2, respondida "Recomendado") O "link dentro do projeto para notas do projeto" é um link
    "Ver todas em Notas" dentro da aba Notas da página do projeto, apontando para
    `/notes?project=<id>` — a aba já lista as notas; o que falta é sair dela para o módulo com busca
    e criação de canvas.
  - (P3, respondida "Cancelar pergunta") A pergunta sobre como `/notes` apresenta o recorte foi
    cancelada pelo usuário: **não** entra `<Select>` de projeto na barra de `/notes`. O recorte vem
    da URL e só.
  - (P4, respondida "Sim") A criação de nota em `/notes?project=<id>` já nasce vinculada ao projeto
    — é o comportamento de `ProjectNotesSection` e de `/shopping-list` (`defaultProjectId`); criar
    uma nota solta dentro de um recorte de projeto seria surpresa.
  - `?project=` e não `?projeto=`: o parâmetro já existe com esse nome em `/shopping-list` e em
    `/tasks`, e no catálogo de navegação da Orb.
  - A tela `notes` do catálogo da Orb (`supabase/functions/_shared/orb/navigation.ts`) declara só
    busca livre; sem acrescentar o filtro de projeto, a Orb não sabe abrir o recorte novo.
---

# 114 — Notas do projeto alcançáveis por URL

## Contexto
Sem dependências técnicas das features 111-113 — mas mexe no mesmo arquivo que a 112
(`src/pages/admin/notes/Notes.tsx`), então implemente depois dela para não resolver conflito à toa.

`fetchNotes({ projectId })` está pronto em `src/api/notes/notes.ts:18-27` e nenhuma URL o alcança:
a única forma de ver as notas de um projeto é a aba Notas da página do projeto, e de lá não se sai
para o módulo de Notas. Esta feature liga as duas pontas por `/notes?project=<id>`.

## Decisões
- O recorte mora na URL (`/notes?project=<id>`), como em `/shopping-list` — é o que faz o link vindo
  do projeto funcionar e o estado sobreviver ao refresh.
- **`/notes` não ganha `<Select>` de projeto na barra.** A pergunta sobre a apresentação do recorte
  foi cancelada pelo usuário; o filtro é aplicado a partir da URL e o único indício visível dele é o
  texto do estado vazio (abaixo). Para tirar o recorte, volta-se a `/notes` (link da barra lateral).
- O filtro por projeto é **server-side** (`fetchNotes({ projectId })`), não local: é recorte de
  dado, diferente de `?q`, que filtra em memória porque roda a cada tecla. Mesmo caminho que
  `ProjectNotesSection` já usa.
- `load` passa a depender de `projectFilter` e recarrega quando o parâmetro muda — a tela não
  remonta quando só a query string muda (mesma armadilha já documentada no `useEffect` de `?q`,
  `Notes.tsx:31-40`).
- Com `?project=` ativo, os textos de estado vazio nomeiam o projeto. Sem isso, um projeto sem notas
  mostraria "Nenhuma nota ainda" (mentira: há notas, noutros projetos) e uma busca vazia mostraria
  `Nada com "" no título`.
- Criar nota (ou canvas) com `?project=` ativo grava `project_id` do recorte.
- O link "Ver todas em Notas" é renderizado no cabeçalho de `ProjectNotesSection` — ao lado do botão
  "Nova nota" —, não em `ProjectDetail`: aquele cabeçalho é exatamente a linha onde ele aparece, e a
  seção só é usada a partir da aba Notas do projeto.
- No catálogo da Orb, `FILTRO_PROJETO` entra no **fim** do array de filtros da tela `notes`, como
  manda a convenção do arquivo (novidade no fim, para não mexer no prefixo cacheado). Nenhum campo
  novo na tool: `project` já é um `OrbNavField` e já está em `CAMPOS_DE_FILTRO`; o que muda é só o
  conjunto que a tela `notes` aceita.

## Tarefas
- [x] `src/pages/admin/notes/Notes.tsx:37-40`: além de `?q`, ler `?project` do `useSearchParams`
      (`const projectFilter = searchParams.get("project")`), na mesma convenção de
      `src/pages/admin/shopping/ShoppingList.tsx:82-83`.
- [x] `src/pages/admin/notes/Notes.tsx:41-58`: `load` passa a chamar
      `fetchNotes({ projectId: projectFilter })` e a listar `projectFilter` nas dependências do
      `useCallback`, para recarregar quando o parâmetro muda sem remontar a tela.
- [x] `src/pages/admin/notes/Notes.tsx`: derivar `filteredProject` (o `Project` de `projects` cujo
      `id` é `projectFilter`) para os textos que nomeiam o projeto.
- [x] `src/pages/admin/notes/Notes.tsx:155-175`: com `projectFilter` ativo e nenhuma nota, o
      `EmptyState` diz que o projeto ainda não tem nota (nomeando o projeto) em vez de
      "Nenhuma nota ainda"; com busca ativa e nada encontrado, o texto menciona o projeto junto do
      termo.
- [x] `src/pages/admin/notes/Notes.tsx:76-100`: `handleCreate` passa `project_id: projectFilter` no
      `createNote` (vale para `markdown` e para `canvas`).
- [x] Teste `src/pages/admin/notes/__tests__/Notes.project-filter.flow.test.tsx`, contra um fake de
      `@/api/notes/notes` que honra `{ projectId }`: (a) em `/notes?project=p1` só as notas de p1
      aparecem; (b) em `/notes` aparecem todas; (c) "Nova nota" em `/notes?project=p1` chama
      `createNote` com `project_id: "p1"`, e "Novo canvas" também; (d) em `/notes` sem parâmetro,
      `createNote` recebe `project_id: null`; (e) projeto sem nota nenhuma mostra o estado vazio com
      o nome do projeto.
- [x] `src/pages/admin/notes/ProjectNotesSection.tsx:84-105`: acrescentar, no cabeçalho ao lado de
      "Nova nota", um `<Link to={"/notes?project=" + projectId}>` com o texto "Ver todas em Notas".
      (É o link que `src/pages/admin/tasks/ProjectDetail.tsx:1102-1104` monta na aba "Notas".)
- [x] Teste em `src/pages/admin/notes/__tests__/ProjectNotesSection.test.tsx`: o link existe com
      `href="/notes?project=p1"` e o texto "Ver todas em Notas".
- [x] `supabase/functions/_shared/orb/navigation.ts:178-184`: acrescentar `FILTRO_PROJETO`
      (definido em `:68-72`) ao fim do array `filters` da tela `notes`.
- [x] Teste em `src/domain/orb/__tests__/navigation.test.ts`: `open_screen` com
      `{ screen: "notes", project: "<nome do projeto>" }` devolve `path: "/notes?project=<id>"`, e
      `isOrbNavigablePath` aceita esse caminho.
- [x] `npm test -- src/pages/admin/notes src/domain/orb/__tests__/navigation.test.ts` verde.
- [x] `npm run check:mcp` (o catálogo de navegação é compartilhado com o servidor MCP),
      `npm run lint` e `npm run build` sem erro novo.

## Prompts

## Notas

Desvios meus em relação ao plano (nenhum pedido do usuário no meio da implementação — por isso
`## Prompts` segue vazia):

- **O link virou `<Button asChild variant="ghost">` embrulhando o `<Link>`**, não um `<Link>` solto.
  Ele fica colado no botão "Nova nota" no mesmo cabeçalho: sem a mesma altura/padding os dois
  ficariam desalinhados. O `ml-auto` migrou do botão para o link (o link é agora o primeiro dos
  dois, e é ele que tem de empurrar o par para a direita). O teste confere que continua sendo um
  `<a>` de verdade, com `href` — `asChild` não o transformou em botão.
- **O `hint` da tela `notes` no catálogo da Orb ganhou uma frase** ("Também é a tela para 'as notas
  do projeto X'"). Não estava no plano, mas a tela `tasks` tem a frase equivalente e é para ela que
  o modelo manda `project` quando a de notas não se anuncia.
- **Fallback quando o `?project=` não casa com projeto nenhum** (id inválido, projeto apagado):
  `filteredProject` é `null` e os textos caem em "Este projeto" / "deste projeto" em vez de
  imprimir `undefined`. O plano só previa o caso do projeto existente.
- **Testes além dos cinco (a)–(e) pedidos**: id de projeto inexistente; busca sem resultado dentro
  do recorte (menciona termo **e** projeto) e fora dele (texto antigo intacto); troca de `?project=`
  sem sair da rota — este último é o único que prova a dependência `projectFilter` no `useCallback`
  do `load`, que nenhum dos cinco pegaria.
- Na prova de que o teste (a) discrimina, a chamada foi revertida para `fetchNotes()` de propósito
  e o teste falhou (`expected <button> to be null`); em seguida foi restaurada. Fica registrado
  porque é o que diferencia "o teste passa" de "o teste testa".

## Como testar

1. **Pré-requisitos**
   - Sem migration nem seed novos.
   - `npm run dev`, logado com o usuário de sempre.
   - Dados necessários: um projeto (ex.: "Obra da casa") com **duas notas vinculadas**, um segundo
     projeto **sem nota nenhuma**, e pelo menos uma nota **sem projeto**.
   - Para o passo da Orb: `GEMINI_API_KEY` configurado no Supabase e a Orb respondendo — se não
     estiver, o teste automatizado de `navigation.test.ts` cobre o mesmo contrato.

2. **Verificação automatizada**
   - `npm test -- src/pages/admin/notes/__tests__/Notes.project-filter.flow.test.tsx`
     — 11 testes. Passou = `/notes?project=<id>` lista só as notas do projeto, a criação (nota e
     canvas) nasce vinculada, `/notes` sem parâmetro continua listando tudo e criando nota solta,
     o estado vazio nomeia o projeto e trocar o `?project=` sem sair da rota recarrega a lista.
   - `npm test -- src/pages/admin/notes/__tests__/ProjectNotesSection.test.tsx`
     — 8 testes. Passou = o link "Ver todas em Notas" existe, é um `<a>` com
     `href="/notes?project=<id>"`, e aparece também quando o projeto ainda não tem nota.
   - `npm test -- src/domain/orb/__tests__/navigation.test.ts`
     — 28 testes. Passou = a tela `notes` declara `project` **no fim** do array de filtros, a Orb
     monta `/notes?project=<id>` resolvendo o projeto pelo nome, e o client valida esse caminho.
   - `npm run check:mcp` — passou = o catálogo alterado continua válido no lado Node/MCP
     (sem saída é sucesso: é só `tsc -p tsconfig.mcp.json`).
   - `npm run lint` — a linha final tem de dizer `0 errors`; 88 warnings é a linha de base do repo,
     não regressão desta feature.
   - `npm run build` — termina com `✓ built in …` e a geração do service worker.
   - Suíte inteira (mais lenta): `npx vitest run --maxWorkers=3`. A paralelização padrão tem
     flakiness de ambiente neste repo; com `--maxWorkers=3` esta feature fecha com **287 arquivos /
     3173 testes / 0 falhas** (eram 286 / 3156 antes dela: +1 arquivo e +17 testes).

3. **Verificação manual, passo a passo**
   1. Vá para `/tasks/projects/<id do projeto com notas>` e abra a aba **Notas**.
      **Esperado:** a lista de notas do projeto, com "Ver todas em Notas" (link discreto, sem
      contorno) e "Nova nota" (botão com contorno) alinhados à direita do cabeçalho da seção.
   2. Clique em **"Ver todas em Notas"**. **Esperado:** vai para `/notes?project=<id>` e a lista
      mostra **só** as duas notas daquele projeto — a nota sem projeto não aparece. A barra de
      `/notes` **não** ganha seletor de projeto: o único indício do recorte é a lista (e, quando
      vazia, o texto que nomeia o projeto).
   3. Com a URL ainda em `/notes?project=<id>`, clique em **"Nova nota"**. **Esperado:** abre o
      editor da nota nova; no painel de vínculos da nota, o projeto já está preenchido com aquele
      projeto.
   4. Volte para `/notes?project=<id>` e clique em **"Novo canvas"**. **Esperado:** o canvas novo
      também nasce vinculado ao mesmo projeto.
   5. Clique em **Notas** na barra lateral (vai para `/notes`, sem parâmetro).
      **Esperado:** a lista volta a mostrar todas as notas, inclusive as sem projeto; criar agora
      gera nota **sem** projeto.
   6. Com `/notes?project=<id>` aberto, digite algo no campo de filtro. **Esperado:** a busca por
      texto acontece **dentro** do recorte do projeto, não sobre todas as notas.
   7. Na Orb (dock da barra lateral ou `/orb`), peça "abre as notas do projeto Obra da casa".
      **Esperado:** ela navega para `/notes?project=<id do projeto>` e a tela abre já recortada.

4. **Casos de borda e caminhos negativos**
   - `/notes?project=<id de projeto sem nota>`: estado vazio com o título **"Nenhuma nota neste
     projeto"** e a descrição `O projeto "<nome>" ainda não tem nota. A que você criar aqui já
     nasce vinculada a ele.` — nunca "Nenhuma nota ainda". O botão de criar continua ali e cria
     vinculado.
   - `/notes?project=nao-existe` (id inválido): lista vazia sem erro na tela e sem toast de falha;
     o texto cai no genérico **"Este projeto ainda não tem nota…"**, sem `undefined`.
   - `/notes?project=<id>&q=zzz` sem resultado: o texto é
     `Nada com "zzz" no título nem no conteúdo das notas de "<nome do projeto>".` — menciona o
     termo e o projeto, e não afirma que o projeto está sem notas. Em `/notes?q=zzz` (sem recorte)
     o texto continua o de antes: `Nada com "zzz" no título nem no conteúdo.`
   - Trocar o parâmetro na barra de endereço de um projeto para o outro **sem recarregar a página**:
     a lista troca sozinha (o `load` depende de `projectFilter`).
   - Orb pedindo `open_screen` com filtro que a tela `notes` não aceita (ex.: `status`): continua
     recusando com a mensagem "a tela notes não filtra por ...".

5. **Sinais de que quebrou**
   - `/notes?project=<id>` mostra todas as notas — o parâmetro está sendo lido mas não chega ao
     `fetchNotes`.
   - Trocar o `project` na URL não muda a lista até dar F5 — `projectFilter` ficou fora das
     dependências do `useCallback` do `load`.
   - Estado vazio dizendo `Nada com "" no título nem no conteúdo` — o texto não foi adaptado ao
     recorte por projeto.
   - Estado vazio dizendo `O projeto "undefined"` — `filteredProject` foi usado sem o fallback.
   - Nota criada dentro do recorte aparece sem projeto no painel de vínculos — `handleCreate` não
     passou o `project_id`.
   - "Ver todas em Notas" não abre nada ao clicar (ou some do cabeçalho) — o `asChild` do `Button`
     caiu e o `<Link>` virou filho de um `<button>`, markup inválido que engole o clique.
   - A Orb responde "a tela notes não filtra por project" — o `FILTRO_PROJETO` não entrou no
     catálogo, ou entrou na tela errada.
   - `npm run check:mcp` falhando — o array de filtros foi editado com tipo errado.
