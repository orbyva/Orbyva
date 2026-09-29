# Orb no mobile + favicon transparente (design)

**Data:** 2026-09-25  
**Escopo aprovado:** A (tela cheia `/orb`, sem dock/FAB/tray)  
**Abordagem aprovada:** 1 (cliente nativo fino)

## Objetivo

Levar a Orb (chat com stream SSE + confirmação de criação) ao app Expo em `mobile/`, com o mesmo backend (`orb-agent`). Em paralelo, trocar o mark/favicon com fundo branco por PNG com alpha, para não aparecer o quadrado branco em UI escura.

## Contexto

- Web: `/orb` + `OrbProvider` acima do `Outlet` + dock na sidebar (features 098–100). Edge `orb-agent` já em produção.
- Mobile (098): módulos portados, sidebar hamburger, sem Orb; CORS já aceita client `mobile`.
- Favicon web hoje: `index.html` aponta para `/logo-mark.webp` (RGB, **sem alpha**). `logo-mark.png` idem. `logo-mark-sky.png` tem alpha mas crop diferente. Favicon/ícone Expo em `mobile/assets` ainda são defaults do template.

## Arquitetura

1. Rota `mobile/src/app/(app)/orb.tsx` registrada no `Stack` do `(app)/_layout.tsx`.
2. Item **Orb** em Início (`mobile/src/lib/nav.ts` + sidebar).
3. `OrbProvider` no root do `(app)` (acima do `Stack`). Na v1 só a tela `/orb` consome o contexto; provider no root prepara fatia 2 (navegação) sem remontar a conversa.
4. Camada fina:
   - `mobile/src/api/orb.ts` — `POST …/functions/v1/orb-agent` com JWT + SSE
   - `mobile/src/domain/orb/stream.ts` — parser puro (espelho do web)
   - `mobile/src/types/orb.ts` — tipos do stream/mensagens
   - `mobile/src/hooks/useOrbChat.ts` + `useOrb.tsx` — estado da conversa e propostas
   - `mobile/src/api/orbActions.ts` — `executeOrbProposal` via APIs já existentes em `mobile/src/api/*`
5. UI nativa em `mobile/src/components/orb/*` (não portar JSX web/Radix).
6. Favicon/mark: regenerar PNG quadrado com alpha a partir do mark Orbyva; atualizar `index.html` e assets web/mobile de marca.

Sem migration. Sem mudança na Edge além do que já atende o client mobile. Sem pacote compartilhado web↔mobile nesta fatia (decisão 098).

## UI (tela `/orb`)

Coluna em altura útil (header Stack + safe area):

| Zona | Conteúdo |
|------|----------|
| Lista | `FlatList` (scroll ao fim): bolhas user/assistant, markdown leve (`MarkdownPreview` se servir), cartões de tool, cartão de proposta (Criar/Descartar), clarify |
| Composer | Fixo embaixo: multilinha, enviar, cancelar stream |
| Empty | Frase curta + chips de sugestão locais; mark pequeno opcional — sem painel “O que eu sei” completo |
| Chrome | Quick Add FAB **escondido** em `/orb` (como forms) |

Sem `OrbSphere` obrigatória. Tema via tokens existentes.

## Dados / stream / criação

### Stream

- Mesmo contrato SSE do web (`text` / `tool` / `done` / `error`).
- Preferência: `fetch` + `getReader`. Se o runtime Expo não streamar, fallback: buffer até fechar + parse (documentado); parser unitário cobre os dois.
- Histórico só em memória na sessão do app (igual P0 web).

### `open_screen` (v1)

- Não navega. Tool card / linha no balão: “Abrir tela ainda não disponível no app.”

### `propose_create`

- Sanitizar com a whitelist de `supabase/functions/_shared/orb/actions.ts` (import Metro do shared puro se possível; senão cópia tipada mínima).
- `executeOrbProposal` mobile só chama APIs nativas já portadas. Tipos cobertos na v1 (paridade com APIs mobile):
  - produtividade: `task`, `note`, `shopping_item`, `project`, `event`
  - finanças: `transaction`, `recurring`, `budget`, `finance_type`, `finance_class`, `budget_delete`, `budget_replicate`, `recurring_payment`, `recurring_quit`
  - vida: `habit_checkin`, `habit_create`, `goal_update`, `place_visit`, `vehicle_create`, `fuel_log`, `maintenance`, `trip`, `trip_expense`, `trip_activity` (e day_plan se a API mobile já existir)
  - conteúdo/saúde: `movie_mark`, `book_progress`, `series_episode`, `album_wishlist`, `medication_create`, `consultation_create` — **só se** o módulo mobile já expuser create/update equivalente; senão erro explícito no cartão
- Tipo sem API nativa → `error` no cartão (“esse tipo só no web por enquanto”), sem `insert` paralelo.
- Estado da proposta no provider (`idle` / `saving` / `done` / `error`); UI só no balão — sem tray global.

## Erros

- Sessão ausente: mensagem clara (“Entre de novo…”).
- Falha/abort de stream: balão de erro + “Tentar de novo”; cancelamento → “Resposta interrompida.”
- Tool `ok: false`: cartão em error; texto da Orb segue.
- Confirmação: `saving` → `done` (frase curta) ou `error` (motivo).
- Sem retry silencioso em loop.

## Favicon / marca

1. Gerar `public/logo-mark.png` (e opcionalmente `.webp`) **com canal alpha**: fundo removido (near-white → transparente), mark centralizado em canvas quadrado.
2. `index.html`: `rel="icon"` → PNG transparente (não webp opaco).
3. Alinhar `mobile/assets/images/favicon.png` e, se fizer sentido no mesmo PR, `icon.png` / mark usados no BrandLogo — sem deixar o default Expo chevron se o pedido cobrir “favicon e tal”.
4. Verificação: corners do PNG com alpha 0; mark visível no centro.

## Fora de escopo (v1)

- Dock lateral, FAB da Orb, tray global de propostas
- Mapa `open_screen` → rotas Expo
- Persistência `orb_threads` / mensagens no Postgres
- WebView da `/orb` web
- Extrair monorepo `packages/orb`
- Push / billing in-app ligados à Orb

## Testes / verificação

Chrome/automação de browser **não** entra (regra do repo). Prova por código:

1. **Parser SSE** — Vitest em `mobile` (adicionar vitest mínimo) ou na raiz apontando `mobile/src/domain/orb/__tests__/stream.test.ts`: chunk partido, flush, eventos inválidos.
2. **Redutor do chat** — testes do `useOrbChat` (ou função pura extraída): tool start/done, abort, erro de sessão, navegação vira aviso sem router.
3. **Propostas** — 1–2 casos de `executeOrbProposal` com APIs mockadas (ex.: task + tipo sem suporte).
4. **Favicon** — assert de imagem (script/magick ou teste): corners transparentes.
5. **`npx tsc --noEmit`** em `mobile/` verde.

`tsc`/lint sozinhos **não** bastam para declarar a Orb pronta.

## Fatia 2

- [x] Navegação nativa `open_screen` (mapa web→Expo)
- [x] Acesso rápido: `OrbAccessFab`
- [x] Tray de propostas fora da `/orb` (necessário após navegar)


## Critério de pronto

- Sidebar Início → Orb abre chat nativo, stream visível, cancelar funciona.
- Proposta de criação suportada: Criar grava pelos mesmos caminhos dos forms mobile; Descartar limpa o cartão.
- `open_screen` não troca de tela; aviso visível.
- Favicon/mark sem quadrado branco em fundo escuro.
- Testes acima verdes.
