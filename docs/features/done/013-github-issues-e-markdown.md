# 013 — Vínculo com issues do GitHub + descrições de tarefa em Markdown

## Contexto
Pedido do usuário: poder linkar uma tarefa a uma issue do GitHub (e, depois, a outros lugares —
o campo deve nascer genérico o suficiente pra não exigir migração nova a cada provider), e
descrições de tarefa escritas em Markdown — "indispensável" — no mesmo espírito de como o GitHub
renderiza comentários. Hoje `task.description` é texto puro, salvo e nunca interpretado (`grep`
por libs de markdown no `package.json` não encontra nada — `react-markdown`/`remark`/`marked`
inexistentes no projeto). Não existe nenhum conceito de link externo em `task` hoje.

## Decisões
- **Markdown com GFM**: adiciona `react-markdown` + `remark-gfm` (únicas deps novas desta feature —
  seguras por padrão, sem `dangerouslySetInnerHTML`, suportam listas/checklist/tabela/riscado como
  o GitHub renderiza). O campo de descrição (nos formulários de tarefa e no dialog enxuto de
  subtarefa da feature 012) ganha abas **Escrever**/**Visualizar** (`Tabs` do shadcn/ui, já usado
  no app) — Escrever é o `textarea` de sempre, Visualizar renderiza o markdown.
- **Prévia nos cards continua texto puro**: a prévia truncada de descrição adicionada pela feature
  012 nos cards (Lista/Agenda/Kanban) faz *strip* da sintaxe markdown (regex simples, sem parse
  completo) em vez de renderizar rich text num espaço apertado — markdown completo só aparece ao
  abrir a tarefa.
- **Link externo genérico, não só GitHub**: `task` ganha `external_url text nullable` +
  `external_provider text nullable` (texto livre; hoje só `"github"` tem tratamento especial na UI,
  mas o campo já está pronto pra outro provider amanhã sem migração nova). Qualquer URL sem provider
  reconhecido vira um chip de link simples.
- **Revisão do usuário (sem Edge Function, sem token)**: a ideia original de buscar
  título/estado/labels ao vivo via API do GitHub (Edge Function + Personal Access Token) foi
  descartada — "não se prenda a precisar que o token de acesso seja oferecido". `external_provider`
  é detectado só no cliente (regex sobre a URL: `github.com/{owner}/{repo}/issues/{number}` ou
  `/pull/{number}`), sem nenhuma chamada de rede. O chip mostra "owner/repo#123" (extraído da própria
  URL) com um ícone de GitHub — sem bolinha de estado (aberta/fechada), já que isso exigiria a API.
  Clicar abre a issue em `github.com` numa aba nova. Cobre a rastreabilidade pedida (ver de qual
  issue a tarefa veio, ir até lá) sem exigir credencial nenhuma.
- **UI**: chip "owner/repo#123" com ícone de GitHub nos cards de Lista/Kanban de tarefas; campo
  "Link externo" no formulário de tarefa (cola a URL, detecção é síncrona ao digitar/colar).
- Fora de escopo: estado da issue (aberta/fechada/PR mesclado), criar issues no GitHub a partir do
  Orbyva, notificação quando o estado muda, qualquer provider além da detecção de GitHub nesta
  rodada (o campo fica pronto pra outro provider, só não é implementado).

## Tarefas
- [x] Instalar `react-markdown` + `remark-gfm`
- [x] Migration escrita (`20260807160000_task_external_link.sql`): `task.external_url`,
      `task.external_provider` (text, nullable) — **aplicada ao banco remoto** (junto com o push
      da feature 010)
- [x] Types: `Task.external_url`/`external_provider`; `TaskCreateRequest` idem
- [x] `domain/tasks/externalLink.ts`: `detectGitHubLink`/`detectExternalProvider`, função pura de
      detecção de URL do GitHub (owner/repo/número, issue ou PR) — 7 testes Vitest
- [x] `TaskDescriptionField.tsx`: abas Escrever/Visualizar (Markdown+GFM) compartilhado, usado nos
      dois formulários de tarefa (`TaskList.tsx`, `ProjectDetail.tsx`), no dialog de subtarefa da
      feature 012 e no dialog enxuto de tarefa da Agenda (feature 016)
- [x] `stripMarkdown` (`lib/markdown.ts`) na prévia truncada dos cards (`TaskListRow`,
      `KanbanCard`, checklist de subtarefas) — 4 testes Vitest
- [x] Campo "Link externo" no formulário de tarefa (`TaskList.tsx`, `ProjectDetail.tsx`) + detecção
      síncrona de URL do GitHub ao digitar
- [x] `ExternalLinkChip` nos cards (ícone GitHub + "owner/repo#N", ou chip genérico "Link externo"
      pra outras URLs) em `TaskListRow` e `KanbanCard`
- [x] `npm run build && npm run lint` limpos (372 testes Vitest passando, 0 erros de lint, `tsc -b`
      limpo)
- [x] Verificação manual no navegador (colar link de uma issue real e ver o chip; markdown com
      lista/checklist/tabela renderizando na prévia) — verificado ao vivo (Chrome MCP, sessão ngrok
      do usuário): digitei `**negrito**`/`_itálico_`/lista na Descrição, aba Visualizar renderizou
      corretamente; colei `https://github.com/anthropics/claude-code/issues/123` em Link externo,
      salvei, e o card mostrou o chip "anthropics/claude-code#123" com ícone do GitHub + a prévia
      truncada em texto puro (sem sintaxe markdown) abaixo do título — revertido depois pra não
      deixar dado de teste.

## Notas
- Escopo revisado pelo usuário durante a implementação: removida a busca ao vivo de
  título/estado via API do GitHub (e o token/Edge Function que isso exigiria). A rastreabilidade
  pedida fica só com link + identificação visual de que é uma issue/PR do GitHub, sem estado.
- `TaskDescriptionField` também foi aplicado ao dialog enxuto de tarefa da Agenda (feature 016,
  `CalendarTaskDialog`), não previsto explicitamente no plano original, por consistência — não faria
  sentido esse dialog continuar com textarea puro depois desta feature.
- Prévia de markdown renderizada sem `@tailwindcss/typography` (plugin `prose`, não instalado no
  projeto) — estilização manual via seletores `[&_tag]:classe` no Tailwind, cobrindo listas,
  tabela, código inline, links e riscado. Suficiente pro conjunto de elementos GFM usado aqui, mas
  é uma superfície menor que o plugin `prose` cobriria (ex.: blockquote sem estilo custom).
