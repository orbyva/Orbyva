# Orbyva

Stack e convenções fixas: `docs/stack.md`.

## Fluxo de trabalho

Toda feature tem um arquivo em `docs/features/NNN-nome.md`.

Antes de implementar:
1. Leia o arquivo da feature. Só ele, não a pasta inteira.
2. Se não existir, crie com `/plan <descrição>` (usa `docs/features/_template.md`) e pare para o usuário revisar as tarefas antes de codar.

Durante:
3. Implemente uma tarefa por vez, na ordem da lista — `/next NNN` pega a próxima `- [ ]`.
4. Só marque `- [x]` depois que a verificação passar (`npm run build`, `npm run lint`, teste relevante). Tarefa não verificada continua `- [ ]`.
5. Desviou do plano, ou encontrou um bug real no meio do caminho? Escreva uma linha em Notas dizendo o quê e por quê — é o contexto que se perde entre sessões.

Não leia `docs/` inteiro. Não crie arquivo de feature sem o usuário pedir.

Ideias ainda não especificadas (sem Contexto/Decisões/Tarefas definidos) ficam em `docs/coworking.md`, `docs/improve.md` ou `docs/planning-features.md` — viram `docs/features/NNN-nome.md` só quando alguém decide implementar.

## Banco de dados

`supabase db push` aplica ao banco remoto (não há Supabase local neste projeto) — sempre confirmar com o usuário antes de rodar. Migrations nunca compartilham timestamp (já causou um bug real de bookkeeping do CLI — ver Notas de `docs/features/002-vinculo-tarefa-recorrencia-financeira.md`).
