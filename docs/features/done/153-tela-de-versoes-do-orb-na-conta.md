---
prompt: |-
  Pedido do usuário, verbatim (bullet 5 de uma lista de melhorias de interface):

  - quero quer dê para criar versões do orb com IA, você faz uplaod de imagens, e um prompt. ele cria uma imagem png do orb, e você salva, como o seu

  Fatia desta feature — a tela:

  - Resposta do usuário (P3): a tela de gerar mora numa seção "Orb" em `/account` — é configuração
    de conta, é onde já vivem plano, e-mails e exportação, e não compete com a conversa em `/orb`.
  - Resposta do usuário (P1): a versão gerada vira o avatar da Orb neste app, para este usuário, e
    as anteriores ficam numa galeria com uma marcada como ativa.
  - Resposta do usuário (P6): até 3 imagens de referência por geração, redimensionadas no cliente
    antes de subir — o corpo da requisição é o gargalo da Edge Function.
  - Fora de escopo declarado no desenho: animar a versão gerada, gerar avatar para outras entidades,
    e editar a imagem depois de gerada.

  Fora desta feature: a esfera do app passar a mostrar a versão ativa (154).
---

# 153 — Tela de versões da Orb em /account

## Contexto
Depende de 151 (tabela, RPC e bucket) e de 152 (a Edge Function `orb-avatar`, que é quem gera e
grava). Esta feature é só a tela: enviar até três referências, escrever o prompt, gerar, ver a
galeria e escolher a ativa.

`/account` (`src/pages/admin/Account.tsx`, 825 linhas) já é uma pilha de `<section className="rounded-xl
border bg-card p-5 sm:p-6">` — perfil, alertas, plano, exportação, zona de perigo; o padrão a copiar
está em `src/pages/admin/Account.tsx:302-342`. A seção nova entra como componente próprio para a
página não crescer mais.

## Decisões
- A seção vive em `src/pages/admin/account/OrbAvatarSection.tsx` (pasta nova, no padrão dos outros
  módulos de `src/pages/admin/`), importada por `Account.tsx`. Entra **depois** da seção de
  preferências de alerta e **antes** de "Exportar dados (CSV)" — configuração de uso, não de conta.
- O redimensionamento das referências acontece no cliente, antes de virar base64: a decisão de
  tamanho (`targetSize`) é uma função pura e testada; só o desenho no canvas fica sem teste
  unitário, porque canvas não existe no jsdom.
- Referência: no máximo 3, aresta maior 768 px, JPEG qualidade 0,85 — o que sobe é sempre o
  redimensionado, nunca o arquivo original.
- Nenhuma referência é guardada: são convertidas em memória, mandadas para a função e descartadas.
- O erro da função (400/413/429/422/502) aparece como toast com a mensagem que ela devolveu, via
  `useToast` + `getErrorMessage` — a mensagem de cota é útil, não é ruído.
- Não há "editar" nem "renomear" versão: o que identifica uma versão é o prompt dela, mostrado na
  legenda. Editar a imagem gerada está fora do escopo desta rodada.

## Tarefas
- [x] Criar `src/domain/orb/avatarImage.ts` (puro, sem DOM): `MAX_REFERENCES = 3`,
      `REFERENCE_MAX_EDGE = 768`, `REFERENCE_MIMES`, `isSupportedReferenceMime(mime)` e
      `targetSize({ width, height }, maxEdge)` — preserva a proporção, arredonda para inteiro e
      **nunca amplia** imagem menor que o teto.
- [x] Escrever `src/domain/orb/__tests__/avatarImage.test.ts`: retrato, paisagem, quadrado, imagem
      menor que o teto (volta igual), 1 px, e mime não suportado.
- [x] Criar `src/lib/orbAvatarReference.ts`: `fileToReference(file)` — `createImageBitmap`, canvas
      com as dimensões de `targetSize`, `drawImage`, `toDataURL("image/jpeg", 0.85)`, devolvendo
      `{ mime: "image/jpeg", data: <base64 sem o prefixo data:> }`. Rejeita mime não suportado antes
      de desenhar. Camada fina de propósito: a decisão já foi tomada em `avatarImage.ts`.
- [x] Acrescentar `generateOrbAvatar({ prompt, references })` em `src/api/orbAvatars.ts` —
      `supabase.functions.invoke("orb-avatar", { body: { prompt, references, today, timezone } })`
      com `today`/`timezone` do dispositivo; quando o invoke devolver erro, lê o `error` do corpo da
      resposta e o relança (senão a mensagem de cota vira "Edge Function returned a non-2xx status").
      Devolve `OrbAvatar` + `remaining`.
- [x] Criar `src/pages/admin/account/OrbAvatarSection.tsx` — casca: `<section>` no padrão da página,
      título "Versões da Orb" com ícone, texto curto explicando que a versão ativa substitui a
      esfera no app, e carregamento inicial de `fetchOrbAvatars()` com `Skeleton` enquanto busca.
- [x] No mesmo componente: formulário — `<textarea>` do prompt (padrão de
      `src/pages/admin/tasks/SvgIconPasteField.tsx:83-97`, com contador até 500 caracteres), input de
      arquivo `accept="image/png,image/jpeg,image/webp"` `multiple`, miniaturas das referências
      escolhidas com botão de remover, e bloqueio ao passar de 3 com toast explicando o limite. O
      padrão de input de arquivo do projeto é `src/pages/admin/tasks/TaskIconPicker.tsx:224-232`; se
      a leva da biblioteca de assets já tiver publicado um componente de upload reutilizável quando
      esta tarefa for implementada, prefira reusá-lo a copiar.
- [x] No mesmo componente: botão "Gerar versão" — desabilitado sem prompt, sem referência
      selecionada ainda é permitido, estado de carregando ("Gerando…", pode demorar), chamada a
      `generateOrbAvatar`, toast de sucesso, a versão nova entra no topo da galeria e as referências
      são limpas. Mostrar "restam N hoje" a partir do `remaining` devolvido, e desabilitar o botão
      quando for 0.
- [x] No mesmo componente: galeria — grid de miniaturas (`created_at desc`), a ativa com `Badge`
      "ativa" e anel destacado, legenda com o prompt truncado, botão "Usar esta"
      (`setActiveOrbAvatar`) e excluir com `ConfirmDeleteDialog`; `EmptyState` quando não houver
      nenhuma versão. Toda mutação com `useToast` + `getErrorMessage`.
- [x] Montar `<OrbAvatarSection />` em `src/pages/admin/Account.tsx`, entre a seção de preferências
      de alerta e a de exportação, escondida quando `hasAccess` for falso (mesmo critério do
      `OrbProposalTrayHost` em `src/layouts/AdminLayout.tsx:261`).
- [x] Escrever `src/pages/admin/account/__tests__/OrbAvatarSection.test.tsx` (jsdom) com
      `vi.mock("@/api/orbAvatars")` e `vi.mock("@/lib/orbAvatarReference")`: lista renderizada com a
      ativa marcada; gerar chama a API com o prompt digitado e as referências convertidas; "Usar
      esta" chama `setActiveOrbAvatar` com o id certo e a marca muda de cartão; erro da API vira
      toast e a galeria não muda; `remaining: 0` desabilita o botão.
- [x] Rodar `npm test -- src/domain/orb/__tests__/avatarImage.test.ts
      src/pages/admin/account/__tests__/OrbAvatarSection.test.tsx`, `npm run lint`,
      `npm run build` e `npm run check:bundle`.

## Prompts

- 05/10/26 — "Pode continuar" (seguir a fila do `todo/` que não depende do usuário).

## Notas

- **Posição**: a seção entra logo depois de "Preferências de alerta", antes de "Plano" — a Decisão
  pede "depois da preferência de alerta e antes de Exportar", e entre as duas ainda há Plano,
  E-mails e o convite de amigos; ficar colada às preferências mantém junto o que é configuração de
  uso.
- **Upload**: o `AssetUploadControls` da biblioteca de assets é de arquivo único e ícone (SVG/
  colar); não serve para 3 imagens com miniatura. Input de arquivo próprio, escondido atrás do
  botão "Escolher imagens", com label acessível.
- **Erro da função**: `generateOrbAvatar` lê o corpo em `error.context` e relança como
  `OrbAvatarGenerateError` (com `remaining` quando vem do 429) — teste próprio em
  `src/api/__tests__/orbAvatars.generate.test.ts`, inclusive o caso de corpo ilegível.
- A 152 passou a devolver a linha inteira (`user_id`, `is_active`), então o retorno entra direto
  na galeria como `OrbAvatar`.
- O prompt fica no campo depois de gerar (só as referências são limpas): repetir com um ajuste é o
  uso esperado.
- Limites do cliente amarrados aos da função por teste (`avatarImage.test.ts` importa
  `MAX_REFERENCES`/`REFERENCE_MIMES` da Edge Function).
- Provas: 8 testes da seção (lista e ativa, vazio, gerar com referências convertidas, limite de 3,
  "Usar esta", erro vira toast sem mexer na galeria, cota 0 desabilita, excluir com confirmação);
  quebrar a troca de ativa e a leitura de `remaining` derruba os dois testes correspondentes
  (desfeito). `npm test` 3848 passando, `npm run build` e `npm run check:bundle` ok, lint com 0
  erros (30 avisos que já existiam).
- **Sem prova automática**: o desenho no canvas (`fileToReference` — sem canvas no jsdom) e a
  condição `hasAccess` da montagem em `Account.tsx` (nenhum teste renderiza a página inteira).
  Ficam no roteiro manual. A tela só funciona de verdade depois do deploy da `orb-avatar` (152).
- 2026-10-05 — concluída na limpeza dos `.md` a pedido do usuário ("Pode concluir direto"); o usuário vai commitar; a tela só gera versão depois que a `orb-avatar` (152) for publicada.

## Como testar

Este roteiro só faz sentido com 151 e 152 já implementadas: a migration aplicada no banco remoto e a
função `orb-avatar` publicada com `GEMINI_API_KEY` no secret.

1. **Pré-requisitos**
   - `npm run dev` no ar.
   - Logado com um usuário com acesso (Pro ou trial) — a seção não aparece para conta bloqueada.
   - Duas ou três imagens pequenas no disco para usar como referência.

2. **Verificação automatizada**
   - `npm test -- src/domain/orb/__tests__/avatarImage.test.ts` — o cálculo de redimensionamento,
     incluindo "não amplia".
   - `npm test -- src/pages/admin/account/__tests__/OrbAvatarSection.test.tsx` — a seção inteira com
     a API dublada: gerar, ativar, erro e limite.
   - `npm run build` e `npm run check:bundle` — sem erro de tipo e sem estourar o orçamento do
     bundle.

3. **Verificação manual, passo a passo**
   1. Abra `/account` e role até a seção **Versões da Orb** — ela fica entre "Preferências de
      alerta" e "Exportar dados (CSV)". Sem nenhuma versão, aparece o estado vazio.
   2. Escreva um prompt (ex.: "esfera roxa com reflexo azul, fundo escuro") e clique em **Gerar
      versão** sem escolher referência → botão vira "Gerando…", e em alguns segundos uma miniatura
      nova aparece no topo da galeria, com toast de sucesso.
   3. Clique em **escolher imagens** e selecione duas fotos → duas miniaturas aparecem acima do
      botão, cada uma com o "x" de remover.
   4. Gere de novo com as duas referências → a versão nova entra no topo, e o contador "restam N
      hoje" cai em 1.
   5. Clique em **Usar esta** na segunda versão → o selo "ativa" muda de cartão na hora, sem
      recarregar a página.
   6. Exclua uma versão pelo ícone de lixeira → o diálogo de confirmação aparece; confirmando, o
      cartão some e, no Supabase, `select count(*) from public.orb_avatar` cai em 1 e o arquivo
      some do bucket `orb-avatars`.
   7. Recarregue `/account` → a galeria volta igual, com a mesma versão marcada como ativa.

4. **Casos de borda e caminhos negativos**
   - Prompt vazio → botão "Gerar versão" desabilitado (nenhuma chamada sai).
   - Prompt acima de 500 caracteres → o contador fica em vermelho e o envio é barrado com mensagem.
   - Escolher 4 imagens → só 3 entram e aparece um toast dizendo que o máximo é 3.
   - Escolher um `.gif` ou um PDF → recusado com mensagem, sem quebrar a tela.
   - Estourar a cota do dia (baixe `ORB_IMAGE_DAILY_LIMIT` para 1) → o toast traz a mensagem da
     função e o botão fica desabilitado com "restam 0 hoje".
   - Desligar a rede e clicar em gerar → toast de erro amigável, botão volta ao normal, nada é
     gravado.
   - Conta sem acesso (trial vencido) → a seção não aparece em `/account`.
   - Celular (largura ~390 px) → a galeria vira 2 colunas e o formulário não estoura a tela.

5. **Sinais de que quebrou**
   - Toast "Edge Function returned a non-2xx status code" em vez da mensagem em PT-BR = o corpo do
     erro da função não está sendo lido.
   - Geração demorando e a tela ficando sem resposta = falta estado de carregando no botão.
   - Miniatura quebrada (ícone de imagem partida) = a URL pública do bucket não está acessível.
   - Duas versões com o selo "ativa" = a lista local não foi atualizada depois da RPC.
   - Referência subindo em tamanho original (requisição de vários MB, 413) = `fileToReference` não
     está usando `targetSize`.
