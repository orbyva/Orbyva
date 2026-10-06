---
prompt: |-
  crie implemente e faça o push das seguintes features, no need for planning:
  - poder adicionar assets direto na criação de um evento
  - poder personalizar os tipos do evento, adicionando um ícone (da biblioteca de ícones gerais do
  orbyva)

  ao invéw de visita, troque por 'Evento' pode ser tanto uma visita a um lugar, museu, ou também
  pode ser tipo um concerto, um encontro, algo assim
commits:
pr:
---

# 257 — Assets já na criação do evento

Depende de: 256 (o formulário e os rótulos já falam "evento").

## Contexto

A feature 102 deu assets (arquivos e links) às linhas do roteiro, mas **só depois de salvas**: o
upload precisa de `activity_id`, e em modo `create` ele ainda não existe. A decisão registrada lá foi
explícita — "botão no card + diálogo próprio, não campo no formulário de edição", porque "um campo de
arquivo dentro do `TripEditActivityDialog` em modo `create` não teria onde gravar".

O resultado prático é um fluxo em dois tempos: criar o evento, fechar o diálogo, achar o card, clicar
no clipe, anexar. Quem está cadastrando o show com o ingresso em PDF na mão tem os dois na cabeça ao
mesmo tempo — e o app obriga a separar.

Esta feature tira o obstáculo sem mentir sobre ele: o formulário passa a **acumular rascunhos** de
asset, e quem grava é o salvamento, depois que a atividade existe e tem id.

## Decisões

- **Rascunho em memória, gravação depois do insert.** O que o formulário guarda não é um asset: é
  um `ActivityAssetDraft` — o `File` escolhido ou a URL digitada, mais o rótulo. Nada vai ao bucket
  enquanto o evento não existir. É o que permite cancelar o formulário sem deixar arquivo órfão no
  storage e sem linha pendurada em atividade nenhuma.
- **A seção só aparece em modo `create`.** Em modo `edit` a atividade já tem id e já tem o caminho
  completo (o clipe no card abre o `TripActivityAssetsDialog`, com abrir, renomear e excluir).
  Repetir uma segunda lista dentro do formulário criaria duas fontes da verdade para a mesma coleção
  — e a do formulário seria a pior das duas, porque não sabe abrir nem excluir.
- **Validação do link acontece no rascunho, não na gravação.** `normalizeAssetUrl` (feature 102) roda
  na hora de adicionar à lista, e a recusa aparece no campo. Descobrir no "Salvar" que o link estava
  torto seria descobrir junto com o evento já criado.
- **O teto de 10 MB sai do diálogo para o domínio.** `MAX_ACTIVITY_ASSET_BYTES` passa a morar em
  `domain/travel/activityAssets.ts`, usado pelos dois caminhos. Duas constantes iguais em arquivos
  diferentes é como um dos dois fica para trás.
- **Gravar os rascunhos nunca desfaz o evento.** `createActivityAssetDrafts` grava um por um, na
  ordem, e devolve `{ created, failed }`. O que subiu entra no card; o que falhou vira um toast
  nomeando os arquivos. O evento criado **fica** — apagá-lo porque um PDF de 11 MB falhou destruiria
  o que o usuário realmente pediu para criar.
- **A ordem de gravação é a ordem da lista**, e cada insert recebe os já criados como `existing`, que
  é o que `nextAssetPosition` usa. Sem isso, todos nasceriam com `position` 0 e a ordem na tela
  passaria a depender do banco.
- **Deslocamento ganha a mesma seção.** O formulário é o mesmo componente e o pedido-mãe da 102 já
  valia para os dois ("tanto em um lugar quanto um deslocamento"); negar o rascunho ao deslocamento
  seria uma assimetria nova, não uma economia.

## Tarefas

- [ ] `src/domain/travel/activityAssetDrafts.ts` (puro): tipo `ActivityAssetDraft`, `fileDraft`,
      `linkDraft` (usando `normalizeAssetUrl`), `draftDisplayLabel`, `rejectOversizedFiles` e
      `MAX_ACTIVITY_ASSET_BYTES` reexportado do módulo de assets
- [ ] Testes Vitest do domínio: rótulo com e sem nome; link normalizado (`tap.pt` → `https://tap.pt`)
      e recusado (`ftp://`, vazio); arquivo acima do teto separado dos aceitos
- [ ] `createActivityAssetDrafts` em `src/api/travel/activityAssets.ts`: grava na ordem, encadeia
      `existing`, devolve `{ created, failed }` sem lançar quando um item falha
- [ ] Teste da API com Supabase mockado: dois rascunhos viram duas linhas com `position` 0 e 1; falha
      no primeiro não impede o segundo e aparece em `failed`
- [ ] `ActivityAssetDraftsField.tsx`: botão "Anexar arquivo", campo de link + rótulo, lista dos
      rascunhos com remover, recusa de link no próprio campo
- [ ] `ActivityForm.asset_drafts` no `TripEditActivityDialog` + a seção "Assets" só em `create`
- [ ] `TripDetail.handleSaveActivity`: depois do `createItineraryActivity`, grava os rascunhos,
      anexa `assets` à atividade no estado e avisa o que falhou
- [ ] Teste de componente: no diálogo de criar, adicionar um link e um arquivo mostra os dois na
      lista e o `onSave` recebe os dois rascunhos; em modo `edit` a seção não existe
- [ ] Verificação: `npx tsc --noEmit -p tsconfig.app.json`, `npx eslint` nos arquivos tocados,
      `npx vitest run` nos testes de viagem

## Como testar

1. **Pré-requisitos**
   - As migrations da feature 102 aplicadas no banco remoto (`trip_activity_asset` + bucket
     `trip-assets`). Sem elas o anexo falha na gravação e o toast de falha aparece — a feature não
     tem migration própria.
   - Logado como membro de uma viagem com pelo menos um dia de roteiro.
2. **Verificação automatizada**
   - `npx vitest run src/domain/travel/__tests__/activityAssetDrafts.test.ts src/api/__tests__/tripActivityAssets.test.ts src/pages/admin/travel/components/__tests__/ActivityAssetDrafts.test.tsx`
     — passa.
   - `npx tsc --noEmit -p tsconfig.app.json` — sem erro.
3. **Verificação manual**
   1. `/travel/<id>` → Roteiro → **Adicionar evento**. A seção **Assets** está no formulário.
   2. "Anexar arquivo" → escolher um PDF: ele entra na lista como rascunho, com o nome do arquivo.
      Nada foi enviado ainda (a aba Rede não mostra upload).
   3. Digitar `tap.pt` no campo de link e adicionar: entra como `https://tap.pt`.
   4. Remover um dos rascunhos (ícone de lixeira): sai da lista.
   5. **Adicionar** → o evento aparece no dia e o clipe do card já mostra **2**. Abrir o clipe: os
      dois assets estão lá, na ordem em que foram adicionados.
   6. Repetir em **Adicionar deslocamento**: a mesma seção existe.
   7. Abrir o formulário de **edição** de um evento: a seção de rascunhos **não** aparece (lá quem
      manda é o clipe do card).
4. **Casos de borda**
   - Cancelar o formulário com rascunhos na lista: nada é gravado e nada sobra no bucket.
   - Link `ftp://x` → recusa no próprio campo, sem entrar na lista.
   - Arquivo acima de 10 MB → recusado na hora de escolher, com o nome do arquivo na mensagem.
   - Criar sem título → a validação do título continua barrando antes de qualquer upload.
5. **Sinais de que quebrou**
   - Upload acontecendo enquanto o formulário ainda está aberto: o rascunho virou gravação direta.
   - Contador do card em 0 depois de criar com anexos: a lista gravada não voltou para o estado do
     `TripDetail`.
   - Evento sumindo quando um anexo falha: a gravação dos rascunhos passou a derrubar a criação.
