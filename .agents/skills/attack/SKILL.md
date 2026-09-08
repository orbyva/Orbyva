---
name: attack
description: Quebra um arquivo de planning maduro em docs/in-planning/ em uma ou mais features sequenciadas (com dependências) em docs/features/todo/ — só ela cria features a partir de planning, nunca automático
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep
---

Ache o arquivo cujo número/slug bate com `$ARGUMENTS` em `docs/in-planning/`.

Leia o arquivo inteiro: `prompt:`, Contexto, Definições, Estrutura, Decisões, Perguntas em aberto, Prompts e Attacks.

**Se `## Perguntas em aberto` tiver algum item não resolvido**, pare antes de gerar qualquer feature: liste as perguntas para o usuário, com uma recomendação para cada quando você tiver uma opinião formada, e peça confirmação — atacar um plano com lacunas reais produz features malformadas. Só prossiga sem perguntar se o usuário já confirmou explicitamente, neste pedido, que quer atacar mesmo assim.

**Se `## Attacks` já tiver entradas**, releia-as antes de decompor: não regenere features para partes do plano já atacadas anteriormente — decomponha só o que é novo ou mudou desde o último ataque. Se Decisões/Estrutura mudaram de um jeito incompatível com features já geradas (inclusive as que já estão em `todo/`, `in-progress/` ou `done/`), avise o usuário da divergência em vez de gerar silenciosamente algo conflitante.

Explore o código relevante antes de decompor — mesma régua da skill `plan`: planeje como um engenheiro sênior desenharia o escopo, com edge cases e testes como tarefas de primeira classe, não adendo.

## Decompondo em features

Quebre a Estrutura do plano em uma ou mais features, cada uma um arquivo `docs/features/todo/NNN-<slug>.md` no formato padrão (`docs/features/_template.md`): frontmatter `prompt:`, Contexto, Decisões, Tarefas (no máximo meia hora cada, granular — prefira mais tarefas pequenas a poucas grandes e vagas), Notas vazio, Prompts vazio.

- **Sequência e dependências**: identifique a ordem de implementação real (o que precisa existir antes de outra coisa fazer sentido). Numere os arquivos NNN respeitando essa ordem — número menor implementa primeiro, já que `next` e `pipeline` sempre pegam o menor número disponível. Na primeira linha do `## Contexto` de cada arquivo gerado, declare a dependência explicitamente: `Depende de: 0xx, 0yy.` ou `Sem dependências — pode ser implementada em paralelo com 0zz.`
- **`prompt:` de cada feature**: não copie o plano inteiro. Sintetize, verbatim onde possível, só a fatia de Decisões/Estrutura relevante para o escopo daquela feature específica, e feche com um ponteiro: `Contexto completo em docs/in-planning/NNN-slug.md.` — é o que `next` releva no fim pra checar satisfação, então precisa ser específico o bastante pra isso funcionar sozinho.
- Descubra o próximo NNN livre listando `docs/features/{done,in-progress,todo}/` (numeração própria, independente de `docs/in-planning/`).

## Depois de gerar

Não implemente nada — nem a primeira tarefa da primeira feature gerada.

Não mova nem apague o arquivo de planning: ele continua em `docs/in-planning/` como referência viva, e pode ser atacado de novo no futuro (uma fase 2, por exemplo).

Acrescente uma entrada em `## Attacks` do arquivo de planning: data, faixa de NNN gerada, uma frase do que foi coberto. É o que a próxima chamada de `attack` sobre o mesmo plano vai ler pra saber o que já existe e não duplicar.
