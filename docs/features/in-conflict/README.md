# `in-conflict/` — decisões que a esteira não pode tomar sozinha

Esta pasta **não faz parte do fluxo** `to-refine → in-planning → todo → in-progress → done`. Ela é o
lugar onde um conflito de integração fica escrito, com a explicação e a pergunta, até o usuário
decidir. Nada aqui é implementado sozinho.

A numeração `01-`, `02-`… é **local desta pasta** e de propósito não usa três dígitos: ela não entra
na sequência única `NNN` da esteira, justamente porque estes arquivos não são features.

## Como responder

Cada arquivo abre com um bloco `## Conflito` e termina com uma ou mais perguntas no formato da
esteira:

```
### P1 — <pergunta>
**Resposta:**
```

Escreva a resposta na linha `**Resposta:**` e me chame. Com todas respondidas, eu executo:
promover para `todo/` com número novo, descartar, ou portar só o pedaço que você aprovar.

## Por que esta pasta existe

O worktree `pipeline-agenda` rodou a esteira a partir de um estado antigo do projeto e fechou sete
features (050, 058, 064, 069–072 na numeração dele). No meio disso, a `master` avançou
independentemente e **já havia implementado seis dos sete mesmos recursos**, sob outros números:

| na esteira do worktree | já fechada na `master` |
|---|---|
| 050 item de compras sem categoria | `done/050-nucleo-lista-compras.md` (versão da master) |
| 064 medicação em Vida > Saúde | `done/071-medicacao-na-aba-saude-e-dose-pontual.md` |
| 069 markdown rico na leitura | `done/067-notas-markdown-sofisticado-renderizacao.md` |
| 070 experiência de escrita | `done/068-notas-editor-de-escrita-sofisticado.md` |
| 071 projeto em abas | `done/069-pagina-de-projeto-em-abas.md` |
| 072 pontuais em bolinhas | `done/070-tarefas-pontuais-bolinhas-na-agenda.md` |

O merge que trouxe os dois históricos teve **62 arquivos em conflito**, 13 deles `add/add` — os dois
lados criaram arquivos com o mesmo nome para o mesmo recurso (`remarkCallout.ts`, `MathBlock.tsx`,
`wordCount.ts`), ou nomes diferentes para a mesma função (`rehypeTaskIndex.ts` aqui vs
`rehypeTaskListIndex.ts` lá; `.markdown-body` no CSS aqui vs `previewTypography.ts` lá;
`lowlight` + renderer próprio aqui vs `rehype-highlight` lá; slug caseiro aqui vs `rehype-slug` lá).

### Como o conflito foi resolvido

**Regra única: a `master` ganhou em tudo.** O merge não altera **uma linha** de código vivo — `src/`,
`scripts/`, `supabase/` e `vite.config.ts` ficaram byte a byte idênticos à `master`. Motivo: o código
dela é o que está em uso, validado, e com ~25 features construídas em cima; escolher entre duas
implementações do mesmo recurso por conta própria seria trocar o testado pelo recém-escrito sem
ninguém pedir.

O que o merge traz, então:

1. **o histórico** das duas linhas unificado, sem perder autoria;
2. **esta pasta**, com o que ficou para você decidir;
3. **duas correções** que não duplicam nada e valem por si (ver `09-correcoes-aproveitadas.md`).

O código das implementações descartadas **não se perdeu**: está no commit `939e869`
(`git show 939e869:<caminho>`), último antes do merge. Nada precisa ser reescrito se você decidir
aproveitar algo — é só pedir.

## As decisões

| # | arquivo | decisão em uma linha |
|---|---|---|
| 01 | `01-058-canvas-pode-fechar.md` | a 058 pode sair de `in-progress/`? O banco já dropou `project.notes` |
| 02 | `02-vinculo-evento-tarefa-schema.md` | implementar `project_event.task_id` sobre o modelo de convites? |
| 03 | `03-criar-evento-na-agenda.md` | criar evento pela Agenda — depende da 02 |
| 04 | `04-evento-de-tarefa-fora-da-agenda.md` | mostrar o evento da tarefa fora da Agenda — depende da 02 |
| 05 | `05-notas-markdown-rico-na-leitura.md` | há algo a portar da leitura de markdown? |
| 06 | `06-notas-experiencia-de-escrita.md` | há algo a portar do editor? |
| 07 | `07-projeto-compras-e-notas-em-abas.md` | há algo a portar das abas de projeto? |
| 08 | `08-agenda-tarefas-pontuais-em-bolinhas.md` | há algo a portar das bolinhas? |
| 09 | `09-correcoes-aproveitadas.md` | **já aplicadas** — registro, não pergunta |

## Um aviso que não é pergunta

O repositório e o banco divergem num ponto, e isso **já era verdade na `master`** antes deste merge:
`project.notes` **não existe mais no banco remoto** (dropada em 21/09/2026), mas a `master` não tem
migration nenhuma que faça esse drop — ela está só no branch `feat/orb`
(`20260921100000_project_drop_notes.sql`). Quem clonar o repo e rodar as migrations do zero terá a
coluna; o banco de produção não tem. Vale trazer aquela migration para a `master`, e isso é
independente de tudo o que está nesta pasta.
