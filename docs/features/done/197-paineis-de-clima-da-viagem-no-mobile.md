---
prompt: |-
  E faça isso no mobile:
  [...]
  Viagens
  - Painéis de clima da viagem (TripWeatherPanels.tsx). O mobile tem o cliente de clima, mas não esses
    painéis.
---

# 197 — Painéis de clima da viagem no mobile

## Contexto
- Na web, `TripWeatherProvider` busca a previsão diária e horária uma vez por cidade distinta da
  viagem; `TripWeatherPackingPanel` monta a mala com os dias de cada parada dentro do seu período e
  `ItineraryDayWeather` mostra, em cada dia do roteiro, condição, sensação, mín/máx, roupa sugerida
  (por segmento dia/noite) e a faixa hora a hora.
- O mobile já tinha a mesma biblioteca de roupa (`domain/travel/clothing.ts`) e um card "Clima e
  mala", mas consultava só um ponto (o destino) e mostrava os próximos 5 dias — não os dias da
  viagem — e não havia clima nenhum dentro dos dias do roteiro.

## Decisões
- Lógica do provider portada como funções puras em `mobile/src/domain/travel/tripWeather.ts`
  (`tripWeatherStops`, `groupWeatherCities`, `packingDaysForStops`, `weatherDayAt`,
  `weatherHoursAt`) + `mobile/src/lib/tripWeather.ts` (`cityWeatherKey`, `hoursNeededForCityEnd`),
  e o fetch num hook `useTripWeather(stops)` em vez de Context (só uma tela consome).
- "Clima e mala" passa a usar os dias de cada parada (com o nome da parada quando há mais de uma),
  mostra "O que levar na mala" com o resumo e todas as peças (antes cortava em 8). Fora da janela de
  10 dias aparece "Sem previsão para o período da viagem".
- `ItineraryDayWeather` nativo em cada dia do roteiro, aberto por padrão no dia de hoje, como na
  web. Popover de peça da web vira chip com ícone e rótulo (sem hover no app).
- Mapa de ícones de roupa e `weatherIcon` saíram de `travel/[id].tsx` para
  `components/travel/clothingIcons.ts`, compartilhados com o componente novo.

## Tarefas
- [x] `mobile/src/lib/tripWeather.ts` e `mobile/src/domain/travel/tripWeather.ts`.
- [x] `mobile/src/domain/travel/__tests__/tripWeather.test.ts`: paradas com/sem coordenada, fallback
  no destino, agrupamento por cidade, dias da mala por parada (com guarda-chuva/casaco vindos da
  previsão real de chuva/frio), busca de dia/hora por cidade, janela de horas 72–240.
- [x] `mobile/src/hooks/use-trip-weather.ts`.
- [x] `mobile/src/components/travel/ItineraryDayWeather.tsx` + `clothingIcons.ts`.
- [x] `travel/[id].tsx`: card "Clima e mala" por parada e clima em cada dia do roteiro.
- [x] `npx tsc --noEmit` e `npx vitest run` no `mobile/` (57 testes).

## Como testar
1. `cd mobile && npx vitest run src/domain/travel/__tests__/tripWeather.test.ts` — 7 testes.
2. No app, abrir uma viagem que começa nos próximos dias com duas paradas em cidades diferentes
   (ex.: Lisboa e Porto): em Resumo, "Clima e mala" lista só os dias da viagem, cada um com o nome
   da parada, e "O que levar na mala" soma as duas cidades.
3. Aba Roteiro: cada dia tem o bloco "CLIMA · <parada>" com o resumo; tocar abre as peças sugeridas
   e a faixa "Hora a hora"; o dia de hoje já vem aberto. Comparar com o mesmo dia na web.
4. Viagem que começa daqui a mais de 10 dias: o card mostra "Sem previsão para o período da viagem"
   e os dias do roteiro mostram "Sem previsão para este dia".
