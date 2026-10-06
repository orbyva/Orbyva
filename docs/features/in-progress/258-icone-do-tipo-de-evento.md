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

# 258 — Ícone personalizado por tipo de evento

Depende de: 256 (o vocabulário "evento") e 257 (as duas tocam o mesmo formulário).

## Contexto

O ícone de uma linha do roteiro é escolhido pelo **tipo** (`TripActivityCategory`, o mesmo conjunto
de `PlaceType` mais `transport`) e resolvido por `PLACE_TYPE_META` → `PlaceTypeIcon`: nove ícones
lucide fixos em código. Um concerto, um encontro, uma peça — tudo cai em "Passeio" ou "Outro", e
desenha câmera ou alfinete.

O app já tem a peça que resolve isso: a **biblioteca de ícones** da feature 086 (`icon_asset` +
`AssetLibrary` + `TaskIconPicker`), onde o usuário envia imagem ou cola SVG e reusa onde quiser. Hoje
ela serve tarefas (`task.icon_url`) e regras de link (`link_icon_rule`, feature 087). Falta o tipo do
evento.

## Decisões

- **O ícone é do tipo, não do evento.** O usuário escolhe uma vez para "Museu" e todo evento de museu
  passa a desenhar aquilo. É o que o pedido diz ("personalizar os **tipos** do evento") e é o que
  evita a pergunta seguinte: ícone por evento viraria mais um campo em `trip_itinerary_activity`,
  preenchido um a um.
- **Tabela por usuário, uma linha por tipo:** `event_type_icon` (`user_id`, `category`, `icon_key`,
  `icon_url`), `unique (user_id, category)` — mesmo molde de `link_icon_rule` (feature 087), inclusive
  o par `icon_key`/`icon_url` mutuamente exclusivo. Não é `jsonb` numa coluna de preferências porque
  cada tipo é escrito e apagado sozinho, com RLS por linha.
- **Guarda a URL, não o id do `icon_asset`.** Exatamente como a 087 decidiu: tirar o ícone da
  biblioteca não pode apagar o ícone do tipo.
- **Preset lucide continua valendo.** O seletor reusado é o `TaskIconPicker`, que já oferece os
  presets **e** a biblioteca (com "enviar imagem" e "colar SVG" de graça). Aceitar só `icon_url`
  seria tirar uma capacidade que o componente já tem, sem ganhar nada.
- **Deslocamento fica de fora.** "Deslocamento" não é um tipo de evento — é a outra metade da linha, e
  o ícone dele é o modo de transporte (avião, trem, carro). Personalizar ali seria personalizar outra
  coisa com o mesmo botão.
- **O seletor mora ao lado do campo "Tipo", no próprio formulário do evento.** É onde o usuário está
  quando pensa no tipo; uma tela de configuração separada obrigaria a sair do formulário. O rótulo diz
  de quem é o ícone ("Ícone do tipo Museu") e a dica diz o alcance ("Vale para todos os eventos deste
  tipo") — sem isso o seletor seria lido como "ícone deste evento", que é o que ele não é.
- **Grava na hora, não no "Salvar" do formulário.** O ícone do tipo é configuração do usuário, não
  campo do evento: cancelar o formulário não pode desfazê-lo, e salvar o evento não é o que o
  confirma. Mesmo contrato do `TaskIconPicker` na tela de regras.
- **Cache no módulo, como `useLinkIconRules`.** O ícone é lido por toda linha do roteiro; uma consulta
  por card seria absurda para uma tabela que muda raramente. Falha de carga resolve para "sem
  personalização" (o ícone padrão desenha) e a tela continua de pé; a tela de escrita invalida.
- **Degradação quando a tabela não existe.** Entre o deploy e o `supabase db push` há uma janela;
  nela `fetchEventTypeIcons` devolve `{}` em vez de derrubar o roteiro — o mesmo `isMissingSchema`
  que a 102 já usa para `trip_activity_asset`.
- **Fora de escopo:** criar tipos novos (o conjunto continua sendo o de `PlaceType`), cor
  personalizada por tipo (o tom de `PLACE_TYPE_META` continua mandando) e o app nativo.

## Tarefas

- [x] Migration `event_type_icon`: tabela, `unique (user_id, category)`, índice, comentários, RLS nas
      4 operações, `grant`, entrada em `wipe_own_data` e trigger `enforce_app_access`
- [x] `supabase/tests/event_type_icon/` (stubs, seed, assert de schema, assert de comportamento,
      `run.sh`) no molde de `supabase/tests/icon_asset/`
- [x] Tipo `EventTypeIcon` em `src/types/travel.ts`
- [x] `src/domain/travel/eventTypes.ts` (puro): `EVENT_TYPE_CATEGORIES` (tudo menos `transport`),
      `isEventTypeCategory`, `eventTypeIconFor(map, category)` + testes Vitest
- [x] `src/api/travel/eventTypeIcons.ts`: `fetchEventTypeIcons`, `setEventTypeIcon` (upsert),
      `clearEventTypeIcon`, com degradação de schema ausente + teste com Supabase mockado
- [x] `src/hooks/useEventTypeIcons.ts`: cache no módulo + `invalidateEventTypeIcons`
- [x] `src/components/EventTypeIcon.tsx`: personalizado (`<img>` da URL ou preset lucide) com queda
      para `PlaceTypeIcon`
- [x] `EventTypeIconPicker` no `TripEditActivityDialog`, ao lado do campo "Tipo" (fora de
      `transport`), gravando na hora e invalidando o cache
- [x] `TripItineraryTab`: o card do evento desenha `EventTypeIcon`
- [x] Teste de componente: tipo com ícone personalizado desenha a imagem no card; sem personalização
      desenha o ícone padrão; escolher um ícone no formulário grava para o tipo (e não para o evento)
- [x] Verificação: `npx tsc --noEmit -p tsconfig.app.json`, `npx eslint` nos arquivos tocados,
      `npx vitest run` nos testes de viagem

## Prompts

- 2026-10-06 — "crie implemente e faça o push das seguintes features, no need for planning: … -
  poder personalizar os tipos do evento, adicionando um ícone (da biblioteca de ícones gerais do
  orbyva)"

## Notas

- **O tipo da linha do banco virou `EventTypeIconRow`**, e não `EventTypeIcon`, porque
  `EventTypeIcon` é o **componente** que desenha. Dois significados para o mesmo nome em módulos
  diferentes é exatamente o tipo de ambiguidade que se paga meses depois.
- **O hook é chamado por bloco de dia, não por card.** `useEventTypeIcons` tem cache no módulo
  (como `useLinkIconRules`, que roda por chip de link), então chamá-lo em `DayBlock` custa uma
  assinatura e zero consultas extras — e evita furar vinte props até o card. O `EventTypeIcon`
  continua recebendo o mapa pronto, para nenhum outro consumidor nascer com hook escondido.
- **A prévia à esquerda do seletor mostra o que o card vai desenhar** — com personalização ou com o
  ícone padrão. Sem ela, o "+i" do gatilho pareceria dizer que o tipo não tem ícone nenhum hoje, o
  que é falso: tem o padrão.
- **`setEventTypeIcon` zera `icon_key` quando recebe `icon_url`**, mesmo que quem chame mande os
  dois. A regra não podia depender do chamador: o `check` do banco recusaria, mas a mensagem de lá
  não diz o que corrigir, e uma tela nova reabriria o buraco.
- **Nenhum `check` de categoria contra a lista de tipos.** A coluna é texto livre e o catálogo mora
  no cliente (`EVENT_TYPE_CATEGORIES`): um `check` com a lista obrigaria migration a cada tipo novo,
  e o que protege de verdade é a leitura ignorar categoria desconhecida — travado em
  `indexEventTypeIcons`. Pelo mesmo motivo `transport` não é barrado no banco: ele é escopo de
  interface, não integridade de dado.
- **Os testes SQL foram escritos mas não executados: o Docker não está rodando nesta máquina**
  (`docker info` falha). O arquivo está completo e no molde de `supabase/tests/link_icon_rule/`;
  rodar `bash supabase/tests/event_type_icon/run.sh` antes do `supabase db push` está em **Como
  testar**, como pré-requisito de ambiente. A migration **não** foi aplicada em banco nenhum.
- **Quebra de propósito conferida**: desligar o ramo de personalização em `EventTypeIcon` derruba 2
  dos 6 testes do arquivo; restaurado, verde. Suíte completa no fim: 364 arquivos / 4032 testes,
  `npm run lint` com 0 erros (30 avisos de `react-refresh` pré-existentes) e `npm run build` verde.

## Como testar

1. **Pré-requisitos**
   - A migration desta feature aplicada no banco remoto (não há Supabase local):
     `20261006120000_event_type_icon.sql`, via `supabase db push` — **banco remoto, confirmar antes
     de rodar**. Sem ela o roteiro continua abrindo, só sem personalização nenhuma.
   - Para os testes SQL: Docker rodando (`docker info` responde). O `run.sh` sobe um Postgres 16
     descartável e **não** toca no banco remoto.
   - Logado num usuário com pelo menos uma viagem com roteiro.
2. **Verificação automatizada**
   - `npx vitest run src/domain/travel/__tests__/eventTypes.test.ts src/api/__tests__/eventTypeIcons.test.ts src/pages/admin/travel/components/__tests__/EventTypeIcon.test.tsx`
     — passa.
   - `bash supabase/tests/event_type_icon/run.sh` → sai 0 (schema, unique, RLS, wipe).
   - `npx tsc --noEmit -p tsconfig.app.json` — sem erro.
3. **Verificação manual**
   1. `/travel/<id>` → Roteiro → **Adicionar evento**. Ao lado do campo **Tipo**, o seletor diz
      "Ícone do tipo <Tipo>".
   2. Abrir o seletor → "Colar SVG" ou "Enviar imagem" → escolher. O ícone aparece no gatilho na
      hora.
   3. **Cancelar** o formulário. Criar outro evento do mesmo tipo: o ícone personalizado continua lá
      (é configuração, não campo do evento).
   4. No roteiro, todo card daquele tipo passa a desenhar o ícone novo — inclusive os antigos.
   5. Trocar o tipo no formulário: o seletor passa a mostrar o ícone do **novo** tipo.
   6. "Remover ícone" no seletor → os cards daquele tipo voltam ao ícone padrão.
   7. Formulário de **deslocamento**: não há seletor de ícone de tipo.
4. **Casos de borda**
   - Excluir o ícone da biblioteca (feature 086): o tipo continua desenhando — a URL é guardada, não
     o id.
   - Migration não aplicada: nenhum seletor grava, nenhum card personaliza, e o roteiro abre normal.
   - Dois tipos com o mesmo ícone: permitido (a unicidade é por tipo, não por ícone).
5. **Sinais de que quebrou**
   - O ícone escolhido vale só para o evento que estava sendo criado → a gravação virou campo do
     formulário.
   - Uma consulta de `event_type_icon` por card no painel de rede → o cache do módulo saiu.
   - Roteiro vazio ou erro ao abrir com a migration ausente → a degradação de schema saiu.
