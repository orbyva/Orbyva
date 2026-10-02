---
prompt: |-
  E faça isso no mobile:
  [...]
  Lugares
  - Opiniões e avaliações de lugares (upsertPlaceOpinion, mostradas em PlaceCard e PlaceDetailDialog).
    O mobile não tem.
---

# 196 — Opiniões de lugares de viagem no mobile

## Contexto
- Na web, cada membro de uma viagem compartilhada dá a própria opinião sobre um lugar da viagem
  (`trip_place_opinion`: nota, comentário, recomenda); o detalhe mostra a média do grupo e a opinião
  de cada um, e o card mostra "N opiniões".
- O mobile não lia nem gravava `trip_place_opinion`: só a nota/comentário da linha do lugar.

## Decisões
- Mesma API da web, portada para `mobile/src/api/places/places.ts`: `fetchPlaceOpinions` (fallback
  para a linha do autor quando não há opinião gravada ou a tabela não existe; nome vindo de
  `trip_member`), `upsertPlaceOpinion` (só lugar de viagem, `assertTripAccess` antes, conflito
  `place_visit_id,user_id`), `enrichPlacesWithOpinions`.
- Criar/editar um lugar de viagem visitado também grava a opinião do autor, como a web.
- Detalhe: card "Opiniões da viagem" (resumo + opinião de cada membro + "Sua opinião" editável), só
  para lugares com `trip_id`. Lista: "4,3★ 3 opiniões" quando há mais de uma opinião.

## Tarefas
- [x] `mobile/src/types/places.ts`: `PlaceOpinionSummary`, `TripPlaceOpinion`, `opinionSummary`.
- [x] `mobile/src/domain/places/index.ts`: `summarizePlaceOpinions` + teste
  (`domain/places/__tests__/opinions.test.ts`).
- [x] `mobile/src/api/places/places.ts`: funções de opinião + gravação ao criar/editar.
- [x] `mobile/src/api/__tests__/placeOpinions.test.ts`: fallback do autor, tabela ausente, nomes dos
  membros, upsert com acesso checado e conflito certo, lugar fora de viagem recusado.
- [x] `mobile/src/components/places/PlaceOpinionsCard.tsx` montado em `places/[id].tsx`; resumo na
  lista `places/index.tsx`.
- [x] `npx tsc --noEmit` e `npx vitest run` no `mobile/`.

## Como testar
1. `cd mobile && npx vitest run src/api/__tests__/placeOpinions.test.ts src/domain/places` — 7 testes.
2. No app, abrir um lugar ligado a uma viagem compartilhada → "Opiniões da viagem" mostra a opinião
   de cada membro; dar 5★ em "Sua opinião" e salvar → na web o `PlaceDetailDialog` do mesmo lugar
   mostra a opinião nova e a média do grupo muda.
