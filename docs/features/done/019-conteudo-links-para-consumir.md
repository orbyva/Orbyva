# 019 — Conteúdo: links para ler/assistir depois + sites úteis

## Contexto
Hoje o grupo de navegação "Entretenimento" reúne três módulos independentes e espelhados
(Cinema, Livros, Música — `src/pages/admin/movies|books|music/`), cada um com sua própria
tabela, tipos e API. Não existe um lugar para guardar **links** (artigos, vídeos do YouTube,
sites/ferramentas interessantes) com uma fila de "consumir depois" — hoje isso vive espalhado
em abas do navegador ou em nenhum lugar. A ideia é renomear o grupo para "Conteúdo" e
adicionar um módulo novo de links, seguindo o mesmo padrão arquitetural dos três já existentes
(`docs/stack.md` → migration → types → domain → api → página), para no futuro alimentar uma
extensão de Chrome que salva direto do YouTube/Substack — essa extensão **não** faz parte
desta feature, só não pode ser inviabilizada pelo desenho de agora.

## Decisões
- Renomear o grupo de navegação "Entretenimento" → "Conteúdo" em `app-sidebar.tsx`
  (`NAV_ENTRETENIMENTO`), mantendo Cinema/Livros/Música como itens existentes e adicionando um
  quarto item "Links". Repensar o ícone do grupo (`Clapperboard` não cobre mais o escopo) — algo
  como `Bookmark` ou `Link`.
- Módulo novo `content_link`, independente de movies/books/music (não tenta unificá-los —
  são domínios com forma diferente, catálogo pesquisável vs. fila de links). Segue o padrão de
  camadas do `docs/stack.md`.
- Campos da entidade: `title`, `url`, `type` (`article` | `video` | `website`), `status`
  (`to_consume` | `consumed` — mais simples que o `to_watch/watching/watched/abandoned` de
  Movie, porque "abandonar um link" não faz muito sentido), `notes`, `is_favorite`,
  `tag_ids uuid[]` (reaproveita o catálogo `tag` da feature 010, mesmo padrão de `task.tag_ids`
  / `project.tag_ids`), `consumed_at`.
- Sem fetch automático de metadata (título/thumbnail via oEmbed do YouTube ou Open Graph
  scraping) no MVP — exige function server-side por causa de CORS, fica pra uma Onda 2. Por
  ora o usuário cola a URL e digita o título; `type` pode ser sugerido automaticamente por
  domínio conhecido (youtube.com/youtu.be → video; senão article/website manual) via regra pura
  em `src/domain/contentLinks/`, mas sempre editável.
- Extensão de Chrome fica de fora desta feature — não-objetivo agora. Único cuidado: a API de
  criação (`src/api/contentLinks.ts` → `createContentLink`) deve aceitar só os campos
  essenciais (url, title, type) sem depender de estado de UI, pra ficar reutilizável por um
  endpoint futuro sem retrabalho.
- Tabela nova segue os mesmos padrões de RLS/Pro gate das demais: trigger
  `enforce_app_access`, entrada em `wipe_own_data()` (ver `20260807150000_tags_catalog.sql`
  como referência), RLS por `user_id`.
- Cor de módulo: reaproveitar `moduleColors.entertainment` (variável `--cinema`) já que o grupo
  continua sendo o mesmo visualmente, só muda o nome exibido.

## Tarefas
- [x] Migration `content_link` (tabela + índices + RLS por `user_id` + trigger
      `enforce_app_access` + inclusão em `wipe_own_data()`), timestamp novo (não reaproveitar
      nenhum existente)
- [x] `src/types/contentLinks.ts` — `ContentLink`, `ContentLinkType`, `ContentLinkStatus`
- [x] `src/domain/contentLinks/` — regras puras: sugerir `type` a partir da URL (detecção de
      domínio), normalizar/validar URL, extrair domínio pra exibir como "fonte" (ex:
      youtube.com, substack.com) — com testes Vitest
- [x] `src/api/contentLinks.ts` — `fetchContentLinks`, `createContentLink`,
      `updateContentLink`, `deleteContentLink`, `markContentLinkConsumed`
- [x] Renomear grupo "Entretenimento" → "Conteúdo" em `app-sidebar.tsx` e trocar ícone do grupo
- [x] Página `src/pages/admin/content/Links.tsx` — tabs por status (Para consumir /
      Consumido), filtro por tipo (Todos/Artigos/Vídeos/Sites), form de criação rápida
      (URL + título, tipo sugerido automaticamente e editável, tags), lista com link externo e
      favicon do domínio
- [x] Registrar rota (`/content` ou `/links`, decidir no início da implementação) em
      `routes.tsx` + item no grupo "Conteúdo" na sidebar
- [x] Testes de domínio (Vitest) para detecção de tipo por URL e normalização
- [x] Aplicar a migration `20260809200000_content_link.sql` ao banco remoto (`supabase db push`)
      — confirmado com o usuário antes de rodar (regra do projeto, `docs/stack.md`)

## Notas
- **`supabase db push` exigiu `--include-all`**: havia 4 migrations mais antigas nunca aplicadas
  ao banco remoto, da feature de deslocamento em viagens já mesclada no código
  (`20260807141500_trip_activity_arrival_time.sql`,
  `20260807170000_trip_activity_transport_mode.sql`,
  `20260807180000_trip_activity_transport_scope.sql`,
  `20260807190000_trip_activity_transfer_endpoints.sql`) — o CLI recusa aplicar uma migration nova
  se houver mais antigas pendentes, exceto com essa flag. Todas as 4 são aditivas (só colunas
  nullable em `trip_itinerary_activity`, sem risco a dado existente) — confirmado lendo o
  conteúdo de cada uma antes de aplicar, e re-confirmado com o usuário (o pedido original só
  cobria o `content_link`) antes de rodar com `--include-all`.
- Verificado ao vivo (Chrome MCP, sessão ngrok do usuário) depois da migration: criar link
  (`youtube.com/...` sugeriu `type: video` automaticamente), favicon do domínio aparecendo,
  marcar como consumido move da aba "Para consumir" pra "Consumido", excluir remove de verdade —
  tudo revertido depois pra não deixar dado de teste.
- **Rota escolhida: `/links`** (não `/content/links`) — os outros itens do grupo "Conteúdo"
  (Cinema/Livros/Música) já são rotas de topo (`/movies`, `/books`, `/music`), sem prefixo de
  grupo; manter `/links` no mesmo nível é consistente com o padrão existente, mesmo o arquivo
  da página morando em `src/pages/admin/content/Links.tsx` (a estrutura de pastas não precisa
  espelhar a rota).
- **Ícone do grupo**: escolhido `Bookmark` (não `Link`) — combina melhor com o conceito de "guardar
  pra depois" que o módulo de Links introduz, e não conflita visualmente com o ícone de link
  externo já usado em `ExternalLinkChip` (tarefas, feature 013).
- **`TagCombobox` reaproveitado direto de `src/pages/admin/tasks/TagCombobox.tsx`** — import
  cross-módulo (Conteúdo importando de Tarefas), primeiro caso disso no projeto. Optei por isso em
  vez de duplicar o componente: tags já são um catálogo deliberadamente compartilhado (decisão da
  feature 010), e duplicar a lógica de busca/criação inline seria pior que o acoplamento entre
  módulos. Se um terceiro módulo precisar do mesmo componente no futuro, vale mover
  `TagCombobox`/`TagBadge` pra um local compartilhado (`src/components/`) em vez de reaproveitar
  de novo de dentro de `tasks/`.
- **Favicon por domínio**: usa o endpoint público `https://www.google.com/s2/favicons?domain=...`
  — não existia nenhum padrão prévio no projeto pra isso (verificado antes de implementar). Sem
  fallback caso o serviço não retorne nada (o `<img>` só fica com alt vazio) — aceitável pra v1,
  não crítico pro funcionamento da página.
- **Sem dialog de edição separado** — a tarefa 6 do plano só pedia criação rápida + lista; editar
  título/URL/notas depois de criado não foi implementado nesta rodada (só favoritar, marcar
  consumido e excluir, que já cobrem o uso principal). Avaliar com o usuário se vale adicionar.
- **`Star`/favorito e favicon usam o serviço do Google mencionado acima sem cache** — cada
  renderização da lista dispara um request de imagem por link; aceitável pro volume esperado
  (fila pessoal, não uma tabela com milhares de linhas), mas vale revisitar se a lista crescer
  muito.
