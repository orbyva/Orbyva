---
prompt: |-
  Pedido do usuário, verbatim (02/10/26):

  Eu queria também melhorar o front do mobile. To achando muito, sei lá. Deixar algo mais parecido com o web, sabe?
  Sim (fundação primeiro, telas em ondas, navegação por último)

  Resposta P3 do planning da série 201–207: navegação (home, header, sidebar, FABs) fica para um
  planning próprio depois da série.

  Abertura e respostas deste planning, verbatim (05/10/26):

  Sim
  Precisa ter mesmo essa barra inferior? Não sei se é necessário
  não coloca não. Acho que vai ocupar mt espaço da tela
  1. Título tocavel.
  2. Aplique
---

# 208 — Mobile, navegação mais enxuta

## Contexto
Depende de 207.

Hoje, para ir entre páginas do mesmo grupo (Finanças → Transações, Tarefas → Agenda), o único
caminho é hambúrguer → grupo → item. O pé da tela tem dois FABs empilhados (`+` e Orb). O usuário
vetou chrome fixo novo (barra inferior, faixa de abas) por ocupar tela.

## Decisões
- Nenhum chrome fixo novo; nenhuma rota muda de caminho.
- **Título tocável** (P1): nas telas que são item da sidebar, o título do header ganha `▾` e abre
  um `Sheet` com os itens do grupo (de `NAV_GROUPS`, fonte única com a sidebar). Vale para todos
  os grupos, não só Finanças e Tarefas — mesmo custo, comportamento uniforme. Em detalhe e
  formulário o título é texto comum.
- **Gesto da borda esquerda** (P2): arrastar da borda abre a sidebar, só nas mesmas telas raiz —
  em detalhe o arrasto da borda continua sendo o voltar nativo do iOS.
- FAB da Orb sai; a Orb vira ícone no header (busca · Orb · sino) com o ponto de proposta
  pendente. Some na própria `/orb`.
- O `+` usa a cor do grupo da tela (mesma regra da sidebar desde a 207); ações por caminho
  inalteradas. O `LiveWidget` usa a largura toda quando a tela não tem `+`.

## Tarefas
- [x] `lib/nav.ts`: `groupForPath`, `navLeafForPath` (tela raiz = item exato da sidebar) e
      `quickAddModuleForPath`, com teste em `lib/__tests__/nav.switcher.test.ts`.
- [x] `HeaderOrbButton` no `HeaderChromeRight`; remover `OrbAccessFab` e o uso no layout raiz.
- [x] `QuickAddFab` na cor do grupo; `LiveWidget` com largura cheia quando não há `+`.
- [x] `GroupHeaderTitle` (título tocável + `Sheet` do grupo) como `headerTitle` de todos os
      stacks com header nativo; meta-teste no `styleGuard.test.ts` exigindo isso.
- [x] Gesto da borda esquerda abrindo a sidebar nas telas raiz (`SidebarEdgeSwipe`).
- [x] Atualizar "Convenções de UI do mobile" em `docs/stack.md`.
- [x] Rodar `cd mobile && npm test`, `npm run typecheck`, `npm run lint` e o export iOS.

## Prompts

- 05/10/26 — "1. Título tocavel. 2. Aplique" (respostas das perguntas do planning; implementar).

## Notas

- **Voltar por gesto nas telas raiz**: no iOS a borda esquerda já era o voltar nativo, e nas telas
  raiz (sem botão de voltar) ele desempilhava em silêncio — trocar de módulo pela sidebar empilha,
  então arrastar na borda em Tarefas voltava para Finanças. Para a borda abrir a sidebar sem
  disputar com isso, `gestureEnabled: false` no stack raiz e nas raízes empilhadas dentro do
  módulo (Transações, Recorrências, Orçamento, Categorias, Agenda, Live, Projetos). Detalhe e
  formulário continuam com o gesto. Meta-teste em `nav.layouts.test.ts` deriva a lista de
  `NAV_GROUPS`, então item novo na sidebar sem a opção quebra o teste.
- **Cor do `+`**: grupo da tela (regra da sidebar), não a tabela `resolveAppArea` do web — lá Saúde
  e Produtividade caem na cor do Início, o que no mobile brigaria com a sidebar. Texto do `+` sai
  de `ModuleForegrounds` (novo em `theme.ts`, espelho dos `--*-foreground` do web, com paridade em
  `tokenParity.test.ts`): no escuro, Conteúdo usa texto escuro, como no web — branco sobre
  `#DC6EED` não lia.
- **LiveWidget**: o FAB da Orb ficava empilhado acima do `+`, não ao lado, então tirá-lo não muda a
  folga de 88 do widget; ele passa a usar a largura toda só nas telas sem `+`.
- Título tocável vale para todos os grupos (não só Finanças e Tarefas), como a Decisão registra.
  Grupo de um item só não ganha `▾`.
- Provas: os helpers têm teste puro (`nav.switcher.test.ts`); tirar `headerTitle` de
  `books/_layout.tsx` e ligar `gestureEnabled` na Agenda fazem `nav.layouts.test.ts` falhar
  (desfeito); 719 testes passam, typecheck limpo, `expo export --platform ios` gera o bundle. O
  lint sai com código 2 pelo mesmo problema anterior à série: o ESLint ignora todos os arquivos de
  `mobile/src`.
- Gesto e toque no título não têm prova automática do comportamento na tela (Vitest em node, sem
  renderer de RN); ficam no roteiro manual abaixo.
- 2026-10-05 — concluída na limpeza dos `.md` a pedido do usuário ("Pode concluir direto"); conferência no celular fica com o usuário (ver Como testar).

## Como testar

1. **Pré-requisitos**
   - 207 implementada; app rodando no aparelho ou simulador, logado.

2. **Verificação automatizada**
   - `cd mobile && npm test` — `nav.switcher.test.ts` cobre grupo por caminho, tela raiz × detalhe
     × formulário e a cor do `+`; o meta-teste do `styleGuard.test.ts` falha se um `_layout.tsx`
     com header nativo não usar o título tocável ou se o layout raiz voltar a montar
     `OrbAccessFab`.
   - `npm run typecheck` e `npm run lint` sem erro; `npx expo export --platform ios` gera o bundle.

3. **Verificação manual, passo a passo**
   1. Finanças → toque no título "Finanças ▾" → abre a lista Dashboard, Transações, Recorrências,
      Orçamento, Categorias com a atual marcada → toque em Transações → abre Transações.
   2. Tarefas → título → lista do grupo Produtividade (Tarefas, Agenda, Live, Projetos, Notas,
      Lista de Compras).
   3. Abra um detalhe (um livro) → título é texto comum, sem `▾`.
   4. Em qualquer tela raiz, arraste da borda esquerda para a direita → sidebar abre. Num detalhe,
      o mesmo arrasto volta (iOS), não abre a sidebar.
   5. Header mostra busca · Orb · sino; tocar na Orb abre a Orb. Não há mais FAB da Orb no pé.
   6. O `+` muda de cor por grupo: azul em Finanças, roxo em Tarefas, verde em Hábitos, magenta em
      Cinema, índigo no Início.

4. **Casos de borda e caminhos negativos**
   - Com proposta da Orb pendente, o ícone do header mostra o ponto.
   - Live rodando numa tela sem `+` (detalhe de viagem) → widget ocupa a largura toda.
   - Arrastar na vertical perto da borda → rola a lista, não abre a sidebar.

5. **Sinais de que quebrou**
   - Toque no conteúdo colado à borda esquerda não funciona → a área do gesto está engolindo toque.
   - Voltar por gesto em detalhe parou de funcionar → gesto ativo fora da tela raiz.
