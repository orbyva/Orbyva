---
prompt: |
  Imagine que vc tem diversos lugares em Paris salvos para visitar.
  E um dia você começa planejar uma EuroTour e em determinados dias você estará em Paris. Seria muito interessante, que nesses casos mostrar algo tipo, "Você salvou um lugar em Paris. Deseja adicionar no seu roteiro?" O que acha?

  Gostei muito. Faça isso

  Pode aplicar esse caso de uso. Faça primeiro web. Vou testar, se tiver bom vamos replicar para o mobile
---

# 100 — Sugerir lugares salvos no roteiro

## Contexto

Lugares `to_visit` sem viagem e o roteiro de uma EuroTour existem, mas não se cruzam: o usuário
guarda um museu em Paris meses antes, depois planeja paradas em Paris, e o app não lembra. A ponte
é um bloco por cidade no roteiro web, não um aviso por lugar.

## Decisões

- **Web primeiro, mobile depois do teste.** O usuário validou o web (2026-09-21) e pediu
  replicar no nativo.
- **Por cidade, não por dia.** Nos dias em que a parada é Paris, um bloco: “Você tem N lugares
  salvos em Paris”, lista curta, Adicionar neste dia. Arrastar para o dia também vale (o roteiro
  já tem drag).
- **Só o que ainda não está no roteiro.** `to_visit`, sem `trip_id` **ou** já na aba Lugares desta
  viagem, mas ainda sem atividade. Lugar visitado, lugar de outra viagem, e GPS ao vivo ficam de
  fora.
- **Match por mapa.** Lat/lng da parada + raio (~40 km). Sem coordenadas no lugar ou na parada, não
  sugere. Nome da cidade não é critério.
- **Dispensar é por cidade nesta viagem**, sem migration. Web: `localStorage`. Mobile:
  `secureStoreAdapter` (SecureStore / localStorage no Expo web). Não sincroniza entre
  aparelhos — persistir no banco fica para se isso virar problema.
- **Adicionar** cria a visita no dia, vincula `place_visit_id` e, se o lugar ainda não tinha
  `trip_id`, grava o desta viagem.

## Tarefas

- [x] Domínio puro: âncora do dia, raio, elegibilidade, dismiss por geo, copy do título. Testes
      Vitest. Verificação: `npx vitest run src/domain/travel/__tests__/savedPlaceSuggestions.test.ts`
      (10 testes, passou)
- [x] API: buscar `to_visit` sem viagem com coordenadas. Verificação: `npm run build`
- [x] Roteiro web: bloco no dia, adicionar, arrastar, dispensar. Verificação: `npm run build && npm run lint`
- [x] Conferir `prompt:` + web-only (nada em `mobile/`). Verificação: `npm run build && npm run lint`
      (vale para o recorte web; o mobile entra nas tarefas abaixo)
- [x] Mobile: copiar domínio + buscar candidatos + bloco no roteiro (adicionar neste dia,
      arrastar para o dia, dispensar a cidade). Verificação: `npx tsc --noEmit` em `mobile/`

## Prompts

- 2026-09-20 — "Imagine que vc tem diversos lugares em Paris salvos para visitar. E um dia você começa planejar uma EuroTour e em determinados dias você estará em Paris. Seria muito interessante, que nesses casos mostrar algo tipo, \"Você salvou um lugar em Paris. Deseja adicionar no seu roteiro?\" O que acha?"
- 2026-09-20 — "Gostei muito. Faça isso"
- 2026-09-20 — "Pode aplicar esse caso de uso. Faça primeiro web. Vou testar, se tiver bom vamos replicar para o mobile"
- 2026-09-21 — "Ficou muito bom. Replique para o Mobile"

## Notas

- Web validado pelo usuário em 2026-09-21; mobile replicado na sessão seguinte.
- Dismiss não cruza web ↔ aparelho: web usa `localStorage`, mobile usa SecureStore
  (`orbyva:saved-place-suggestions-dismissed:<tripId>`). Sem migration de propósito.
- Arraste no mobile: long-press no punho (mesmo `VisitDragHandle` das visitas) e soltar no
  card do dia.
- Sem conferência no simulador desta sessão.
