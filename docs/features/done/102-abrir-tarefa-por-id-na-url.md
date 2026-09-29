---
prompt: |
  quero que exista formas de referenciar tarefas, no projeto, que serão rastreáveis. Então se eu digitar>

  TASK-> painel de ...

  isso deve já criar e vincular uma task, ou posso na hora vincular uma já existente

  ---
  Fatia desta feature (decidida no desenho de 2026-09-21):

  Para onde o clique na referência leva? Resposta do usuário: "recomendado" — ou seja,
  `/tasks?task=<id>` abrindo o Dialog de edição de tarefa que já existe em `TaskList.tsx`.
  Não há rota `/tasks/:id`, e criar uma página de detalhe de tarefa é escopo próprio, maior
  que esta rodada.

  Esta feature entrega só o destino: um id de tarefa na URL abre aquela tarefa. É
  pré-requisito da rastreabilidade — sem um lugar para onde apontar, a referência no texto
  não tem o que linkar. De brinde, a Orb ganha o link por id (hoje ela manda
  `/tasks?q=<título>`, que é busca por texto, não destino).
---

# 102 — Abrir a tarefa por id pela URL (`/tasks?task=<id>`)

## Contexto
Sem dependências — pode ser implementada em paralelo com a 103.

`/tasks` já é uma tela dirigível por URL: `src/pages/admin/tasks/TaskList.tsx` (hoje por volta de
`:327`, no `useEffect` comentado como "Filtros vindos da URL (feature 100)") lê `project`, `q`,
`status`, `view`, `priority`, `tag` e `today`. O que não existe é apontar para **uma** tarefa.

Isso trava duas coisas. A referência rastreável no texto (features 103–106) precisa de um destino
por id para o clique abrir. E a Orb, quando propõe/cria uma tarefa, linka
`/tasks?q=<título>` (`src/api/orbActions.ts:66`) — busca textual, que erra quando o título se
repete, e recorrência materializa dezenas de tarefas com o mesmo nome.

Não há rota `/tasks/:id` no projeto; o que existe é o Dialog de edição dentro da própria
`TaskList` (hoje por volta de `:1287`, estado em `:148`: `open`, `editing`, `form`).

## Decisões
- **O destino é `/tasks?task=<id>`, abrindo o Dialog de edição que já existe** — não uma rota nova
  `/tasks/:id`. Página de detalhe de tarefa é escopo próprio e maior; o Dialog já mostra e edita
  tudo. (Resposta do usuário a "para onde o clique leva": a recomendada.)
- **O parâmetro é lido no mesmo `useEffect` dos outros**, não num inicializador de `useState`:
  navegar de `?task=A` para `?task=B` não remonta a tela, e um inicializador só pegaria o primeiro.
  É a mesma razão já registrada em comentário naquele efeito.
- **A tarefa pode não estar na lista carregada** — ela pode estar concluída enquanto o filtro está
  em "pendentes", ou pertencer a outro projeto que o filtro atual exclui. Nesse caso busca-se pelo
  id com `fetchTaskById` (`src/api/tasks/tasks.ts:189`, que já existe e já filtra por `user_id`) em
  vez de desistir. Abrir "tarefa não encontrada" porque o filtro escondeu a linha seria o bug óbvio
  desta feature.
- **Ao fechar o Dialog, o `?task=` sai da URL** (`setSearchParams(..., { replace: true })`). Sem
  isso a URL mente sobre o estado da tela, e recarregar a página reabre um Dialog que a pessoa
  acabou de fechar. `replace` e não `push` para não encher o histórico de voltas.
- **Diferente dos outros parâmetros, `task` não é filtro** — ele não recorta a lista, só abre o
  Dialog. Por isso não entra na lógica de "parâmetro ausente não faz faxina no filtro já aplicado".
- A tela `tasks` do catálogo da Orb (`supabase/functions/_shared/orb/navigation.ts`, entrada com
  `id: "tasks"`) ganha `task` entre os filtros aceitos, e a Orb passa a poder abrir a tarefa exata.

## Tarefas
- [x] Ler `task` da URL em `src/pages/admin/tasks/TaskList.tsx`, dentro do `useEffect` que já lê
      `project`/`q`/`status`/`view`/`priority`/`tag` (hoje por volta de `:327`): quando o parâmetro
      existe, procurar a tarefa na lista já carregada e, achando, abrir o Dialog com ela
      (`setEditing`, `setForm`, `setOpen(true)` — mesmo caminho que o clique na linha usa).
      Verificação: `npm run build`
- [x] Caminho da tarefa fora da lista: quando o id não estiver no estado carregado, chamar
      `fetchTaskById` (`src/api/tasks/tasks.ts:189`) e abrir o Dialog com o resultado. Estado de
      carregamento enquanto a busca corre, para não parecer que o clique não fez nada.
      Verificação: `npm run build && npm run lint`
- [x] Caminho negativo: id inexistente, id de outro usuário (o `fetchTaskById` devolve `null`
      porque filtra por `user_id`) e id malformado não podem quebrar a tela — mostrar toast
      "Tarefa não encontrada" e limpar o `?task=` da URL, deixando a lista normal no lugar.
      Verificação: `npm run build && npm run lint`
- [x] Fechar o Dialog remove o `?task=` da URL com `setSearchParams(..., { replace: true })`,
      preservando os demais parâmetros que estiverem lá (`?project=X&task=Y` fechando vira
      `?project=X`). Cuidado para não disparar o efeito em laço: remover o parâmetro muda
      `searchParams` e roda o efeito de novo.
      Verificação: `npm run build`
- [x] Testar em `src/pages/admin/tasks/__tests__/TaskList.orb-url-filters.test.tsx` (arquivo que já
      cobre os outros parâmetros): `?task=<id>` de tarefa presente na lista abre o Dialog com o
      título dela; `?task=` de tarefa **ausente** da lista carregada busca por id e abre; id
      inexistente mostra o toast e não abre Dialog; fechar o Dialog tira o `task` da URL e mantém o
      `project`; `?project=X&task=Y` aplica os dois (o recorte **e** o Dialog).
      Verificação: `npm test src/pages/admin/tasks`
- [x] Declarar o filtro `task` na tela `tasks` do catálogo da Orb, em
      `supabase/functions/_shared/orb/navigation.ts` (entrada `id: "tasks"`, lista `filters`):
      `field`/`param` `task`, descrição dizendo que é o **id** de uma tarefa e que abre a tarefa em
      vez de filtrar a lista. Acrescentar no fim da lista de filtros, não no meio — a ordem faz
      parte do prefixo cacheado do prompt, regra registrada no topo do arquivo.
      Verificação: `npm run build && npm run check:mcp`
- [x] Testar o catálogo em `src/domain/orb/__tests__/navigation.test.ts`: a tela `tasks` aceita
      `task`, e um `open_screen({screen:"tasks", task:"<uuid>"})` produz o caminho
      `/tasks?task=<uuid>`. Verificação: `npm test src/domain/orb`
- [x] O "de brinde" do `prompt:`: `src/api/orbActions.ts` para de devolver `/tasks?q=<título>` no
      cartão de tarefa criada e passa a devolver `/tasks?task=<id da tarefa criada>` — agora que o
      destino existe, o link da Orb deixa de ser busca textual (que erra quando o título se repete,
      e recorrência materializa dezenas de tarefas com o mesmo nome).
      Verificação: `npm test src/api`
- [x] `npm run build && npm run lint && npm test && npm run check:bundle` limpos: build OK, lint
      com 0 erros (88 warnings de `react-refresh` pré-existentes), **267 arquivos / 2946 testes,
      0 falhas** (base era 266 / 2926 — a feature somou 1 arquivo e 20 testes), bundle dentro do
      orçamento. `npm run check:mcp` também limpo.

## Prompts

## Notas

- 2026-09-22 — Tarefa acrescentada por mim, não por pedido novo do usuário: o `prompt:` do
  frontmatter fecha com "De brinde, a Orb ganha o link por id (hoje ela manda `/tasks?q=<título>`)",
  e o Contexto aponta `src/api/orbActions.ts:66`, mas a lista original de tarefas só cobria o
  catálogo da Orb (`open_screen`), não o link do cartão de "Tarefa criada". Sem isso o item "Sinais
  de que quebrou" — "A Orb continua mandando `/tasks?q=<título>`" — ficaria verdadeiro com a
  feature "pronta".
- 2026-09-22 — `closeTaskDialog` também substituiu o `setOpen(false)` do caminho de **salvar**, não
  só o do `onOpenChange`. Salvar fecha o Dialog do mesmo jeito; deixar o `?task=` na URL ali faria
  recarregar reabrir a tarefa recém-salva, que é exatamente o que a decisão do arquivo proíbe.
- 2026-09-22 — A resolução de `?task=` ficou num efeito **separado** do que lê os outros
  parâmetros (o outro só guarda o id em estado). Motivo: resolver ali dentro exigiria `tasks` e
  `loading` como dependências daquele efeito, e aí todo `load()` reaplicaria `project`/`q`/`status`
  da URL por cima do que a pessoa tivesse mexido na barra depois de chegar pelo link — regressão da
  feature 100. A decisão "é lido no mesmo `useEffect` dos outros" continua valendo para a
  **leitura**, que é o que ela protege (não usar inicializador de `useState`).
- 2026-09-22 — `npm test src/pages/admin/tasks` falhou uma vez com 5 testes estourando timeout
  (`ProjectDetail.external-links`, `TaskList.form-panel`, `TaskList.project-filter`) e passou limpo
  nas duas execuções seguintes, inclusive rodando os três arquivos isolados. É lentidão sob carga
  paralela, não regressão.

## Como testar

1. **Pré-requisitos**
   - Nenhuma migration. `npm run dev` e login normal.
   - Ter pelo menos 3 tarefas: uma pendente sem projeto, uma **concluída**, e uma pendente dentro de
     um projeto. Pegue os `id` delas pelo SQL editor do Supabase
     (`select id, title, status, project_id from task limit 5`) — a tela não mostra o id em lugar
     nenhum ainda.

2. **Verificação automatizada**
   - `npm test src/pages/admin/tasks/__tests__/TaskList.orb-url-filters.test.tsx` — passou = 20
     testes verdes (6 da feature 100 + 14 da 102): tarefa na lista, tarefa fora da lista, aviso de
     carregamento, id inexistente, id malformado, limpeza preservando os outros parâmetros,
     `?project=`+`?task=` juntos, fechar o Dialog, salvar, colar a mesma URL de novo, "Nova tarefa"
     sem mexer na URL, `?task=A` → `?task=B` e `/tasks` sem parâmetro.
   - `npm test src/domain/orb/__tests__/navigation.test.ts` — passou = 24 testes verdes: a tela
     `tasks` declara `task` (texto livre, último da lista) e `open_screen({screen:"tasks", task})`
     monta `/tasks?task=<uuid>`, caminho que a validação do client aceita.
   - `npm test src/api/__tests__/orbActions.task-link.test.ts` — passou = 2 testes verdes: o cartão
     de "Tarefa criada" devolve `/tasks?task=<id>`, e não mais `/tasks?q=<título>`.
   - `npm run build && npm run check:mcp` — passou = o catálogo da Orb continua tipando dos dois
     lados (app e servidor MCP).

3. **Verificação manual, passo a passo**
   1. Abra `/tasks?task=<id da tarefa pendente>`. **Esperado**: a lista carrega e o Dialog "Editar
      tarefa" abre já preenchido com aquela tarefa (o campo "Título" mostra o título dela).
   2. Feche o Dialog (Esc ou o X). **Esperado**: a barra de endereço passa a ser `/tasks`, sem
      `?task=`. Recarregue: o Dialog **não** volta.
   3. Abra `/tasks?task=<id>` de novo, mude alguma coisa e clique em **Salvar**. **Esperado**: o
      Dialog fecha, a tarefa aparece atualizada na lista e o `?task=` sai da URL também neste
      caminho — salvar fecha o Dialog, então tem que limpar a URL igual ao fechar à mão.
   4. Deixe o filtro de status em "Pendentes" e abra `/tasks?task=<id da tarefa CONCLUÍDA>`.
      **Esperado**: aparece por um instante a linha "Abrindo a tarefa…" e o Dialog abre, mesmo com a
      tarefa não aparecendo na lista atrás dele. Este é o caso que a busca por id existe para cobrir.
   5. Abra `/tasks?project=<id de um projeto>&task=<id de uma tarefa de OUTRO projeto>`.
      **Esperado**: a lista fica recortada no projeto da URL **e** o Dialog abre com a tarefa do
      outro projeto. Fechando o Dialog, a URL vira `/tasks?project=<id>` — o recorte sobrevive.
   6. Peça à Orb, em qualquer tela: "abre a tarefa <título exato de uma tarefa sua>". **Esperado**:
      ela consulta a tarefa, chama `open_screen` com o `task` e navega para `/tasks?task=<uuid>`,
      com o Dialog abrindo naquela tarefa — não para `/tasks?q=<título>`.
   7. Peça à Orb para **criar** uma tarefa e confirme o cartão. **Esperado**: o link "ver" do cartão
      de "Tarefa criada" leva a `/tasks?task=<uuid da tarefa nova>` e abre exatamente ela.

4. **Casos de borda e caminhos negativos**
   - `/tasks?task=nao-e-uuid` → toast "Tarefa não encontrada", lista normal, sem Dialog, e o
     parâmetro sai da URL. **Não** pode aparecer tela branca nem erro no console.
   - `/tasks?task=<uuid válido que não existe>` → mesmo comportamento do item acima.
   - `/tasks?task=<id de tarefa de outra conta>` (se tiver como testar com dois logins) → mesma
     coisa: `fetchTaskById` filtra por `user_id`, então devolve `null` e cai no toast. **Não** pode
     abrir o Dialog com dado de outra pessoa.
   - Navegar de `/tasks?task=A` direto para `/tasks?task=B` (colando a segunda URL) → o Dialog troca
     para a tarefa B. Se ficar preso na A, o parâmetro está sendo lido só na montagem.
   - `/tasks` sem `?task=` → nada muda; nenhum Dialog abre sozinho.
   - Abrir "Nova tarefa" pelo botão e fechar, com a URL limpa → **não** pode acontecer navegação
     nenhuma (a limpeza só roda quando o `?task=` está mesmo na query).
   - Chegar por `/tasks?task=<id>`, fechar o Dialog e colar a MESMA URL de novo → o Dialog reabre.
     Se não reabrir, o guarda de "id já resolvido" não está sendo rearmado.

5. **Sinais de que quebrou**
   - Dialog abre e fecha sozinho em laço, ou a página congela: o efeito que limpa o `?task=` está
     se realimentando.
   - Toast "Tarefa não encontrada" para uma tarefa que existe e aparece na lista: a busca está
     comparando id com outra coisa (título, índice), ou o parâmetro está sendo lido antes de a lista
     carregar sem cair no `fetchTaskById`.
   - Fechar o Dialog apaga também o `?project=`: a limpeza está reescrevendo a query inteira em vez
     de remover só a chave `task`.
   - O Dialog reabre sozinho depois de você salvar ou concluir outra tarefa: o `load()` está
     disparando de novo a resolução do `?task=` — o guarda de id já resolvido saiu do lugar.
   - A Orb continua mandando `/tasks?q=<título>`: o filtro `task` não entrou no catálogo, ou entrou
     e o modelo não o viu porque foi inserido no meio da lista (quebra o prefixo cacheado).
   - O cartão de "Tarefa criada" ainda linka `?q=`: `src/api/orbActions.ts` ficou para trás.
