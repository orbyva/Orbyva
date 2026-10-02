---
prompt: |-
  E faça isso no mobile:
  [...]
  Tarefas
  - Tela de gerenciamento de tags e regras de ícone de link (/tasks/tags e /tasks/link-icons).
    No mobile, tag só é criada direto dentro do formulário da tarefa.
---

# 198 — Telas de tags e de regras de ícone de link no mobile

## Contexto
- Web: `/tasks/tags` lista as tags com cor, "N em uso" (tarefas + projetos), editar nome/cor e
  excluir; `/tasks/link-icons` gerencia `link_icon_rule` (a primeira regra que casa a URL decide
  ícone e texto do link na lista de tarefas), com interruptor, setas ↑/↓, teste por URL e "Criar
  regras padrão".
- Mobile: tag só era editada/excluída segurando o chip dentro do formulário da tarefa; não existia
  nada de `link_icon_rule`, e o link na lista de tarefas aparecia só como "Abrir".

## Decisões
- Domínio da web portado para `mobile/src/domain/tasks/linkIconRules.ts` (+ `externalLink.ts` para o
  fallback de host/GitHub) e API para `mobile/src/api/tasks/linkIconRules.ts`, com as mesmas
  validações (regex compilada com `i`, teto de 200 caracteres, nome obrigatório) antes de chegar ao
  banco.
- Sem a tela de regras, o link continuaria "Abrir" e configurar regras não mudaria nada visível. Por
  isso a lista de tarefas (`TasksList`) passa a mostrar o ícone + texto que as regras produzem, com
  `resolveLinkAppearance`, a mesma função da prévia da tela de regras.
- Ícone da biblioteca do usuário (upload, feature 086) não é escolhido no mobile: regra que já tem
  `icon_url` mostra o ícone e permite trocar por um ícone pronto; novos uploads seguem só na web.
- Uso das tags vem de uma leitura leve de `tag_ids` em `task` e `project` (`fetchTagUsage`), em vez
  de carregar as tarefas inteiras.
- Entradas: "Gerenciar tags" e "Ícones de link" abaixo dos filtros em Tarefas; "Ícones de link" no
  topo da tela de tags; "Configurar ícones" na seção Links do formulário da tarefa (como na web).
- `ColorDots` saiu do formulário da tarefa para `components/ColorDots.tsx`, compartilhado com a tela
  de tags.

## Tarefas
- [x] `mobile/src/domain/tasks/{externalLink,linkIconRules,tags}.ts` + teste
  `domain/tasks/__tests__/linkIconRules.test.ts` (precedência por `position`, regra desligada/
  inválida pulada, fallback de host, ícone da biblioteca vence preset, validação, mover ↑/↓,
  contagem de uso).
- [x] `mobile/src/api/tasks/linkIconRules.ts` + `fetchTagUsage` em `api/tasks/tags.ts`; teste
  `api/__tests__/linkIconRules.test.ts` com banco falso (cria aparando campos, recusa regex/nome
  inválidos sem tocar no banco, regras padrão depois das existentes, reordenar renumera de 0 e para
  no primeiro erro, desligar/excluir só a regra pedida, uso somando tarefas e projetos).
- [x] Telas `tasks/tags.tsx` e `tasks/link-icons.tsx`, registradas em `tasks/_layout.tsx`.
- [x] `TasksList` usa as regras no chip do link; `tasks/index.tsx` carrega as regras.
- [x] `npx tsc --noEmit` e `npx vitest run` no `mobile/` (71 testes).

## Como testar
1. `cd mobile && npx vitest run src/domain/tasks src/api/__tests__/linkIconRules.test.ts` — 14 testes.
2. No app, Tarefas → "Gerenciar tags": cada tag mostra "N em uso"; editar nome/cor → o chip no
   formulário da tarefa e na web muda; excluir → a tarefa continua, sem a tag.
3. Tarefas → "Ícones de link" com a lista vazia → "Criar regras padrão" cria 8 regras. Uma tarefa
   com link `https://github.com/owner/repo/issues/12` passa a mostrar o ícone do GitHub e
   `owner/repo#12` na lista; desligar "GitHub issue/PR" faz o chip virar `owner/repo` (a regra de
   repositório casa em seguida).
4. "Nova regra" com expressão `([` mostra o erro do RegExp e não deixa salvar; testar a URL no campo
   "Testar com uma URL" mostra "A regra casou:" com o ícone e o texto finais.
