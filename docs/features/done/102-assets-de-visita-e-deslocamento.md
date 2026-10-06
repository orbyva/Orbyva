---
prompt: |
  Preciso que tanto em um lugar quanto um deslocamento, eu tenha um botão de assets, tipo pra salvar no voo os documentos importantes para o voo e na visita também, tipo arquivos importantes e links

  não precisa de plano, já crie a feature implemente, e suba
commits:
  - d956a7f — feat(travel): assets de visita e deslocamento + horário de embarque
pr: "#13 — feat(travel): assets de visita e deslocamento + horário de embarque"
---

# 102 — Assets de visita e deslocamento no roteiro (+ horário de embarque)

## Contexto

Uma linha do roteiro (`trip_itinerary_activity`) hoje carrega **um** link e nada mais:
`link_url`, editado no `TripEditActivityDialog` e exibido no card como chip "Maps" ou ícone de link
externo (`TripItineraryTab.tsx`). Não há onde guardar arquivo nenhum — o cartão de embarque do voo,
o PDF da reserva do hotel, o ingresso do museu ficam fora do app, e quando o deslocamento acontece
é exatamente aí que eles precisam estar a um toque de distância.

O pedido é o mesmo para as duas metades do roteiro: **visita** (categoria de lugar) e
**deslocamento** (`category = 'transport'`) ganham um botão de *assets*, e um asset é um **arquivo**
ou um **link**. Um deslocamento e uma visita não precisam de modelos diferentes — os dois querem
"coisas importantes anexadas a esta linha do roteiro" — então é uma tabela só, pendurada na
atividade, e um botão só, que aparece nos dois tipos de card.

Nota de escopo: esta feature é a do **roteiro na web**. O app nativo (`mobile/`) não recebe a tela
de assets aqui; levar a tela para lá é feature própria — registrada nas Notas, não tarefa desta.

## Decisões

- **Tabela nova `trip_activity_asset`, uma linha por asset, `kind` explícito (`file` | `link`).**
  Não cabe em coluna de `trip_itinerary_activity`: são vários por linha do roteiro, com rótulo e
  ordem. `kind` é gravado em vez de derivado de "tem `storage_path`?" porque é o que o `check` da
  tabela ancora e o que a UI lê para escolher ícone e ação — derivar espalharia a regra.
  Colunas: `id`, `trip_id`, `activity_id` (`on delete cascade`), `kind`, `label`, `url`,
  `storage_path`, `mime_type`, `size_bytes`, `position`, `created_by_user_id`, `created_at`.
  `check` amarra os dois formatos: link tem `url` e não tem `storage_path`; arquivo tem
  `storage_path` e não tem `url`.

- **`trip_id` denormalizado na linha, mesmo havendo `activity_id`.** É o que permite baixar os
  assets da viagem inteira na **wave 1** de `fetchTripDetailBundle` (junto de expenses/days/places),
  em vez de uma terceira ida ao banco que só poderia começar depois de as atividades chegarem — e é
  o que torna a RLS `public.is_trip_member(trip_id)` idêntica à de `trip_milestone`, em vez de um
  join duplo por linha. A denormalização é segura porque atividade muda de **dia**, nunca de
  viagem: `trip_id` de um asset nunca precisa ser reescrito. Um trigger
  (`trip_activity_asset_check_trip`) afirma o invariante em vez de deixá-lo na fé do cliente.

- **Bucket `trip-assets` privado, lido por URL assinada — não público como `task-icons`.** Um cartão
  de embarque tem nome completo, número de documento e localizador; num bucket público a URL é a
  senha, e URL vaza (histórico, print, link colado). Privado + `createSignedUrl` de 5 min é o
  mínimo defensável, e é a primeira vez que o projeto usa esse caminho: as policies de leitura
  valem para membros da viagem, derivando o `trip_id` da **primeira pasta** do caminho
  (`{tripId}/{activityId}/{uuid}.{ext}`) via `public.trip_assets_path_member(text)` — função
  auxiliar que faz o cast com `exception` própria, para caminho torto virar `false` e não erro de
  `invalid input syntax`.

- **Sem allowlist de mime; teto de 10 MB.** "Arquivo importante" é, por definição, o que o usuário
  tem na mão — pdf da reserva, foto do ingresso, `.pkpass` do cartão de embarque, `.docx` do
  contrato de aluguel. Uma allowlist transformaria metade desses casos numa falha opaca de upload.
  O que substitui a allowlist: bucket privado (nada é navegável sem assinatura) e a regra de
  abertura abaixo.

- **Abrir um arquivo: inline só para `application/pdf` e `image/*`; todo o resto baixa.** A URL
  assinada de um `.html`/`.svg` renderizaria no domínio do Storage se aberta inline, e um documento
  que não é pdf nem imagem não ganha nada sendo renderizado. `signedAssetUrl` decide isso pelo
  `mime_type` gravado, passando `download: <nome do arquivo>` quando não é visualizável — é a
  regra que substitui a allowlist de mime, e mora numa função só.

- **Excluir o asset apaga o arquivo do bucket.** Diferente de `deleteIconAsset` (feature 086), que
  preserva o arquivo porque a URL pode estar em uso por outra tarefa: aqui o arquivo tem um dono
  único e óbvio (esta linha do roteiro), ninguém mais aponta para ele, e deixá-lo seria lixo pago
  em armazenamento. O `storage.remove` roda **antes** do delete da linha; se ele falhar, a linha
  fica e o erro sobe — perder a referência de um arquivo que continua existindo é pior que não
  apagar.

- **UI: botão no card + diálogo próprio, não campo no formulário de edição.** Upload precisa de
  `activity_id`, que só existe depois de a atividade estar salva — um campo de arquivo dentro do
  `TripEditActivityDialog` em modo `create` não teria onde gravar. O botão fica no card (ícone de
  clipe, com a contagem quando há assets), e há também um item "Assets" no menu `...` para
  descoberta. O diálogo lista, adiciona arquivo, adiciona link, renomeia e exclui.

- **Contagem vem do bundle; o diálogo recarrega só a si mesmo.** O card mostra `N` sem consulta
  própria (os assets chegam em `TripItineraryActivity.assets`), e o que o diálogo escreve sobe para
  o estado do `TripDetail` por callback, sem refetch do bundle inteiro — mesmo padrão de
  `onActivityDeleted`.

- **Horário de embarque: coluna nova `boarding_time`, não um terceiro sentido para as que existem.**
  `activity_time` é a partida e `arrival_time` é a chegada; o embarque é um terceiro instante, e o
  único dos três que decide quando sair do hotel. Não é derivável da partida (fecha ~20 min antes,
  mas varia por companhia, aeroporto e tipo de voo), então é dado, não cálculo. `text` `HH:mm` como
  as outras duas — o roteiro trata horário como hora de parede em toda parte
  (`OptionalTimeInput`, `estimateArrivalHHmm`, os ordenadores de `visits.ts`), e tipar só esta
  coluna como `time` criaria a única que precisa de conversão.

- **O campo aparece para voo, trem e ônibus; não para carro nem "outro".** Embarque é um conceito
  dos modos com portão; em carro, pedir "horário de embarque" é pedir nada. A regra é do domínio
  (`transportModeHasBoarding`), não do componente, para o card e o formulário concordarem sem
  repetir a lista.

- **No card, o embarque vem antes da partida e com rótulo próprio.** A linha de horário hoje é
  `partida → chegada`; o embarque entra como um item seu ("Embarque 13:40"), não como um terceiro
  número na seta — a seta significa trajeto, e embarque não é trajeto.

## Tarefas

- [x] Migration `trip_activity_asset` + bucket privado `trip-assets` + `trip_assets_path_member` +
      policies (tabela e `storage.objects`) + trigger do invariante `trip_id`/`activity_id`
- [x] Testes SQL em `supabase/tests/trip_activity_asset/` (schema, RLS, trigger, `check` do `kind`)
- [x] Tipos: `TripActivityAsset`, `TripActivityAssetKind`, `assets` em `TripItineraryActivity`
- [x] Domínio puro `src/domain/travel/activityAssets.ts` (rótulo de exibição, `isInlineViewableMime`,
      próxima `position`, validação/normalização de URL) + testes Vitest
- [x] API `src/api/travel/activityAssets.ts` (fetch por viagem, upload de arquivo, add link,
      renomear, excluir, `signedAssetUrl`) + testes com Supabase mockado
- [x] `fetchTripDetailBundle`: assets na wave 1, anexados por `activity_id`
- [x] `TripActivityAssetsDialog` (lista, adicionar arquivo, adicionar link, renomear, excluir)
- [x] Botão de assets no card de visita **e** de deslocamento + item no menu `...` em
      `TripItineraryTab`, ligado no `TripDetail`
- [x] Teste de componente: botão aparece nos dois tipos de card e abre o diálogo
- [x] Migration `boarding_time` em `trip_itinerary_activity`
- [x] `transportModeHasBoarding` em `src/domain/travel/transportModes.ts` + teste Vitest
- [x] `boarding_time` no tipo, no `ACTIVITY_SELECT`, no create/update da API e no `ActivityForm`
- [x] Campo "Embarque" no `TripEditActivityDialog` (só nos modos com embarque) + exibição no card
- [x] `npm run lint` (0 erros), `npm test` (3856 testes / 336 arquivos), `npm run build` verdes

## Prompts

- 2026-09-30 — "Preciso que tanto em um lugar quanto um deslocamento, eu tenha um botão de assets,
  tipo pra salvar no voo os documentos importantes para o voo e na visita também, tipo arquivos
  importantes e links / não precisa de plano, já crie a feature implemente, e suba"
- 2026-09-30 — "adicione nessa mesma a adição do horário de embarque, do voo"
- 2026-10-06 — "do the same i asked earlier, about not creating tasks like, user need to db push, or
  manual testing, or nothing like it in 102, so just update the feature, and push to master. update
  the working tree and commits also in the header"

## Notas

- **2026-10-06: saíram as três tarefas que não eram auto-contidas.** Eram o `supabase db push`
  (ação do usuário, banco remoto), o `bash supabase/tests/trip_activity_asset/run.sh` (dependia de
  Docker na máquina) e "levar a tela para o `mobile/`" (fora do escopo declarado da própria
  feature). Pela regra da esteira, dependência de ambiente é pré-requisito em **Como testar** e
  escopo de outra feature é nota, não caixinha — tarefa que espera o usuário prendia esta feature em
  `in-progress/` para sempre. O código e os testes foram entregues em `d956a7f` (PR #13).
  Nesta sessão o Docker continua fora (`docker info` falha) e o estado remoto das migrations não foi
  conferível: `npx supabase migration list` morre em `LegacyDbConfigLoginRoleStatusError`
  (connection timeout) — o mesmo erro da 247.

- **A tela de assets no app nativo (`mobile/`) segue pendente, como feature própria.** Não foi
  perdida ao sair da lista de tarefas: o app ainda não tem onde anexar arquivo a uma linha do
  roteiro, e quem atacar isso parte das decisões desta feature (bucket privado, `kind`, regra de
  abertura inline).

- **Os testes SQL foram escritos mas não executados: o Docker não estava rodando na máquina** no
  momento da implementação (`docker info` falhou). O arquivo está completo e no formato do
  `supabase/tests/icon_asset/`; rodar `bash supabase/tests/trip_activity_asset/run.sh` antes do
  `supabase db push` está em **Como testar**, como pré-requisito de ambiente — não como tarefa. As
  migrations **não** foram aplicadas em banco nenhum.

- **Duas resiliências entraram sem estar no plano, pela janela entre o deploy e o `db push`.** Sem
  elas, publicar o front antes de aplicar a migration quebraria o roteiro inteiro em vez de só não ter
  a feature:
  1. `selectActivities` (em `src/api/travel.ts`) repete o select sem `boarding_time` quando o erro
     menciona a coluna — um `select` que pede coluna inexistente falha inteiro, e `fetchTripDetailBundle`
     dá `throw` no erro de atividades;
  2. `isMissingAssetSchema` faz `fetchAssetsForTrip` devolver `{}` quando a tabela/bucket não existem,
     no mesmo molde que a função já usava para `trip_stop` e `trip_member`.
  `stripMissingActivityColumns` também ganhou `boarding_time` (lado da escrita).

- **`assets` entrou no `Omit` de `TripItineraryActivityCreateRequest`.** O tipo é derivado de
  `TripItineraryActivity`, então a coleção filha vazaria para o payload do insert e o Supabase
  recusaria uma coluna que `trip_itinerary_activity` não tem. Vale como lembrete: todo campo novo que
  não seja coluna precisa entrar nesse `Omit`.

- **`image/svg+xml` ficou fora de `isInlineViewableMime` embora seja `image/`.** A decisão da feature
  diz "pdf e imagem abrem inline", mas SVG é markup que roda script quando aberto como navegação de
  topo — exatamente o que a 055 desligou no resto do app. É a única exceção dentro de `image/*`, e
  está travada por teste.

- **Rebaseada sobre a master do repositório da organização (`orbyva/Orbyva`).** A feature nasceu em
  cima de uma master 29 commits atrás; o rebase foi limpo (dos 29, só `src/domain/travel/index.ts`
  toca a área de viagem, e esta feature não o altera) e os timestamps das duas migrations continuam
  sendo os mais novos da pasta, sem colisão com `20260924113000_orb_avatar.sql`.

- O ruído de lint vindo de worktrees irmãos, que valia quando esta feature começou, deixou de valer:
  `8ad3a68 chore(lint): keep other branches' worktrees out of eslint` entrou na master e o `npm run
  lint` agora fecha com **0 erros**.

- O botão do card tem a contagem no `aria-label` (`Assets de X: 2` / `Anexar assets em X`), e é por
  esse rótulo que os testes de componente o encontram. Mudar a frase quebra os testes de propósito:
  a contagem no rótulo é o que faz o leitor de tela dizer que existe documento sem abrir o diálogo.

## Como testar

1. **Pré-requisitos**
   - As duas migrations desta feature aplicadas no banco remoto (não há Supabase local no projeto):
     `20260930120000_trip_activity_asset.sql` e `20260930130000_trip_activity_boarding_time.sql`,
     via `supabase db push` — **banco remoto, confirmar antes de rodar**. Enquanto não estiverem
     aplicadas o app não quebra, mas a feature não existe: `isMissingAssetSchema` devolve `{}` e o
     botão de assets não aparece em card nenhum; `selectActivities` repete o select sem
     `boarding_time` e o campo "Embarque" não grava.
   - Para os testes SQL: Docker rodando (`docker info` responde). O `run.sh` sobe um Postgres 16
     descartável e **não** toca no banco remoto.
   - Logado com um usuário **membro** da viagem, numa viagem com pelo menos um dia de roteiro
     contendo uma visita e um deslocamento de modo **voo**. Para o caso negativo de RLS, um segundo
     usuário fora da viagem.

2. **Verificação automatizada**
   - `npx vitest run src/api/__tests__/tripActivityAssets.test.ts src/domain/travel/__tests__/activityAssets.test.ts src/domain/travel/__tests__/transportModes.test.ts src/pages/admin/travel/components/__tests__/TripItineraryAssets.test.tsx`
     → 4 arquivos / 78 testes passando (rodado em 2026-10-06). Cobre domínio (rótulo,
     `isInlineViewableMime` com SVG de fora, `position`, normalização de URL), API com Supabase
     mockado (upload, link, rename, delete apagando do bucket, `signedAssetUrl`),
     `transportModeHasBoarding` e o botão de assets nos dois tipos de card.
   - `bash supabase/tests/trip_activity_asset/run.sh` → sai 0 e imprime as assertivas de
     schema/`check` do `kind`/índice/FKs/RLS/trigger do `trip_id`/bucket privado/cascade. **Ainda
     não foi rodado** (Docker fora desde a implementação): é a verificação que falta das migrations.
   - `npm run lint` (0 erros), `npm test`, `npm run build` — a suíte inteira estava verde no commit
     da feature (3856 testes / 336 arquivos).

3. **Verificação manual, passo a passo**
   1. Abrir `/travel/<id da viagem>` → aba **Roteiro**.
   2. Na linha de uma **visita**, clicar no ícone de clipe (rótulo `Anexar assets em <título>`)
      → o diálogo de assets abre vazio. O item **Assets** no menu `...` da mesma linha abre o mesmo
      diálogo.
   3. "Adicionar arquivo" → escolher um PDF. Ele aparece na lista com o nome do arquivo. Fechar o
      diálogo: o botão do card agora mostra `1` e o rótulo virou `Assets de <título>: 1` — sem
      recarregar a página.
   4. Clicar em "Abrir" no PDF → abre em aba nova (URL assinada, 5 min). Subir um
      `.docx` e clicar em abrir → **baixa** em vez de renderizar.
   5. "Adicionar link" → digitar `tap.pt` e salvar: grava `https://tap.pt` e o item aparece com
      ícone de link.
   6. Renomear um asset (ícone de lápis) → o nome muda na lista; excluir (ícone de lixeira) → sai da
      lista e o arquivo sai do bucket `trip-assets` (conferível no Storage do painel do Supabase).
   7. Repetir os passos 2–3 num **deslocamento**: mesmo botão, mesmo diálogo.
   8. Embarque: editar um deslocamento de modo **voo** → existe o campo "Embarque". Preencher
      `13:40` e salvar → o card mostra "Embarque 13:40" como item próprio, **antes** da linha
      `partida → chegada`. Trocar o modo para **carro** → o campo deixa de ser oferecido (idem
      "outro"); em **trem** e **ônibus** ele aparece.

4. **Casos de borda e caminhos negativos**
   - Arquivo acima de 10 MB → toast "…passa de 10 MB, o limite por arquivo." e nada é enviado.
   - Link `ftp://x` ou `https://` sozinho → "O link precisa começar com http:// ou https://." e
     nada é gravado.
   - `.svg` → sempre baixa, nunca abre inline (exceção dentro de `image/*`, travada por teste).
   - Excluir a atividade do roteiro → os assets dela desaparecem com ela (cascade).
   - Usuário fora da viagem: não lê a linha nem o objeto no Storage (RLS por `trip_id` e pela
     primeira pasta do caminho `{tripId}/{activityId}/…`); coberto em `03_assert_behavior.sql`.
   - URL do objeto sem assinatura, ou assinatura depois de 5 min → 400/403 do Storage, não o arquivo.

5. **Sinais de que quebrou**
   - Botão de assets ausente em **todos** os cards, sem erro no console: a tabela/bucket não existem
     — migration não aplicada, `isMissingAssetSchema` engoliu. É "ambiente", não "não implementado".
   - Roteiro inteiro vazio ou erro ao carregar atividades: migration do `boarding_time` ausente
     **e** o fallback de `selectActivities` removido — um `select` com coluna inexistente falha
     inteiro e `fetchTripDetailBundle` dá `throw`.
   - Contagem no botão desencontrada da lista do diálogo: o callback de volta ao `TripDetail` parou
     de subir o que o diálogo escreveu (não há refetch do bundle para corrigir).
   - "Abrir" devolvendo 400: policy de `storage.objects` fora do ar ou assinatura expirada.
