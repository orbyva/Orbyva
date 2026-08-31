---
prompt: |
  o calendário, ao adicionar o prazo está muito grande
---

# 041 — Calendário compacto no quick-edit de prazo

## Contexto
`TaskDueQuickEdit.tsx` (feature `done/031`) abre um popover com `InlineCalendarPicker`
(`src/components/DatePicker.tsx`) direto — sem o botão/trigger intermediário do `DatePicker`
completo — pra editar o prazo de uma tarefa sem sair da Lista/Kanban. `InlineCalendarPicker`
reaproveita o componente base `Calendar` (`src/components/ui/calendar.tsx`, wrapper de
`react-day-picker`), que usa células de dia de `size-9` (36px), navegação de mês com botões
`size-8`, padding `p-3`, mais o rodapé "Hoje"/"Limpar". Esse tamanho foi pensado pro `DatePicker`
completo (usado no form de tarefa, aba "Data e repetição", `TaskRecurrenceField.tsx`, e em
outros formulários do app como Recorrência Financeira) — onde há espaço de sobra.

Dentro do popover compacto de `TaskDueQuickEdit` (que já tem horário + duração embaixo do
calendário, feature `031`), esse mesmo tamanho fica grande demais pro contexto de edição rápida
inline — pedido do usuário: reduzir o calendário especificamente nesse fluxo.

## Decisões
- **Escopo: só o contexto de quick-edit** (`TaskDueQuickEdit`), não o `DatePicker`/formulário
  completo. Blast radius menor, consistente com o recorte que a própria feature `031` já usou
  ("só `TaskDueQuickEdit.tsx`... o form completo fica fora"). Se o usuário quiser o calendário
  compacto também no form completo depois, isso é um pedido novo (registrar em `## Prompts`
  quando vier), não assumir agora.
- `InlineCalendarPicker` ganha uma prop nova `size?: "default" | "compact"` (default
  `"default"`, preservando o comportamento/visual atual de `DatePicker`) — quando `"compact"`,
  aplica classes menores: células de dia (`day_button`) de `size-9` pra algo como `size-7`,
  botões de navegação de mês (`size-8`) pra `size-7`, `weekday` mais estreito (acompanhando a
  largura da célula), padding do `Calendar` (`p-3`) reduzido, e o rodapé "Hoje"/"Limpar" com
  altura menor (`size="sm"` já é usado; considerar reduzir ainda mais o padding vertical).
  Ajustar os valores exatos na implementação, mantendo a grade legível/clicável (não reduzir a
  ponto de ficar difícil de tocar).
- `TaskDueQuickEdit` passa `size="compact"` pro `InlineCalendarPicker`; `DatePicker` (usado por
  `TaskRecurrenceField`/outros formulários) continua sem passar a prop, preservando o tamanho
  atual — nenhuma mudança visual fora do quick-edit.
- Como essa mudança é só CSS/classes (não há comportamento de interação diferente entre os dois
  tamanhos — mesma navegação, mesma seleção, mesmo "Hoje"/"Limpar"), a prova automatizada
  proporcional é testar que o modo `"compact"` aplica as classes menores esperadas e que o modo
  `"default"` (ou omitido) preserva as classes atuais — não uma tarefa de "olhar se ficou bonito".

## Tarefas
- [x] Em `InlineCalendarPicker` (`src/components/DatePicker.tsx`), adicionar prop `size?:
      "default" | "compact"` (default `"default"`) e aplicar classes reduzidas (dia, navegação,
      padding, rodapé) via `classNames`/wrapper quando `"compact"`, preservando as classes atuais
      quando `"default"`.
- [x] Em `TaskDueQuickEdit.tsx`, passar `size="compact"` na chamada de `InlineCalendarPicker`.
- [x] Conferir visualmente no código que `DatePicker` (usado em `TaskRecurrenceField.tsx` e nos
      outros formulários que o importam) não recebeu a prop nova e continua renderizando com o
      tamanho `"default"` — sem regressão fora do quick-edit.
- [x] Teste de componente (Testing Library/jsdom, seguir padrão de
      `src/pages/admin/tasks/__tests__/`): renderizar `InlineCalendarPicker` com `size="compact"`
      e sem a prop, e comparar que as classes de tamanho de célula/navegação aplicadas são
      diferentes entre os dois casos (prova que o modo compacto de fato reduz o tamanho, sem
      depender de inspeção visual).
- [x] `npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run lint && npm test`.

## Prompts

## Notas
- `size="compact"` em `InlineCalendarPicker`: dia `size-9 → size-7` (+ `text-xs`), nav de mês
  `size-8 → size-7`, `weekday` `w-9 → w-7`, padding do `Calendar` `p-3 → p-1.5`, rodapé
  `p-2 → p-1.5` com botões `h-7`/ícone `Limpar` menor (`h-3.5 w-3.5 → h-3 w-3`). Sem mudança de
  comportamento (mesma navegação/seleção), só classes — coberto por
  `src/components/__tests__/DatePicker.test.tsx` comparando as classes aplicadas nos dois modos.
- `DatePicker` (usado por `TaskRecurrenceField` e todos os outros formulários) chama
  `InlineCalendarPicker` sem passar `size` (`src/components/DatePicker.tsx:220`), então continua
  em `"default"` — confirmado por leitura de código, sem precisar de teste adicional (não há
  outro call-site de `InlineCalendarPicker` fora de `DatePicker` e `TaskDueQuickEdit`).
- `npm test` completo: 2 falhas pré-existentes e não relacionadas em
  `src/lib/__tests__/currency.test.ts` (`formatDateBR`/`formatDateTimeBR` esperam `"—"`, código
  retorna `"·"` desde o commit `53a6da39` de 2026-08-12, antes desta sessão). Não é código
  adjacente tocado por esta feature (calendário/`InlineCalendarPicker`/`TaskDueQuickEdit`) — fora
  de escopo, não corrigido aqui. Resto da suíte: 666/668 testes passando, incluindo os 3 novos
  deste arquivo.
