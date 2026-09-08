---
name: pipeline
description: Roda a esteira autônoma de features — refina docs de to-refine em planning (docs/in-planning/), delega implementação a subagentes e só para quando to-refine, todo e in-progress esvaziarem (attack pra virar feature é sempre manual)
disable-model-invocation: false
---

Você é o orquestrador da esteira de features. Rode em loop dinâmico (`ScheduleWakeup` com `prompt: "/pipeline"`) até a condição de parada. Você não refina nem implementa nada diretamente — só delega para subagentes e coordena.

## Ciclo (execute a cada acordada)

1. Liste `docs/features/to-refine/`, `docs/features/todo/` e `docs/features/in-progress/` (ignore `.gitkeep`).

2. **Refino** — para cada arquivo em `to-refine/` sem agente de refino já rodando: lance um agente (`general-purpose`, em background) instruído a seguir a skill `refine` (`~/.claude/skills/refine/SKILL.md`) **à risca**, apontando o arquivo específico de `to-refine/` que ele deve processar. Não resuma a skill no prompt do agente; aponte pra ela e deixe ele ler. O resultado é um arquivo de **planning** em `docs/in-planning/`, não uma feature — `refine` nunca escreve em `docs/features/todo/`.

   Refinos podem rodar vários em paralelo (um arquivo de `to-refine/` por agente, pra não colidirem).

3. **Implementação** — no máximo UM agente implementador por vez (mais de um gera conflito de arquivos/git). Se nenhum estiver rodando e houver feature em `in-progress/` (prioridade) ou `todo/`: escolha a de menor número e lance um agente (`general-purpose`, em background) instruído a seguir a skill `next` (`~/.claude/skills/next/SKILL.md`) **à risca** para aquele arquivo — inclusive a regra de verificação por código (nunca Chrome) e a checagem de satisfação com rastreabilidade + suíte completa antes de mover pra `done/`. Não resuma essas regras no prompt do agente; aponte pra skill e deixe ele ler o arquivo — resumir aqui é como elas voltam a divergir. Instrua o agente: se travar numa decisão que seria do usuário, ele NÃO decide — reporta a dúvida com opções e uma recomendada, e para; você trata isso como decisão pendente (passo 4).

4. **Decisões (timeout de 1 minuto)** — sempre que precisar de decisão do usuário (dúvida sua ou reportada por subagente, ou "feature concluída, qual o próximo passo?"):
   - Escreva a pergunta no texto da resposta, com as opções e a **Recomendada:** claramente marcada.
   - NÃO bloqueie esperando (não use AskUserQuestion). Agende `ScheduleWakeup` com `delaySeconds: 60`.
   - Na acordada, se o usuário não respondeu, execute a opção recomendada e siga com a esteira. Se respondeu, siga a resposta dele.

5. **Ritmo** — a conclusão de subagentes te notifica automaticamente; processe na hora (refino concluído → planning novo em `docs/in-planning/`, sem ação adicional sua — não dispara implementação; implementação concluída → lance a próxima). Entre eventos, mantenha um wakeup de segurança agendado (60s quando há decisão pendente; ~300s como heartbeat quando só está monitorando subagentes).

## Parada

Encerre o loop (`ScheduleWakeup` com `stop: true`) quando `to-refine/`, `todo/` e `in-progress/` estiverem todos vazios E nenhum subagente estiver rodando. Concluir uma feature não é parada — é gatilho para pegar a próxima.

Esse estado não significa necessariamente que não sobrou trabalho: refino agora produz arquivos em `docs/in-planning/`, e esta esteira **nunca** roda `attack` sozinha — virar planning em feature é sempre decisão manual do usuário, arquivo por arquivo. Ao parar, se houver arquivos em `docs/in-planning/` sem entrada em `## Attacks` (planos novos, ainda não atacados), diga isso claramente na mensagem final — são planos prontos pra iteração ou `/attack`, não um sinal de que não há mais nada a fazer.

Regra geral de ociosidade: nunca fique parado esperando input do usuário por mais de 1 minuto — apresente a recomendação, agende a acordada de 60s e, sem resposta, continue a esteira sozinho.
