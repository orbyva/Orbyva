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
- **Issue do GitHub — metadados ao vivo, sem OAuth por usuário**: quando `external_provider ===
  "github"` e a URL bate com `github.com/{owner}/{repo}/issues/{number}`, uma Edge Function nova
  `github-issue` busca título/estado/labels via API do GitHub usando um token guardado como secret
  do servidor — mesmo padrão já usado por `places-catalog`/`spotify-catalog` (chave só no backend,
  nunca exposta ao cliente). Sem fluxo de OAuth por usuário: um único token de app, como as outras
  integrações do projeto já fazem.
- **Sem sincronização de volta**: fechar a issue no GitHub não fecha a tarefa no Orbyva — exigiria
  webhook/infra própria, fora de escopo. O badge de estado (bolinha colorida: verde aberta / roxa
  se for PR mesclado / cinza-vermelha fechada, mesma iconografia do próprio GitHub) é buscado ao
  abrir a tarefa, com um botão manual de atualizar.
- **UI**: chip "owner/repo#123" com a bolinha de estado nos cards de Lista/Agenda/Kanban; campo
  "Link externo" no formulário de tarefa (cola a URL, preview busca ao perder o foco).
- Fora de escopo: criar issues no GitHub a partir do Orbyva, notificação quando o estado muda,
  qualquer provider além do GitHub nesta rodada (o campo fica pronto, só não é implementado).

## Tarefas
- [ ] Instalar `react-markdown` + `remark-gfm`
- [ ] Migration: `task.external_url`, `task.external_provider` (text, nullable) — aplicada ao banco
      remoto
- [ ] Types: `Task.external_url`/`external_provider`; `TaskCreateRequest` idem
- [ ] Secret novo na Edge Function (token do GitHub) + Edge Function `github-issue`: dado
      owner/repo/número, retorna título/estado/labels
- [ ] Abas Escrever/Visualizar (Markdown+GFM) no campo de descrição, nos formulários de tarefa e no
      dialog de subtarefa da feature 012
- [ ] Strip de markdown na prévia truncada dos cards (ajusta o preview de descrição da feature 012)
- [ ] Campo "Link externo" no formulário de tarefa + parsing de URL de issue do GitHub
- [ ] Chip de issue do GitHub nos cards (estado colorido) + chip genérico para outras URLs
- [ ] `npm run build && npm run lint` limpos + verificação manual (colar link de uma issue real e
      ver o chip com estado correto; markdown com lista/checklist/tabela renderizando na prévia)

## Notas
- Depende de um Personal Access Token do GitHub configurado como secret da Edge Function —
  confirmar com o usuário qual conta/token usar e o escopo mínimo necessário (`public_repo` cobre
  repositórios públicos; `repo` só é necessário se algum link for para repositório privado) antes
  de configurar.
