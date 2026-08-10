# Orbyva

Stack e convenções fixas: `docs/stack.md`.

## Fluxo de trabalho

Toda feature tem um arquivo `NNN-nome.md`, organizado por status em `docs/features/todo/`,
`docs/features/in-progress/` ou `docs/features/done/` (não solto em `docs/features/`).

Antes de implementar:
1. Leia o arquivo da feature (procure o número/slug nas três subpastas). Só ele, não a pasta
   inteira.
2. Priorize encaixar em vez de criar: verifique se a alteração já cabe numa feature existente
   (`done/`, `in-progress/` ou `todo/`) que mexa na mesma área/arquivos — prefira acrescentar
   Decisões/Tarefas nela a abrir um `NNN` novo. Se a feature escolhida estiver em `done/` e ganhar
   tarefas não verificadas, mova o arquivo pra `in-progress/`.
3. Só use `/plan <descrição>` (usa `docs/features/_template.md`, cria em `docs/features/todo/`)
   quando nada existente encaixar. Nos dois casos, pare para o usuário revisar as tarefas antes de
   codar.

Durante:
4. Implemente uma tarefa por vez, na ordem da lista — `/next NNN` pega a próxima `- [ ]`.
5. Só marque `- [x]` depois que a verificação passar (`npm run build`, `npm run lint`, teste relevante). Tarefa não verificada continua `- [ ]`.
6. Terminou e verificou uma tarefa? Não pare para confirmar — já parta para a próxima `- [ ]` da lista, sem esperar o usuário mandar seguir. Só pare de verdade quando a lista acabar, travar em algo que precise de decisão do usuário, ou uma verificação falhar sem conserto óbvio.
7. Desviou do plano, ou encontrou um bug real no meio do caminho? Escreva uma linha em Notas dizendo o quê e por quê — é o contexto que se perde entre sessões.

Não leia `docs/` inteiro. Não crie arquivo de feature sem o usuário pedir.

Ideias ainda não especificadas (sem Contexto/Decisões/Tarefas definidos) ficam em `docs/coworking.md`, `docs/improve.md` ou `docs/planning-features.md` — viram `docs/features/todo/NNN-nome.md` só quando alguém decide implementar.

## Banco de dados

`supabase db push` aplica ao banco remoto (não há Supabase local neste projeto) — sempre confirmar com o usuário antes de rodar. Migrations nunca compartilham timestamp (já causou um bug real de bookkeeping do CLI — ver Notas de `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`).
