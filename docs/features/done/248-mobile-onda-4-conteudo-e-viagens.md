---
prompt: |-
  Pedido do usuário, verbatim (02/10/26):

  Eu queria também melhorar o front do mobile. To achando muito, sei lá. Deixar algo mais parecido com o web, sabe?
  Sim (fundação primeiro, telas em ondas, navegação por último)
  Vamos trabalhar só na melhora do front mobile
  pode arrochar

  Resposta P3 do planning: quarta onda é Conteúdo e viagens.

  Fatia desta feature — onda 4: telas de Conteúdo (livros, filmes/séries, música) e Viagens passam
  às primitivas e tokens.
---

# 248 — Mobile, onda 4: Conteúdo e viagens

## Contexto
Depende de 205.

Telas: `app/(app)/books/` (`index`, `[id]`, `form`), `movies/` (`index`, `[id]`, `form`), `music/`
(`index`, `[id]`, `form`), `travel/` (`index`, `[id]`, `form`, `expense-form`, `invite/[token]`).
Componentes só delas: `CatalogMediaCard`, `CatalogSearch`, `CoverThumb`, `ReviewSheet`,
`SurpriseChip`, `travel/*` (`ItineraryDayWeather`, `ItinerarySavedPlaceSuggestions`,
`TripItineraryComposer`, `VisitDragHandle`).

Viagens tem 15 ocorrências de estilo à mão; `CatalogMediaCard` 7.

## Decisões
- Mesma definição de "migrar" e densidade da 203.
- Conteúdo em `ModuleColors.entertainment` (`--cinema`), viagens em `travel` (teal do web).
- Abas Para assistir / Assistindo / Assistido / Abandonei (pedido de 15/09 na 098: "igual está na
  parte de saúde") viram `Tabs`/`Chip` das primitivas — ficam automaticamente iguais em todos os
  módulos de conteúdo.
- `components/share/*` (story 9:16) continua fora: é arte de imagem exportada.

## Tarefas
- [x] Migrar `CatalogMediaCard`, `CoverThumb`, `CatalogSearch`, `ReviewSheet` (→ `Sheet`),
      `SurpriseChip` (→ `Chip`).
- [x] Migrar `books/index.tsx`, `[id].tsx`, `form.tsx`.
- [x] Migrar `movies/index.tsx`, `[id].tsx`, `form.tsx`.
- [x] Migrar `music/index.tsx`, `[id].tsx`, `form.tsx`.
- [x] Migrar `travel/index.tsx`, `[id].tsx`, `form.tsx`, `expense-form.tsx`, `invite/[token].tsx`
      e `components/travel/*` (arrastar visita no roteiro continua funcionando).
- [x] Acrescentar tudo acima a `MIGRATED` em `styleGuard.test.ts` e zerar as ocorrências.
- [x] Remover de `theme.ts` apelidos que tenham ficado sem uso (`rg` antes).
- [x] Rodar `cd mobile && npm test`, `npm run typecheck` e `npm run lint`.

## Prompts
- 05/10/26 — depois do fechamento da 205: "arrocha" (seguir para a 206 — hoje 248 — sem conferir 204/205 no
  aparelho antes).

## Notas

- 2026-10-05 — renumerada de 206 para 248: o web commitou `206-link-na-recorrencia-financeira.md`
  com o mesmo número, e a regra é número único. Referências em 205 e 207 atualizadas.
- **Caminho**: os codemods rodaram em sequência nos 27 arquivos da onda (de 409 ocorrências da
  guarda para 32); o resto foi à mão. Nenhum `// token-livre` foi preciso.
- **Sobre capa/foto**: véu e texto por cima de imagem não seguem o tema (a capa é igual nos dois),
  então viraram `scrim(alpha)` e `ON_MEDIA` em `domain/ui/color.ts` (`SCRIM` = `scrim(0.45)`).
  `CatalogMediaCard` usa os dois; nota/legenda com `TypeScale.micro`/`nano`; coração de favorito na
  cor de módulo `health` (antes rosa cravado); barra de progresso `primary`. Teste em
  `color.test.ts`.
- **`ReviewSheet` → `Sheet`**: primeiro uso da primitiva. `Sheet` ganhou `KeyboardAvoidingView`
  (mesmos parâmetros que o `ReviewSheet` usava, para o campo de notas não sumir sob o teclado) e
  `closeDisabled` (fechar fica travado enquanto salva, como antes). Rodapé com `Button` outline +
  padrão `lg`.
- **`SurpriseChip` → `Chip`** selecionado com ícone; `Chip` ganhou `accessibilityLabel`.
- **Abas de status** (Para assistir / Assistindo / …) já passavam por `ChipBar`, que desde a 202
  rende `Tabs`/`Chip` — iguais em livros, filmes e música sem mudança aqui.
- **Conteúdo** em `entertainment`: seções Episódios, Faixas e Notas de leitura (antes roxo, rosa e
  âmbar cravados). Temporadas viraram `Chip`. "Editar" no detalhe é botão padrão quando o item já
  foi concluído e outline antes (era `tone` primário/neutro).
- **Viagens** em `travel`: card de viagem em andamento e ícone de avião. Deslocamento no roteiro
  usa `chart1` (antes `SKY` cravado); check concluído `successForeground`; sombra do item arrastado
  `scrim(1)`. Botão "Aceitar convite" virou `Button`. O `Switch` de ida e volta ficou dentro do
  card (um `ToggleRow` faria caixa dentro de caixa), com as cores do `ToggleRow`.
- **Arrastar no roteiro**: nenhuma linha de gesto/arraste mudou em `travel/[id].tsx` nem em
  `components/travel/*` (conferido no diff; `VisitDragHandle` só trocou a cor do ícone).
- **Header nativo** em Syne (`HeaderTitle`) nos stacks de livros, filmes, música e viagens.
- **Apelidos de `theme.ts`**: nenhum pôde sair — ainda há uso na 207 (`textSecondary` 91,
  `backgroundSelected` 49, `text` 17, `backgroundElement` 17, …).
- **Lint**: `npm run lint` continua sem analisar arquivo; typecheck com `noUnusedLocals` cobre os
  imports mortos.
- Verificação: `npm test` 33 arquivos / 442 testes verdes; typecheck limpo; guarda 150/150; prova
  da guarda: `fontSize: 15` em `movies/index.tsx` → falha na linha plantada, desfeito → verde;
  `npx expo export --platform ios` gera o bundle.
- 2026-10-05 — concluída na limpeza dos `.md` a pedido do usuário ("Pode concluir direto"); conferência no celular fica com o usuário (ver Como testar).

## Como testar

1. **Pré-requisitos**
   - 205 implementada.
   - Conta com livro, filme/série e álbum cadastrados e uma viagem com roteiro e gasto.

2. **Verificação automatizada**
   - `cd mobile && npm test` — `styleGuard.test.ts` passa com `books`, `movies`, `music`,
     `travel` e os componentes da onda em `MIGRATED`.
   - Prova de que a guarda morde: acrescente `fontWeight: "700"` em `components/CatalogMediaCard.tsx`
     → falha. Desfaça.
   - `npm run typecheck` e `npm run lint` sem erro.

3. **Verificação manual, passo a passo**
   1. Filmes → abas de status com o mesmo segmento de Saúde e de Tarefas; cards com capa, nota e
      ação.
   2. Marque um filme como assistido → abre a sheet de avaliação; nota quebrada (6,5) aceita.
   3. Livros e Música → mesmo card e mesmas abas dos filmes.
   4. Viagens → lista e detalhe no teal do web; arrastar uma visita no roteiro reordena; registrar
      um gasto pelo formulário funciona.
   5. Repita 1 e 4 no tema escuro.

4. **Casos de borda e caminhos negativos**
   - Item sem capa → placeholder com a cor de Conteúdo, não um quadrado branco.
   - Título longo de filme → trunca em duas linhas sem empurrar a nota.

5. **Sinais de que quebrou**
   - Abas de conteúdo diferentes entre Filmes e Livros → um dos módulos não passou para `Tabs`.
   - Arrastar visita parou → o handle perdeu o gesto ao trocar de componente.
