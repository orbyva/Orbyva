---
prompt: |-
  Pedido do usuário, verbatim (02/10/26):

  Eu queria também melhorar o front do mobile. To achando muito, sei lá. Deixar algo mais parecido com o web, sabe?
  Sim (fundação primeiro, telas em ondas, navegação por último)
  Vamos trabalhar só na melhora do front mobile
  pode arrochar

  Resposta P3 do planning: terceira onda é Vida (hábitos, metas, saúde, lugares, carro).

  Fatia desta feature — onda 3: telas de Vida passam às primitivas e tokens.
---

# 205 — Mobile, onda 3: Vida

## Contexto
Depende de 204.

Telas: `app/(app)/habits/` (`index`, `form`), `goals/` (`index`, `form`), `health/` (`index`,
`form`, `metric-form`, `consult-form`, `reminders`), `places/` (`index`, `[id]`, `form`), `cars/`
(`index`, `[id]`, `form`, `doc-form`, `fuel-form`, `maint-form`). Componentes só delas:
`HabitWeekStrip`, `HabitMonthHeatmap`, `places/PlaceOpinionsCard`, `PlaceCatalogSearch`,
`RecommendField`, `ScorePicker`.

Saúde tem 16 ocorrências de estilo à mão e carro 12 — as maiores do grupo.

## Decisões
- Mesma definição de "migrar" e densidade da 203.
- Cor de módulo pelos tokens da 201: hábitos/metas/lugares em `life`, saúde em `health`, carro em
  `car` (hoje parte disso é hex cravado).
- Heatmap de hábitos mantém o desenho da 098 (células pequenas, gap, legenda); só a escala de
  intensidade passa a derivar de `ModuleColors.life` por `hexAlpha`.

## Tarefas
- [x] Migrar `habits/index.tsx`, `habits/form.tsx`, `HabitWeekStrip`, `HabitMonthHeatmap`.
- [x] Migrar `goals/index.tsx`, `goals/form.tsx` (progresso de meta como barra nos tokens).
- [x] Migrar `health/index.tsx`, `form.tsx`, `metric-form.tsx`, `consult-form.tsx`,
      `reminders.tsx`.
- [x] Migrar `places/index.tsx`, `[id].tsx`, `form.tsx`, `PlaceOpinionsCard`,
      `PlaceCatalogSearch`, `RecommendField`, `ScorePicker`.
- [x] Migrar `cars/index.tsx`, `[id].tsx`, `form.tsx`, `doc-form.tsx`, `fuel-form.tsx`,
      `maint-form.tsx` (vencido/perto → `Badge` `destructive`/`warning`).
- [x] Acrescentar tudo acima a `MIGRATED` em `styleGuard.test.ts` e zerar as ocorrências.
- [x] Remover de `theme.ts` apelidos que tenham ficado sem uso (`rg` antes).
- [x] Rodar `cd mobile && npm test`, `npm run typecheck` e `npm run lint`.

## Prompts
- 02/10/26 — depois do fechamento da 204: "Arrocha" (seguir para a 205 sem conferir a 204 no
  aparelho antes).

## Notas
- **Caminho**: os codemods da 203/204 rodaram em sequência nos 29 arquivos da onda (de 393
  ocorrências da guarda para 38); o resto foi à mão. Nenhum `// token-livre` foi preciso.
- **Hábitos**: um acento só por hábito, `habitAccent` em `domain/habits/habitColors.ts` — verde de
  Vida (`ModuleColors.life`) no hábito normal e teal `chart6` no hábito a evitar (antes `#0D9488`
  cravado). O heatmap manteve o desenho da 098; `heatCellColor` deriva a escala de intensidade do
  acento por `hexAlpha` (28/50/70%, hoje em andamento 45%) e a falha de `destructive`
  (`missedTint`). Faixa da semana e check da lista usam o mesmo acento. Cabeçalho do heatmap usa
  `TypeScale.nano`. Teste: `habitColors.test.ts`.
- **Saúde**: tons das seções viraram token — Hoje `chart1`, Progresso `chart2`, Medicações a cor
  de módulo `health`, Consultas `primary`, Lembretes `warning`; check feito `success`.
- **Carro**: ícone do veículo na cor de módulo `car` (antes verde `#22A37A`). Vencido/perto viram
  `Badge` `destructive`/`warning` por `carAlertBadge` em `semanticTone.ts` — no cronograma, nas
  manutenções pendentes, nos documentos (status por `getDocumentAlerts`) e no contador de alertas
  da lista de veículos. A borda vermelha do item vencido saiu (o badge diz o mesmo).
- **Metas**: barra de progresso já estava nos tokens (`muted`/`primary`, `success` ao fechar);
  bloco "Meta ← saldo do mês" passou a `hexAlpha(primary)`; fundo dos modais `SCRIM`.
- **Botões à mão** (`Marcar tomada`, `Destinar`, `Criar aportes`, `Salvar km`) viraram `Button`
  com `loading`. "Encerrar medicação" usa `variant="destructive"` quando ativa.
- **Guarda mais estrita**: passou a pegar nome antigo dentro de `themeColor` condicional
  (`themeColor={x ? "danger" : …}`), que escapava — achou `cars/index.tsx`. Fora das ondas
  migradas sobra um caso em `travel/[id].tsx` (248).
- **Header nativo** em Syne (`HeaderTitle`) nos stacks de hábitos, metas, saúde, lugares e carro.
- **Apelidos de `theme.ts`**: nenhum pôde sair — ainda há uso nas ondas 248 e 207
  (`textSecondary` 231, `backgroundSelected` 69, `text` 40, `danger` 40, …).
- **Lint**: `npm run lint` continua sem analisar arquivo (config fora do caminho base); typecheck
  com `noUnusedLocals` cobre os imports mortos.
- Verificação: `npm test` 33 arquivos / 412 testes verdes; typecheck limpo; guarda 122/122; prova
  da guarda: `color: "#22A37A"` em `habits/index.tsx` → falha na linha plantada, desfeito → verde;
  `npx expo export --platform ios` gera o bundle.
- 2026-10-05 — concluída na limpeza dos `.md` a pedido do usuário ("Pode concluir direto"); conferência no celular fica com o usuário (ver Como testar).

## Como testar

1. **Pré-requisitos**
   - 204 implementada.
   - Conta com hábitos com check-ins, uma meta, medição de saúde, lugar visitado e veículo com
     documento e manutenção.

2. **Verificação automatizada**
   - `cd mobile && npm test` — `styleGuard.test.ts` passa com `habits`, `goals`, `health`,
     `places`, `cars` e os componentes da onda em `MIGRATED`.
   - Prova de que a guarda morde: acrescente `color: "#22A37A"` em `app/(app)/habits/index.tsx`
     → falha. Desfaça.
   - `npm run typecheck` e `npm run lint` sem erro.

3. **Verificação manual, passo a passo**
   1. Hábitos → faixa da semana e heatmap no verde de Vida do web; marcar check-in funciona.
   2. Metas → cards com barra de progresso; "Aportes mensais" continua lá.
   3. Saúde → cards e rosa de saúde do web; criar uma medição pelo formulário funciona.
   4. Lugares → lista e detalhe com opiniões; nota/recomendação editáveis.
   5. Carro → documento vencido com badge vermelho, perto de vencer com badge laranja; registrar
      abastecimento funciona.
   6. Repita 1, 3 e 5 no tema escuro.

4. **Casos de borda e caminhos negativos**
   - Hábito sem nenhum check-in → heatmap vazio legível, não sumido.
   - Veículo sem documento → estado vazio na seção.

5. **Sinais de que quebrou**
   - Heatmap todo da mesma cor → escala de intensidade não está aplicando `hexAlpha`.
   - Badge de vencimento cinza → status mapeado para a variante errada.
