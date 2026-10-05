---
prompt: |-
  Pedido do usuário, verbatim (05/10/26) — ver o pedido completo no frontmatter da 250.

  Fatia desta feature: "Anexos nas atividades (arquivo e link)".
---

# 254 — Mobile: anexos nas atividades da viagem

## Contexto
- Web: `TripActivityAssetsDialog.tsx` + `src/api/travel/activityAssets.ts` (listar, subir arquivo,
  adicionar link, renomear, excluir, URL assinada).
- Mobile: roteiro em `travel/[id].tsx` sem anexos.

## Decisões
- Mesma tabela e mesmo bucket do web; upload de imagem pelo `expo-image-picker` (já instalado) e
  de documento pelo `expo-document-picker` se precisar de dependência nova — confirmar com o
  usuário antes de instalar.
- Abrir anexo: URL assinada no navegador do sistema.

## Tarefas
- [x] API mobile espelho de `activityAssets.ts` + teste.
- [x] Sheet "Anexos" na atividade do roteiro: lista, abrir, adicionar link, subir foto,
      renomear, excluir.
- [x] Subir documento (PDF etc.) via `expo-document-picker` (dependência autorizada pelo usuário).
- [x] Contador de anexos na atividade.

## Prompts
- 05/10/26 — resposta do usuário à pergunta sobre a dependência: "Sim, instalar e concluir a 254".

## Notas
- Bucket privado e mesmas regras do web (caminho `{trip}/{atividade}/{uuid}.ext`, arquivo apagado
  antes da linha, URL assinada de 5 min, `download` fora de pdf/imagem). Domínio copiado do web
  com o teste do web.
- Foto e documento sobem via `fetch(uri).arrayBuffer()`; documento escolhido com
  `expo-document-picker` (~57.0.3, instalado com `npx expo install`). Exige novo build nativo.
- Mime ausente sobe como `application/octet-stream` e abre como download (regra do web).
- Qualquer membro da viagem edita anexos (RLS `is_trip_member`), como no web.

## Como testar

1. **Automatizado**: `cd mobile && npx vitest run --config ./vitest.config.ts activityAssets`.
2. **Manual**: Viagem → roteiro → atividade → Anexos → adicionar link → aparece e abre; subir uma
   foto → aparece e abre; subir um PDF → aparece e abre; renomear e excluir. Conferir no web que os anexos aparecem.
