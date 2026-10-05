---
prompt: |-
  Pedido do usuário, verbatim (02/10/26):

  Eu queria também melhorar o front do mobile. To achando muito, sei lá. Deixar algo mais parecido com o web, sabe?
  Sim (fundação primeiro, telas em ondas, navegação por último)
  Vamos trabalhar só na melhora do front mobile
  pode arrochar

  Respostas do planning: ondas Finanças → Produtividade → Vida → Conteúdo e viagens → Conta,
  login e Orb (P3); densidade aproximada do web — cards com padding 16, gap de lista 8, header de
  tela mais baixo — conferida com o usuário ao fim da onda 1 antes de replicar (P4); teste-guarda
  de arquivos impede a deriva (P1).

  Fatia desta feature — onda 1: as telas de Finanças e os componentes que só elas usam passam a
  usar as primitivas e tokens; nasce o teste-guarda; fecha com a conferência de densidade.
---

# 203 — Mobile, onda 1: Finanças

## Contexto
Depende de 202 (primitivas) e 201 (tokens).

Finanças é o grupo com mais estilo à mão (38 ocorrências de hex ou `fontSize` numérico só em
`app/(app)/finance/`) e o módulo de uso diário. Telas: `finance/index.tsx` (dashboard),
`transactions.tsx`, `recurring.tsx`, `budget.tsx`, `categories.tsx`, `form.tsx`,
`recurring-form.tsx`, `budget-form.tsx`, `category-form.tsx`. Componentes só delas:
`TransactionsList`, `MonthLedger`, `RecurringList`, `RecurringProjection`, `RecurringSummary`,
`BudgetList`, `LedgerClassField`, `ClassSearchPicker`, `ClassDragRow`, `TypeIcon`, `InsightsStrip`,
`charts/DonutChart`, `charts/NatureLineChart`. Compartilhados que entram aqui por serem tocados
primeiro: `ChipBar`, `ChoiceChip`, `FilterSelect`, `SearchField`, `DateField`, `SelectListModal`,
`StringSelectModal`.

## Decisões
- O que é migrar: trocar botão/input/chip/card/linha montados à mão pela primitiva; cor hex e
  `rgba(...)` literais por token (`useTheme()`/`ModuleColors`); `fontSize`/`fontWeight`/
  `fontFamily` por `ThemedText type` ou `TypeScale`; `Radius.card|input|control|chip` pelos nomes
  novos; apelidos de cor (`textSecondary`, `backgroundSelected`, …) pelos nomes do web.
- Densidade (P4): card com padding 16; gap 8 entre linhas de lista e 12 entre cards; bloco de
  título da tela via `ScreenHeader` (mais baixo que os heros atuais). Valores ficam em `Spacing`
  (`theme.ts`), não espalhados.
- Comportamento não muda: mesmos dados, mesmas ações, mesma navegação. Diferença de comportamento
  encontrada no caminho vai para `## Notas`, não é corrigida aqui.
- **Teste-guarda**: lista explícita de arquivos migrados; falha em hex, `rgb(a)(`, `fontSize:` com
  número, `fontWeight:` e `fontFamily:` nesses arquivos. Exceção só com comentário
  `// token-livre: <motivo>` na mesma linha (ex.: cor de série de gráfico vinda do dado). As ondas
  seguintes só acrescentam caminhos à lista.
- `components/share/*` (cards de story exportados como imagem) ficam fora da guarda nesta série:
  as cores deles são da arte da imagem, não do tema.

## Tarefas
- [x] Criar `mobile/src/domain/ui/__tests__/styleGuard.test.ts`: `MIGRATED` (array de caminhos
      relativos a `mobile/src`, arquivos ou pastas) e, para cada `.tsx`/`.ts` coberto, falha
      listando `arquivo:linha` de cada ocorrência de `/#[0-9A-Fa-f]{3,8}\b/`, `/rgba?\(/`,
      `/fontSize:\s*\d/`, `/fontWeight:/`, `/fontFamily:/` — exceto linhas com
      `// token-livre:` seguido de texto. Começa com `components/ui` (inclusive o que a 202 criou).
- [x] Migrar os compartilhados `ChipBar`, `ChoiceChip`, `FilterSelect`, `SearchField`,
      `DateField`, `SelectListModal`, `StringSelectModal` (chips → `Chip`, campos → `Input`/`Sheet`)
      e acrescentá-los a `MIGRATED`.
- [x] Migrar `finance/index.tsx` (dashboard: KPIs em `Card` com valor em `ThemedText type="value"`,
      `ScreenHeader`), `InsightsStrip`, `charts/DonutChart` e `charts/NatureLineChart` (cores das
      séries de `chart1`…`chart6` e de `success`/`destructive`).
- [x] Migrar `transactions.tsx`, `TransactionsList`, `MonthLedger` (linhas → `ListRow`, valores
      com cor `success`/`destructive`, cabeçalhos de dia em `micro` `mutedForeground`).
- [x] Migrar `recurring.tsx`, `RecurringList`, `RecurringProjection`, `RecurringSummary`
      (Receber/Pagar em `Card` com `Badge`, abas Lista/Projeção → `Tabs`).
- [x] Migrar `budget.tsx`, `BudgetList` (gasto/teto mantendo destaque e cor por estouro) e
      `categories.tsx`, `ClassDragRow`, `TypeIcon`.
- [x] Migrar os formulários `form.tsx`, `recurring-form.tsx`, `budget-form.tsx`,
      `category-form.tsx`, `LedgerClassField`, `ClassSearchPicker` (campos → `Input`/`Label`,
      botões → `Button`; `FormButton` não aparece mais em Finanças).
- [x] Acrescentar `app/(app)/finance` e todos os componentes desta onda a `MIGRATED`; rodar o
      teste-guarda e zerar as ocorrências.
- [x] Remover de `theme.ts` qualquer apelido de cor ou de raio que tenha ficado sem uso no app
      inteiro (`rg` antes de remover).
- [x] Rodar `cd mobile && npm test`, `npm run typecheck` e `npm run lint`.
- [x] **Conferência de densidade com o usuário (P4)**: pedir que ele abra Finanças no celular e
      diga se o espaçamento ficou certo; registrar a resposta verbatim em `## Prompts` e, se ele
      pedir ajuste, aplicar em `Spacing`/primitivas antes de fechar. A 204 não começa sem essa
      resposta.

## Prompts
- 02/10/26 — conferência de densidade (P4): "Gostei cara. Mas os cards do Dash ficou zoado."
- 02/10/26 — o que ficou zoado nos cards do dash: "Valor com tamanho desigual entre os cards, ou pequeno/grande demais" (opção escolhida).
- 02/10/26 — depois do ajuste dos KPIs: "Agora ficou bom demais. Bora avançar"

## Notas
- **Guarda**: além das regras planejadas, ganhou "nome de tema anterior à 201" (também entre aspas),
  "raio anterior à 201" e "raio numérico" (`borderRadius` ≥ 6 sem `Radius`; 5 ou menos fica, são
  barras finas). Prova de que morde: linha com `"#123456"` e `borderRadius: 16` acrescentada ao fim de
  `budget.tsx` → falha apontando `budget.tsx:610` nas duas regras; desfeito, 51/51 verdes.
- **Cor com significado** saiu das telas para `domain/ui/semanticTone.ts` (`budgetStatusTone`,
  `natureTone`, `netTone`), testado em `semanticTone.test.ts`. Investimento usa `chart6` (teal do web)
  no lugar do `#0F766E` fixo.
- **`DonutChart`**: as constantes `CHART_INCOME`/`CHART_EXPENSE`/`CHART_FALLBACK` sumiram; série
  sem cor usa `mutedForeground`, receita/despesa no `NatureLineChart` usam `success`/`destructive`.
- **Primitivas novas**: `ToggleRow` (`Switch` nativo no lugar do "pontinho" feito à mão, usado no
  `budget-form`) e `Field` (rótulo + asterisco + dica + erro). `SearchField` foi reescrito sobre o
  resolvedor do `Input` (borda que acende ao focar) e aceita as props do `TextInput`; toda busca
  da onda passou a usá-lo.
- **`ChipBar`** manteve a API (30 arquivos usam): até 4 opções vira `Tabs`, acima disso `Chip`. A
  troca Lista/Projeção de Recorrências virou o segmento do web por esse caminho. `ChoiceChip` usa
  o mesmo resolvedor do `Chip` (mantém toque longo, que o `Chip` não tem).
- **`ScreenHeader` não entrou no dashboard**: o header nativo do stack já mostra "Finanças"; um
  bloco de título no conteúdo duplicaria. Em vez disso, o título do header nativo passou para Syne
  (`HeaderTitle` em `typography.ts`, aplicado no `finance/_layout.tsx`). O header muda de verdade
  na rodada de navegação.
- **KPIs** do dashboard: `Card` com faixa de cor à esquerda, rótulo `micro` e valor em Syne.
  Primeira versão usava `type="value"` com `adjustsFontSizeToFit` e o `Card` sem padding (o
  container do `Card` não tem padding próprio, só `CardHeader`/`CardContent`): cada valor encolhia
  sozinho e ficava colado na borda — o usuário apontou "valor com tamanho desigual". Ajuste: padding
  16 no card e um tamanho único para os quatro valores, calculado por `sharedValueSize`
  (`domain/ui/fitText.ts`) a partir da largura do card e do valor mais largo. A largura vem do
  avanço real de cada caractere em Syne 700, lido do `hmtx` do TTF (tabela em `fitText.ts`); num
  iPhone de 390 pt, R$ 12.345,67 fica em ~20 pt, todos os quatro iguais. Testado em `fitText.test.ts`.
- **`ListRow` não entrou em `TransactionsList`/`MonthLedger`**: as linhas têm duas linhas de texto,
  badge de natureza e ações de editar/excluir; o `ListRow` não comporta isso sem virar outra coisa.
  Ficaram dentro do `Card` com separador hairline, já em tokens.
- **Receber/Pagar** (`RecurringSummary`) ficou como bloco tingido com borda (em tokens: `success`/
  `destructive`, `micro`, `heading`, `Radius.xl`) em vez de `Card` + `Badge`: o bloco já faz o papel
  de destaque e o `Badge` repetiria a cor do valor logo abaixo.
- **Estados vazios** de Transações, Recorrências, Orçamento e Categorias usam `EmptyState`.
- **Apelidos de `theme.ts`**: nenhum pôde sair — `text` (487 usos), `textSecondary` (542),
  `backgroundSelected` (121), `backgroundElement` (91), `danger` (38), `surface` (20) e
  `Radius.card/input/control/chip` (16) ainda aparecem nas ondas 204–207. `choiceChipColors`
  (`lib/color.ts`) também fica: usado pelos modais de seleção e pelo formulário de tarefas.
- **`noUnusedLocals`** ligado no `tsconfig` do mobile: o lint não analisa arquivo nenhum (já era
  assim antes da 201) e import morto de troca passava batido. Ligar exigiu tirar 19 imports sem uso
  no app (15 fora de Finanças, só a linha do import).
- **Scripts de migração** em `mobile/scripts/` (descritos em `docs/stack.md`); Prettier não existe
  no projeto, então os codemods já escrevem JSX indentado.
- Background dos campos mudou de `muted` cheio para transparente com borda `input` — é o visual do
  `Input` do web (`border-input bg-transparent`).
- Verificação: `npm test` 28 arquivos / 313 testes verdes; `npm run typecheck` limpo; `npx expo
  export --platform ios` gera o bundle (6,9 MB); `npm run lint` roda sem erro mas não cobre nada.
- 2026-10-05 — movida para `done/` na limpeza dos `.md`: todas as tarefas `[x]` e conferência no
  aparelho já aprovada pelo usuário em 02/10 ("Agora ficou bom demais. Bora avançar").

## Como testar

1. **Pré-requisitos**
   - 201 e 202 implementadas.
   - App no simulador ou celular, logado numa conta com lançamentos, recorrências e orçamento.

2. **Verificação automatizada**
   - `cd mobile && npm test` — `styleGuard.test.ts` passa com `app/(app)/finance`,
     `components/ui` e os componentes da onda na lista.
   - Prova de que a guarda morde: em `app/(app)/finance/budget.tsx`, acrescente
     `style={{ color: "#123456" }}` num texto → o teste falha apontando `budget.tsx:<linha>`.
     Desfaça.
   - `npm run typecheck` e `npm run lint` sem erro.

3. **Verificação manual, passo a passo**
   1. Abra Finanças → título do header em Syne, KPIs em cards brancos com cantos de 12 e faixa de cor à
      esquerda, valores grandes em Syne; receita verde, despesa vermelha.
   2. Abra Transações → linhas uniformes (mesma altura, mesmo recuo), cabeçalho de dia pequeno e
      cinza, espaço de 8 entre linhas.
   3. Abra Recorrências → Receber/Pagar em destaque; a troca Lista/Projeção é um segmento igual ao
      do web.
   4. Abra Orçamento → gasto e teto visíveis, categoria estourada em vermelho.
   5. Crie um lançamento pelo formulário → campos com rótulo acima, borda que fica azul ao focar,
      botão Salvar azul cheio. O lançamento aparece em Transações.
   6. Repita 1–4 no tema escuro.
   7. Compare Finanças do app com Finanças do web lado a lado → mesma paleta, mesma fonte, mesma
      "cara" de card e botão, mesmo sem o layout ser idêntico.

4. **Casos de borda e caminhos negativos**
   - Mês sem lançamentos → estado vazio com `EmptyState`, não uma tela em branco.
   - Descrição de lançamento muito longa → trunca em uma linha, valor não é empurrado para fora.
   - Formulário com erro (valor vazio) → campo com borda vermelha e mensagem abaixo.

5. **Sinais de que quebrou**
   - Uma tela de Finanças ainda com fonte do sistema ou cantos de 16 → arquivo esquecido fora de
     `MIGRATED`.
   - Tela de outro módulo mudou de aparência de forma estranha → um compartilhado migrado
     (`ChipBar`, `FilterSelect`…) mudou de API; os usos fora de Finanças precisam continuar
     funcionando.
   - Gráfico sem cor em um dos temas → série lendo um apelido removido.
