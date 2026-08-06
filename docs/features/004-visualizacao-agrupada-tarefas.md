# 004 — Visualização agrupada de Tarefas (Hoje/Semana/Mês)

## Contexto
A lista atual de Tarefas (`/tasks`, `TaskList.tsx`) é uma lista plana filtrável por projeto/tag. O usuário quer uma segunda forma de ver as mesmas tarefas, agrupada por urgência (Hoje / Esta semana / Este mês), com um card de tarefa mais rico (prazo, ícone de recorrência, círculo de conclusão) e as tarefas recorrentes colapsadas numa linha só (não uma linha por ocorrência materializada, como a lista plana já faz). Mantém a lista plana como está — essa é uma visão nova, alternativa, não substitui a atual (decisão já tomada antes deste plano).

## Decisões
- **Onde mora**: aba nova em `/tasks`, reaproveitando o padrão de tabs já usado em `/finance/recurring` ("Registros" / "Projeção") — aqui vira "Lista" (atual, sem mudanças) / "Agenda" (nova). Sem rota nova, só estado local de aba selecionada.
- **Agrupamento** (por `due_date`, tarefas sem prazo ficam num grupo à parte):
  - **Atrasadas**: `due_date` no passado e `status !== "done"` — topo, sempre visível quando houver alguma.
  - **Hoje**: `due_date === hoje`.
  - **Esta semana**: `due_date` no resto da semana civil atual — cada tarefa mostra o dia da semana (ex. "Quinta").
  - **Este mês**: `due_date` no resto do mês civil atual.
  - **Mais tarde**: `due_date` além do mês atual.
  - **Sem prazo**: `due_date` nulo.
- **Uma linha por série recorrente, só nesta visão nova** (a lista plana `TaskList.tsx` continua mostrando cada instância materializada separadamente — não mexe nela). Para tarefa com `recurrence_rule` ou vinculada a uma Recorrência Financeira (`linked_recurring_id`), a Agenda mostra só a próxima ocorrência em aberto (`status !== "done"`, menor `due_date`) como linha representante, com ícone de recorrência. Clicar nela (ou num ícone de expandir) abre um drawer/dialog listando todas as ocorrências da série (passadas e futuras, com status de cada uma) — "ver as recorrências dela". Série sem nenhuma ocorrência em aberto (tudo concluído) não aparece na Agenda.
- **Card de tarefa**: círculo clicável à esquerda pra marcar concluída/reabrir direto na Agenda (fecha o gap encontrado na feature 002 — hoje só o Kanban tem essa ação, e exige projeto). Mostra prazo (`due_date`); se a tarefa já está concluída, mostra "Concluída em `completed_at`" no lugar do prazo. Badge do projeto (ou "Sem projeto") inline — sem sub-agrupamento aninhado por projeto, é só um rótulo no card (YAGNI).
- Toggle de conclusão nesta tela usa atualização otimista no estado local (mesmo princípio da feature 003 — evita o delay de um `load()` completo por clique).

## Tarefas
- [ ] Componente `TaskAgendaCard` (círculo de conclusão, prazo ou "Concluída em", badge de projeto, ícone de recorrência)
- [ ] Função de domínio pura para os buckets Atrasadas/Hoje/Esta semana/Este mês/Mais tarde/Sem prazo (testável com Vitest, mesmo padrão de `domain/tasks/filters.ts`)
- [ ] Função de domínio pura para colapsar instâncias de uma série recorrente na próxima ocorrência em aberto (testável)
- [ ] Aba "Agenda" em `TaskList.tsx` (tabs "Lista"/"Agenda", só estado local — sem rota nova)
- [ ] Drawer/dialog "Ver recorrências" listando todas as ocorrências de uma série (data + status de cada)
- [ ] Círculo de conclusão com atualização otimista (reverte + toast se a chamada falhar)
- [ ] `npm run build && npm run lint` limpos

## Notas
- Ambiguidade a confirmar com o usuário antes de implementar: "data de conclusão" no pedido original pode significar o prazo (`due_date`) ou a data em que foi de fato concluída (`completed_at`). Este plano assume os dois — prazo enquanto aberta, `completed_at` quando concluída — mas vale confirmar antes de codar.
- Depende indiretamente da feature 003 (mesmo princípio de atualização otimista) mas não depende do código dela — pode ser implementada em paralelo ou depois, sem bloqueio real.
