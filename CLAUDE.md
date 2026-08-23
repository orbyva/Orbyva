# Orbyva

Stack e convenções fixas: `docs/stack.md`.

## Skills

`pipeline`, `next`, `plan` e `quick-code` são mantidas em `~/.claude/skills` (raiz do usuário) — não
neste repositório. Busque a skill primeiro na raiz do usuário; só carregue uma versão local em
`.claude/skills/` deste repo se ela existir e for mais específica. Se este repo for clonado numa
máquina sem `~/.claude/skills/{pipeline,next,plan,quick-code}` populado, sincronize essa pasta antes
de usar `/pipeline`, `/next`, `/plan` ou `/quick-code`.

`quick-code` é o atalho fora da esteira: alteração pequena e de baixo risco vai direto no código, sem
arquivo em `docs/features/`. O fluxo abaixo vale para feature de verdade.

## Fluxo de trabalho

Toda feature tem um arquivo `NNN-nome.md`, organizado por status em `docs/features/todo/`,
`docs/features/in-progress/` ou `docs/features/done/` (não solto em `docs/features/`).

Há também `docs/features/to-refine/`: descrições brutas que o usuário joga lá, sem formato nem
número. Elas não são features prontas — precisam ser refinadas (via template) para virar um
`NNN-nome.md` em `todo/`. Quem faz isso é a esteira `/pipeline` (`~/.claude/skills/pipeline/SKILL.md`):
um orquestrador em loop que delega o refino de cada doc de `to-refine/` a um subagente, delega a
implementação das features de `todo/`/`in-progress/` a outro (um por vez), pergunta ao usuário quando
há decisão e, sem resposta em 1 minuto, segue com a opção recomendada. A esteira só para quando
`to-refine/`, `todo/` e `in-progress/` estiverem vazios.

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

Toda feature carrega o prompt que a originou, obrigatoriamente:
- O frontmatter `prompt:` (topo do arquivo) guarda o prompt verbatim do usuário que gerou a
  feature — é a instrução-mãe, fonte da verdade do que "cumprir a feature" significa.
- A seção `## Prompts` é um log obrigatório: todo pedido do usuário que adiciona ou muda
  tarefas no meio da implementação (não desvio próprio — isso é `## Notas`) entra ali,
  verbatim, com data, antes das tarefas que ele gerou.
- Sem esse rastro não tem como reconstruir depois por que uma tarefa existe — nunca pule.

Durante:
4. Implemente uma tarefa por vez, na ordem da lista — `/next NNN` pega a próxima `- [ ]`.
5. Só marque `- [x]` depois que a verificação passar (`npm run build`, `npm run lint`, teste relevante). Tarefa não verificada continua `- [ ]`.
6. Terminou e verificou uma tarefa? Não pare para confirmar — já parta para a próxima `- [ ]` da lista, sem esperar o usuário mandar seguir. Só pare de verdade quando a lista acabar, travar em algo que precise de decisão do usuário, ou uma verificação falhar sem conserto óbvio.
7. Desviou do plano, ou encontrou um bug real no meio do caminho? Escreva uma linha em Notas dizendo o quê e por quê — é o contexto que se perde entre sessões.
8. Lista zerou (nenhuma `- [ ]` sobrando)? Antes de mover para `done/`, releia o `prompt:` do
   frontmatter + `## Prompts` e confirme de verdade — não só "todas as caixinhas marcadas" —
   que o pedido original foi cumprido. Se faltou algo, não mova para `done/`: crie novas
   tarefas no mesmo arquivo e continue implementando até a checagem passar.

Não leia `docs/` inteiro. Não crie arquivo de feature sem o usuário pedir.

Ideias ainda não especificadas (sem Contexto/Decisões/Tarefas definidos) ficam em `docs/coworking.md`, `docs/improve.md` ou `docs/planning-features.md` — viram `docs/features/todo/NNN-nome.md` só quando alguém decide implementar.

## Banco de dados

`supabase db push` aplica ao banco remoto (não há Supabase local neste projeto) — sempre confirmar com o usuário antes de rodar. Migrations nunca compartilham timestamp (já causou um bug real de bookkeeping do CLI — ver Notas de `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`).
