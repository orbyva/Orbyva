# Orb P0 — Entretenimento (spec de execução)

Recorte do `architecture.md`/`brainstorm.md` decidido com o usuário: LLM Anthropic Claude, UI em sheet flutuante global, escopo restrito a Cinema/Livros/Música. Plano completo: ver histórico da conversa (arquivo de plano `stateful-enchanting-hickey.md`).

Sem `orb_usage`/cota nesta fase. Edge Function nunca escreve nas tabelas de domínio — só gera `orb_proposal`; a escrita real é client-side via `src/api/*` após confirmação.

## Tarefas

- [x] `src/types/orb.ts` — contrato `OrbAgentRequest`/`OrbAgentResponse`/proposal/suggested_actions — commit: _(pendente)_
- [x] `src/api/books.ts` — `upsertBook` — commit: _(pendente)_
- [x] `src/api/albums.ts` — `fetchAlbumById` + `upsertAlbum` — commit: _(pendente)_
- [x] `src/domain/orb/mergeEntertainment.ts` + Vitest (9 testes) — commit: _(pendente)_
- [x] `src/domain/orb/proposalSummary.ts` + Vitest (4 testes) — commit: _(pendente)_
- [x] `src/domain/orb/suggestedActions.ts` + Vitest (4 testes) — commit: _(pendente)_
- [x] `supabase/migrations/20260819120000_orb_agent.sql` — `orb_thread`/`orb_message`/`orb_proposal` + RLS (escrita local, não aplicada no banco) — commit: _(pendente)_
- [x] `supabase/functions/orb-agent/*` (index, prompt, catalog/{tmdb,omdb,googleBooks,music}, tools/registry, tools/entertainment/{movies,books,albums}, tools/query, tools/clarify, tools/suggestions, context/bootstrap, proposals, summary, types) — commit: _(pendente)_
- [x] `src/api/orb.ts` — commit: _(pendente)_
- [x] `src/hooks/useOrbChat.ts` + `src/hooks/useOrb.tsx` — commit: _(pendente)_
- [x] `src/components/orb/*` (OrbFab, OrbSheet, OrbChat, OrbActionCard, OrbClarify, OrbSuggestedActions) — commit: _(pendente)_
- [x] `src/layouts/AdminLayout.tsx` — inserir Orb no shell — commit: _(pendente)_
- [x] `tsc -b`, `npm run lint`, `npm run test` (394 testes) e `npm run build` verdes — `npm run ci:local` completo não rodado (Lighthouse/e2e fora de escopo desta iteração; `scripts/minify-sw.mjs` tem um bug de path pré-existente no Windows, não relacionado ao Orb) — commit: _(pendente)_
- [x] `README.md` / `.cursor/ARCHITECTURE.md` atualizados — commit: _(pendente)_

## Exige aprovação separada (não fazer sem perguntar)

- [ ] `supabase db push` da migration `orb_agent` no banco remoto
- [ ] Secrets Supabase: `ANTHROPIC_API_KEY`, `TMDB_API_KEY`, `OMDB_API_KEY`, `GOOGLE_BOOKS_API_KEY`
- [ ] `supabase functions deploy orb-agent`

## Achado fora de escopo (corrigido)

- ~~`enforce_app_access` cobre `movie` mas não `book`/`album`~~ — **falso positivo do levantamento inicial.** `book` e `album` também têm o trigger `trg_enforce_app_access`, só que anexado nas próprias migrations de criação (`20260728120000_books.sql:107-112`, `20260728160000_albums.sql:149-154`), não na lista de `20260723120000_app_access_enforce.sql` (essas tabelas ainda não existiam quando ela rodou). Gate trial/Pro no banco cobre os 3 módulos de Entretenimento normalmente. Nenhuma ação necessária.
