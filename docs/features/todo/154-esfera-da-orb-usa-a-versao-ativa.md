---
prompt: |-
  Pedido do usuário, verbatim (bullet 5 de uma lista de melhorias de interface):

  - quero quer dê para criar versões do orb com IA, você faz uplaod de imagens, e um prompt. ele cria uma imagem png do orb, e você salva, como o seu

  Fatia desta feature — a versão ativa aparecer no lugar da esfera:

  - Resposta do usuário (P1): a versão gerada vira o avatar da Orb **neste app**, para este usuário.
  - Resposta do usuário (P2): o PNG **substitui** a esfera CSS em `idle`; em `thinking` o PNG ganha o
    mesmo `orb-pulse` por CSS — assim o estado não some e não se gera uma segunda imagem só para
    "pensando".
  - `OrbSphere` continua sendo o ponto único: o PNG entra **dentro** dele, e nenhum dos três
    chamadores muda.
  - Fora do escopo declarado no desenho: animar a versão gerada e gerar avatar para outras entidades.
---

# 154 — A esfera da Orb mostra a versão ativa

## Contexto
Depende de 151 (a linha ativa e `fetchActiveOrbAvatar`) e de 153 (a tela que marca uma versão como
ativa — sem ela não há o que mostrar, e é lá que mora o botão que precisa avisar a esfera).

A esfera de hoje é CSS de propósito (`src/components/orb/OrbSphere.tsx:12-21`): muda de estado,
acompanha o tema e não custa download. Trocá-la por um PNG não pode custar o estado `thinking` nem a
resposta a `prefers-reduced-motion`, que `src/index.css:524-531` já garante. Os três lugares onde a
Orb aparece — `OrbSidebarDock.tsx:99` (28 px, colapsada), `:115` (30 px, expandida) e
`OrbProposalTray.tsx:67` (22 px, sempre `idle`) — continuam chamando `OrbSphere` do mesmo jeito.

## Decisões
- `OrbSphere` continua sendo o ponto único de troca: o PNG entra **dentro** dele e nenhum dos
  três chamadores muda — quem consome não sabe se dentro é CSS ou `<img>`.
- A URL ativa chega por contexto próprio (`src/hooks/useOrbAvatar.tsx`), buscado **uma vez por
  sessão** dentro do `OrbProvider` em `src/layouts/AdminLayout.tsx:196` — a esfera é renderizada em
  toda página, e uma consulta por render seria uma consulta por navegação.
- Sem provider (teste de componente solto, página pública), o contexto devolve `null` e a esfera é a
  CSS de sempre. `OrbSphere` nunca quebra por falta de provider.
- Em `thinking` o `<img>` recebe o mesmo `orb-pulse` por CSS, numa classe nova `.orb-avatar` que
  espelha a sombra e a animação de `.orb-sphere` — nenhuma segunda imagem é gerada para "pensando", e
  as duas classes entram juntas no bloco de `prefers-reduced-motion`.
- PNG que falhar ao carregar (`onError`) volta para a esfera CSS naquela sessão: melhor a esfera
  antiga que um buraco na barra lateral.
- Trocar a ativa em `/account` chama o `refresh()` do contexto — a barra lateral muda na hora, sem
  recarregar a página.

## Tarefas
- [ ] Criar `src/hooks/useOrbAvatar.tsx`: contexto com `{ url: string | null; refresh: () => void }`,
      `OrbAvatarProvider` que chama `fetchActiveOrbAvatar()` uma vez ao montar (silenciando erro — a
      esfera CSS é o fallback) e `useOrbAvatar()` que devolve `{ url: null, refresh: noop }` quando
      não há provider.
- [ ] Montar `<OrbAvatarProvider>` dentro do `OrbProvider` em `src/layouts/AdminLayout.tsx:196`, de
      forma que tanto o dock quanto o `OrbProposalTrayHost` fiquem dentro dele.
- [ ] Acrescentar em `src/index.css`, logo depois do bloco da esfera (`:457-531`), as classes
      `.orb-avatar` (círculo, `overflow: hidden`, a mesma `box-shadow` e a mesma `animation:
      orb-pulse 5.5s ease-in-out infinite` de `.orb-sphere`), `.orb-avatar--thinking`
      (`animation-duration: 1.6s`) e `.orb-avatar__img` (`width/height: 100%`, `object-fit: cover`,
      `display: block`).
- [ ] Acrescentar `.orb-avatar` e `.orb-avatar--thinking` ao bloco
      `@media (prefers-reduced-motion: reduce)` de `src/index.css:524-531` — quem pediu menos
      movimento vê o PNG parado, não um substituto.
- [ ] Alterar `src/components/orb/OrbSphere.tsx`: consumir `useOrbAvatar()`; havendo `url` e sem
      falha de carregamento, renderizar `<img src={url} alt="" decoding="async" className="orb-avatar__img">`
      dentro de um `<span className={cn("orb-avatar", pensando && "orb-avatar--thinking")}>` com
      `width`/`height` iguais a `size`; sem `url`, exatamente o desenho CSS de hoje. Manter o
      `aria-hidden` da casca e a assinatura de props intacta.
- [ ] No mesmo arquivo: `onError` do `<img>` marca estado local de falha e cai para a esfera CSS;
      atualizar o comentário de bloco do componente, que hoje afirma que a esfera nunca é imagem.
- [ ] Conferir que `src/components/orb/OrbSidebarDock.tsx:99`, `:115` e
      `src/components/orb/OrbProposalTray.tsx:67` **não** mudaram (`git diff --stat` deve mostrar só
      `OrbSphere.tsx`, `index.css`, o hook novo, o layout e a seção de `/account`).
- [ ] Escrever `src/components/orb/__tests__/OrbSphere.test.tsx` (jsdom): sem provider renderiza
      `.orb-sphere` e nenhum `<img>`; com `url` no provider renderiza o `<img>` com aquele `src` e
      sem `.orb-sphere`; `state="thinking"` com `url` aplica `.orb-avatar--thinking`; disparar
      `error` no `<img>` volta para `.orb-sphere`; `size` continua chegando ao elemento.
- [ ] Ligar a atualização: em `src/pages/admin/account/OrbAvatarSection.tsx`, chamar o `refresh()` do
      `useOrbAvatar()` depois de ativar uma versão com sucesso e depois de excluir a versão ativa;
      acrescentar ao teste da seção (`src/pages/admin/account/__tests__/OrbAvatarSection.test.tsx`)
      uma assertiva de que `refresh` foi chamado nos dois casos.
- [ ] Rodar `npm test -- src/components/orb/__tests__/OrbSphere.test.tsx
      src/pages/admin/account/__tests__/OrbAvatarSection.test.tsx`, a suíte inteira (`npm test`),
      `npm run lint` e `npm run build`.

## Prompts

## Notas

## Como testar

Este roteiro só faz sentido com 151, 152 e 153 já implementadas — é preciso conseguir gerar e ativar
uma versão em `/account`.

1. **Pré-requisitos**
   - `npm run dev` no ar, logado com usuário com acesso.
   - Pelo menos duas versões geradas em `/account` (feature 153).
   - A barra lateral aberta (o dock da Orb aparece nela).

2. **Verificação automatizada**
   - `npm test -- src/components/orb/__tests__/OrbSphere.test.tsx` — os cinco casos: sem provider,
     com URL, `thinking`, erro de carregamento e `size`.
   - `npm test -- src/pages/admin/account/__tests__/OrbAvatarSection.test.tsx` — inclui a chamada de
     `refresh` ao ativar e ao excluir a ativa.
   - `npm test` — a suíte inteira, para garantir que nenhum teste que renderiza o dock quebrou.
   - `npm run build` — sem erro de tipo.

3. **Verificação manual, passo a passo**
   1. Em `/account` → seção "Versões da Orb", clique em **Usar esta** numa versão.
   2. Olhe a barra lateral, sem recarregar: a esfera roxa do dock virou o PNG da versão escolhida.
   3. Colapse a barra lateral (modo ícone) → a versão continua aparecendo, agora em 28 px e redonda,
      sem deformar.
   4. Vá para `/orb` e mande uma pergunta qualquer. Enquanto a Orb responde, o avatar **pulsa** (a
      mesma pulsação da esfera antiga) e volta ao normal quando a resposta termina.
   5. Peça à Orb uma criação ("anota uma tarefa de comprar pão amanhã") até o cartão de confirmação
      aparecer: o avatar no cartão (`OrbProposalTray`) também é o PNG, em 22 px.
   6. Volte a `/account` e ative a **outra** versão → a barra lateral troca na hora.
   7. Recarregue a página → continua mostrando a versão ativa.

4. **Casos de borda e caminhos negativos**
   - Nenhuma versão ativa (exclua a ativa, ou use uma conta que nunca gerou) → volta a esfera CSS
     roxa de sempre, com a animação de sempre.
   - URL quebrada (troque a `url` da linha ativa no banco por algo inválido e recarregue) → a esfera
     CSS aparece no lugar, sem buraco nem ícone de imagem partida.
   - Sistema com "reduzir movimento" ligado (macOS: Acessibilidade → Tela → Reduzir movimento) → o
     PNG aparece parado, inclusive enquanto a Orb pensa.
   - Tema claro e tema escuro → o PNG não muda (é a imagem do usuário), mas o brilho em volta
     continua legível nos dois.
   - Conta sem acesso (trial vencido) → o dock não aparece; nada quebra.

5. **Sinais de que quebrou**
   - Esfera some e fica um buraco → o `<img>` renderizou sem `src` válido e sem cair no fallback.
   - Avatar aparece quadrado ou esticado → falta `object-fit: cover` ou o `border-radius` da casca.
   - Avatar não pulsa enquanto a Orb responde → a classe `--thinking` não está sendo aplicada ao
     `<span>` da imagem.
   - Uma requisição a `orb_avatar` por navegação (veja a aba Network trocando de tela) → o provider
     foi montado abaixo do `Outlet` em vez de dentro do `OrbProvider`.
   - Ativar em `/account` e a barra lateral só mudar depois de F5 → o `refresh()` do contexto não foi
     ligado.
