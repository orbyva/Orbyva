# Melhorias — Viagens: clima + roupa

Referência de UX: app **Weat** (clima → o que vestir / o que levar).
Stack: **Google Places Autocomplete (New)** + **Routes** + **Weather** (via Edge `places-catalog`).
Destino precisa de **lat/lng** (resolvidos via Routes `endLocation` ao escolher no autocomplete).

---

## V1 — útil sem virar app meteorológico

### Pré-requisito
- [x] Destino da viagem com coordenadas (Places Autocomplete + resolve via Routes)
- [x] Busca de lugares via Google Places (sem Geoapify)

### Destino / mala
- [x] Com destino + datas: resumo climático do período (máx/mín, chuva)
- [x] Sugestão agregada do que **levar na mala** (PT-BR, regras simples)

### Roteiro / dia
- [x] Em cada dia: condição + máx/mín + sugestão do que vestir

### Técnico V1
- [x] Edge Function proxy (Places / Routes / Weather; chaves só no servidor)
- [x] Cache: rotas 10 min · clima atual 15 min · previsão diária 1 h
- [x] Cotas mensais fail-closed (Places / Routes Essentials+Pro / Weather)
- [x] Clima mundial via coords

---

## V2 — nível Weat

- [x] Atributos de peça: tecido, espessura, comprimento
- [x] Faixas **hora a hora** (o que vestir / temperatura ao longo do dia)
- [x] Diferenciar dia vs noite na sugestão
- [x] Ícones de tipologias de roupa (camiseta, regata, casaco, etc.)
- [x] Refinar regras (vento, umidade, “feels like”)

### Técnico V2
- [x] Edge `weather_hourly` (Google `forecast/hours`, cache 30 min)
- [x] Diário com `daytime` / `nighttime` normalizados
- [x] Domínio `clothing.ts` V2 + UI no roteiro / mala

---

## Destino multi-cidade

- [x] Autocomplete do destino filtrado: país / estado / cidade (`includedPrimaryTypes`)
- [x] Tabela `trip_stop` (paradas com datas)
- [x] Form da viagem: várias paradas (eurotrip)
- [x] Clima/mala agregado por parada; roteiro usa a parada do dia
- [x] Share de clima: 1 daily + 1 hourly por cidade no detalhe (`TripWeatherProvider`)

---

## UX card do dia (altura)

- [x] Clima colapsável: 1–2 linhas de resumo; detalhe ao expandir; **hoje** começa aberto
- [x] Outfit em linha compacta (`algodão · fina`) em vez de tabela de atributos
- [x] Popover nos slots hora a hora (mobile-friendly)
- [x] Hoje: outfit pela janela restante (agora → fim do dia) + rótulo da janela
- [x] Rotas compactas: modalidade recomendada no resumo; demais ao expandir (só no dia do roteiro)
