---
prompt: |
  Quero colocar a feat do orb no mobile agora. E quero também, que o favicon e tal seja png, ta com a borda branca e ta meio paia
---

# 108 — Orb no mobile + favicon transparente

## Contexto

A Orb existe no web (`/orb` + dock, features 098–100). O app Expo em `mobile/` já cobre os
módulos da sidebar, mas não tinha chat com o `orb-agent`. O mark usado como favicon
(`logo-mark.webp` / `.png`) era RGB sem alpha — quadrado branco em UI escura.

Spec: `docs/superpowers/specs/2026-09-25-orb-mobile-design.md`  
Plan: `docs/superpowers/plans/2026-09-25-orb-mobile.md`

## Decisões

- Escopo A (fase 1): tela cheia `/orb`; depois fase 2: navegação `open_screen` + FAB de acesso + tray.
- Cliente nativo fino; `proposalContract.ts` é cópia local do shared `actions.ts`.
- Favicon: PNG com alpha.
- Fase 2: mapa web→Expo (`navigationMap.ts`); FAB Orb (acima do +); tray de propostas fora de `/orb`.
- Fase 3: cartões de resultado (feature 100), `ask_user`, creates completos, uso/copiar/capacidades.

## Tarefas

### Fase 1
- [x] Favicon/mark transparente + assert script
- [x] Vitest + parser SSE
- [x] `streamOrbTurn` + tipos
- [x] `chatReduce` + `useOrbChat`
- [x] `executeOrbProposal` (subset mobile)
- [x] `OrbProvider` + layout
- [x] UI chat + rota `/orb`
- [x] Nav Início → Orb; quick-add escondido em `/orb`
- [x] Teclado: inset pela altura real do teclado

### Fase 2
- [x] Mapa `open_screen` web → rotas Expo + testes
- [x] `useOrbChat` agenda navegação; provider chama `router.push`
- [x] `OrbAccessFab` (acesso rápido)
- [x] `OrbProposalTray` fora da `/orb`

### Fase 3 — paridade visual / criação
- [x] `results.ts` + `OrbResultView` (cards, carrossel, rows, bars, grouped_bars)
- [x] Tool card compacto (sem dump JSON)
- [x] `ask_user` / `OrbClarifyCard` + reply via `send`
- [x] `executeOrbProposal` com kinds cobertos pelas APIs mobile
- [x] Rodapé de uso/tokens, Copiar, painel “O que eu sei”

## Prompts

- 2026-09-25 — Quero colocar a feat do orb no mobile agora. E quero também, que o favicon e tal seja png, ta com a borda branca e ta meio paia
- 2026-09-25 — Quando clico para escrever no chat, o teclado cobre a parte de enviar e a caixa de texto
- 2026-09-25 — Ta merda ainda (screenshot: teclado ainda cobrindo o composer)
- 2026-09-25 — Aplique a fase 2 agora
- 2026-09-25 — Ta gerando assim, fei demais. Arruma isso. (tool card com JSON cru)
- 2026-09-25 — Sim [porte cartões visuais]. Falta o que agora?
- 2026-09-25 — Faça então os 4 (resultados, clarify, creates, uso/copiar/capacidades)

## Notas

- 05/10/26 — Arquivo estava em `todo/` com todas as tarefas marcadas e o código no ar (commit
  `e375b2d`); movido para `in-progress/` aguardando a conferência do usuário. A feature 208 tirou o
  `OrbAccessFab` da fase 2: a Orb agora é um ícone no header (`HeaderOrbButton`), com o mesmo ponto
  de proposta pendente.
- 2026-10-05 — concluída na limpeza dos `.md` a pedido do usuário ("Pode concluir direto"); conferência no celular fica com o usuário (ver Como testar).

## Como testar

1. `cd mobile && npm test && npx tsc --noEmit`
2. `node scripts/assert-logo-mark-alpha.mjs`
3. Orb: chat + teclado acima do composer
4. Pedir “me mostra as tarefas” / open_screen → app navega (ex.: `/tasks`); cartão diz “Abrindo …”
5. Fora da Orb: FAB com logo Orbyva (acima do +) abre `/orb`
6. Com proposta pendente fora da `/orb`: tray com Criar/Descartar
7. Em `/orb`, quick-add + FAB Orb escondidos
8. Perguntar orçamento → barras agrupadas (não JSON); tocar “ver” no tool card só se quiser lista compacta
9. Quando a Orb perguntar (chips): tocar sugestão envia a resposta
10. Confirmar creates: lançamento, orçamento, viagem, etc.
11. Empty state / botão `?` no header → painel “O que eu sei”; Copiar numa resposta; rodapé de tokens quando o `done` mandar usage
