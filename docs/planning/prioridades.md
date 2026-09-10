# Prioridades de produto e status das branches

Registro da conversa de 2026-08-27, após a demo da POC do Orb para o Rafael
Nobre e o Pedro.

---

## 1. Entretenimento foi POC, não prioridade

**Cinema / Livros / Música existe como POC do Orb e só isso.** Foi o recorte
escolhido para validar a arquitetura do agente (loop de tool-calling, resolução
de entidade em catálogo externo, proposta com confirmação humana) com o menor
risco possível: errar um filme não custa nada, errar um lançamento financeiro
custa.

A POC foi validada. A arquitetura se provou. **Entretenimento não recebe mais
investimento além de manutenção** — nada de novo módulo, nada de nova tool, nada
de refino de UX ali.

Isso não invalida `docs/planning/orb-ia/p0-entretenimento.md`: aquele documento
segue como registro do que foi construído e como referência de padrão para os
próximos módulos do Orb.

## 2. Ordem de prioridade

| # | Módulo | Estado | Observação |
|---|---|---|---|
| 1 | **Finanças** | maduro no app, ausente no Orb | é o coração do produto e o módulo com maior custo de erro — por isso o Orb começou por outro lugar |
| 2 | **Produtividade** (tarefas/projetos) | pronto em branch, **não mergeado** | ver §3 |
| — | Entretenimento | pronto e encerrado | POC, congelado |

Consequência direta para o Orb e para o MCP: o próximo escopo do agente é
**Finanças**, não a continuação de Entretenimento. Ver
`docs/planning/mcp/estudo-mcp.md` §6.

## 3. Status de Produtividade no GitHub (validado em 2026-08-27)

Validado com `gh` + `git` contra `github.com/pedroynk/Orbyva`. **Subiu, mas não
foi mergeado.**

- Branch: `origin/feat/produtividade`
- Último commit: `fada6d8` — *feat: evolução produtividade* — **Rafael Nobre, 2026-08-26**
- Commits anteriores: `66c1177` (2026-08-24), `9d08971` (2026-08-23)
- **174 commits à frente de `origin/master`**, 634 arquivos, ~107k linhas
- **Nenhum PR aberto.** Os PRs #1 a #5 estão todos fechados/mergeados; o mais
  recente é #5 (extensão do Chrome, 2026-08-18)

O que a branch entrega, além do núcleo de tarefas/projetos: `src/api/tasks/*`
(projects, tags, dependencies, timeEntries, external links, project events,
event invites), `src/domain/tasks/*` (agenda, calendar, gantt, dependencies,
duration, filters, recurrence), além de shopping list, notes/canvas e
health/medication. Traz também suíte de testes SQL própria em `supabase/tests/`.

### O merge é mais barato do que os números sugerem

Contra a intuição de "174 commits, 634 arquivos": o merge é **limpo**.
`git merge-tree --write-tree stage origin/feat/produtividade` roda sem conflito,
e só **4 arquivos** foram tocados pelos dois lados — `README.md`,
`.cursor/ARCHITECTURE.md`, `package.json` e `src/layouts/AdminLayout.tsx`, todos
em regiões diferentes. O Orb também não adiciona nenhuma dependência npm nova
(a Edge usa esm.sh), então o `package.json` só diverge no script `eval:orb`.

### Risco real: colisão de timestamp de migration

Isso conflito de texto não pega. Na união das duas branches há **98 migrations e
dois timestamps duplicados**:

| Versão | Arquivos |
|---|---|
| `20260806130000` | `trip_stops.sql` (stage/master) **×** `project_notes_status_events.sql` (produtividade) |
| `20260819120000` | `orb_agent.sql` (stage) **×** `task_series_icon_backfill.sql` (produtividade) |

O Supabase rastreia migration por **versão** — o prefixo numérico — em
`supabase_migrations.schema_migrations`. Duas migrations com a mesma versão
tendem a resultar em uma delas sendo registrada como já aplicada e **pulada em
silêncio**.

O caso `20260806130000` é o perigoso: `trip_stops` provavelmente já está aplicada
em produção, e `project_notes_status_events` cria `project_event`, altera
`project` e redefine `wipe_own_data()`. Se for pulada, **Produtividade sobe
quebrada** — e sem erro visível no push.

`20260819120000` é benigno por enquanto: a migration do Orb nunca foi aplicada no
banco remoto (está na lista de "exige aprovação separada" do
`p0-entretenimento.md`), então renomeá-la é livre.

- [ ] Renomear `20260819120000_orb_agent.sql` (nunca aplicada — renomear é seguro)
- [ ] Conferir no banco remoto se `20260806130000` já está em `schema_migrations` antes de mergear produtividade

### As branches divergiram

`stage` e `feat/produtividade` separaram no commit `4b4a1b5` (2026-08-18) e
seguiram caminhos independentes:

- `feat/produtividade` = `master` + 173 commits (módulos 049–065)
- `stage` = `master` + o Orb (`4eaf8a6`), mais 8 commits locais **ainda não
  enviados** para o `origin` (correções e melhorias do Orb desta sessão)

Ou seja: **hoje ninguém tem as duas coisas.** O Orb não conhece Produtividade e
Produtividade não conhece o Orb. Quanto mais tempo passar, mais caro fica o
merge — e o MCP de Produtividade (P2 do estudo de MCP) depende dele.

### Ações

- [ ] Resolver as duas colisões de timestamp de migration (acima) **antes** do merge
- [ ] Fazer push dos 8 commits locais do Orb em `stage`
- [ ] Abrir PR de `feat/produtividade` (é o maior conjunto de código sem review do repo)
- [ ] Definir a ordem de integração: `feat/produtividade` → `master` → rebase de `stage`
- [ ] Depois do merge, incluir Produtividade no escopo do Orb e do MCP

---

Referências: `docs/planning/mcp/estudo-mcp.md`, `docs/planning/custo-llm.md`,
`docs/planning/orb-ia/architecture.md`.
