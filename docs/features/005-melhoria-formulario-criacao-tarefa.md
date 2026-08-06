# 005 — Melhoria do formulário de criação/edição de tarefa

## Contexto
O formulário de tarefa (`TaskList.tsx` e `ProjectKanban.tsx`) já tem as duas formas de recorrência (recorrência simples via "Repetir" + frequência, e vínculo a uma Recorrência Financeira), mas a UX ao redor disso está confusa e inconsistente entre os dois formulários.

## Problemas concretos hoje
- `ProjectKanban.tsx` não tem os controles de "Repetir"/frequência — só `TaskList.tsx` tem. Criar uma tarefa recorrente simples de dentro de um projeto (pelo Kanban) não é possível hoje.
- As duas formas de recorrência (`recurrence_rule` simples e `linked_recurring_id`) aparecem como dois controles empilhados sem deixar claro que são mutuamente exclusivas — nada no formulário explica "escolha uma das duas".
- Vincular a uma Recorrência Financeira já esconde os controles de Prazo/Repetir (via `!form.linked_recurring_id`), mas se o usuário tinha marcado "Repetir" antes de vincular, o checkbox continua marcado por baixo (só oculto) — ao desvincular depois, "Repetir" reaparece marcado sem o usuário ter feito nada, e sem explicação de por que sumiu/voltou (achado como Minor na revisão da feature 002).
- Nenhuma explicação visual de que, ao vincular, as datas passam a vir da Recorrência Financeira (não da tarefa).

## Decisões
- Substituir os dois controles soltos por um único grupo "Esta tarefa se repete?" com três opções mutuamente exclusivas (radio group ou segmented control, usando os componentes já existentes em `@/components/ui`): **Não** / **Recorrência simples** (mostra frequência) / **Vinculada a uma Recorrência Financeira** (mostra o select de Recorrência). Trocar de opção limpa os campos da(s) opção(ões) anterior(es) — nunca fica estado escondido por baixo.
- Adicionar o mesmo grupo (com recorrência simples, que hoje falta) em `ProjectKanban.tsx`, igualando com `TaskList.tsx`.
- Texto de apoio (`text-xs text-muted-foreground`, padrão já usado no app) abaixo da opção "Vinculada": "As datas dessa tarefa vêm das parcelas em aberto da Recorrência escolhida."
- Sem mudança de schema/API — é só reorganização de UI sobre os campos que já existem (`recurrence_rule`, `linked_recurring_id`).

## Tarefas
- [x] Componente compartilhado `TaskRecurrenceField` (grupo Não/Simples/Vinculada + textos de apoio) — usado pelos dois dialogs; ao contrário do campo de vínculo já duplicado entre os arquivos (decisão aceita na feature 002), este é novo e não tem convenção de duplicação prévia a seguir, então nasce compartilhado
- [x] Trocar os controles atuais de `TaskList.tsx` pelo componente novo
- [x] Adicionar o componente novo em `ProjectKanban.tsx` (recorrência simples chega nesse formulário pela primeira vez)
- [x] Trocar de opção limpa os campos da(s) opção(ões) anterior(es) (sem estado escondido)
- [x] `npm run build && npm run lint` limpos

## Notas
- Ao contrário das features 003/004, esta aqui introduz o primeiro componente de formulário genuinamente compartilhado entre `TaskList.tsx` e `ProjectKanban.tsx` — os dois arquivos historicamente duplicam o dialog inteiro por decisão explícita (feature 002). Vale confirmar com o usuário se a duplicação continua sendo a convenção preferida mesmo aqui, ou se abrir essa exceção é aceitável.
- Pequeno desvio do texto do plano: o campo "Prazo" também foi movido para dentro do `TaskRecurrenceField`, junto com o grupo Não/Simples/Vinculada, em vez de ficar como campo solto ao lado. Motivo: a visibilidade do Prazo já dependia do modo (some quando vinculada, já que as datas vêm da Recorrência) — mantê-lo fora do componente exigiria a mesma condição duplicada nos dois formulários, exatamente o tipo de duplicação que este componente existe para evitar.
- Efeito colateral bom: como o componente só limpa `recurrence_rule`/`linked_recurring_id` quando o usuário troca de opção ativamente (não ao montar o formulário), o bug da feature 002 ("Repetir" reaparecia marcado ao desvincular) não se repete — não existe mais estado de "Repetir" escondido por baixo enquanto vinculada.
- Bug real encontrado na verificação manual: `mode` era derivado só a partir de `recurrence_rule`/`linked_recurring_id` presentes no valor atual — clicar em "Recorrência simples" antes de definir um Prazo não tinha efeito visível nenhum (o botão não ficava selecionado), porque sem `due_date` o componente não tinha como preencher `recurrence_rule`, então o modo derivado continuava "Não". Corrigido tornando `mode` um estado próprio do componente (inicializado a partir das props, mas não recalculado a cada mudança de valor), decidido independentemente de `due_date` já estar preenchido ou não.
- Verificação manual no navegador nos dois formulários (`TaskList.tsx` e `ProjectKanban.tsx`): grupo Não/Simples/Vinculada alterna corretamente, hint "Defina um prazo para poder repetir." aparece sem prazo, frequência aparece ao definir prazo, trocar para "Vinculada" limpa Prazo/Frequência, voltar para "Não" limpa o vínculo — sem estado escondido em nenhuma combinação testada. `ProjectKanban.tsx` confirmado com o grupo completo (recorrência simples chegando pela primeira vez nesse formulário).
