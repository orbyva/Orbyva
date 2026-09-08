---
name: plan
description: Cria ou aprofunda um arquivo de planejamento (protocolo/design, pré-feature) em docs/in-planning/ para uma ideia nova — nunca cria feature; use attack depois para quebrar em features
disable-model-invocation: false
allowed-tools: Read, Write, Edit, Glob, Grep
---

Crie (ou, se `$ARGUMENTS` apontar um arquivo já existente em `docs/in-planning/`, aprofunde) `docs/in-planning/NNN-<slug>.md` para: $ARGUMENTS

Filtro antes de tudo: se o pedido for uma alteração pequena e de baixo risco — texto, estilo, constante, correção óbvia, pequeno refactor local — em que ler o código já basta pra ter certeza do resultado, isso não é planejamento nem feature. Não crie arquivo nenhum: use a skill `quick-code` e faça a mudança direto.

**Isso não é um arquivo de feature.** Não escreva `## Tarefas`, não quebre nada em passos executáveis, e não crie feature nenhuma a partir daqui — nem em `docs/features/todo/`, nem em lugar nenhum. Este arquivo existe pra iterar: definir escopo, desenhar estrutura, registrar decisões e deixar perguntas em aberto até o desenho amadurecer. Só a skill `attack`, chamada explicitamente pelo usuário sobre este arquivo, quebra isso em features — nunca automaticamente, nunca por esta skill, nunca por `pipeline`.

Explore o código relevante antes de escrever — padrões já usados no domínio, componentes/serviços adjacentes, convenções do projeto. Pense com cabeça de protocolo: como as peças se encaixam, que fases fazem sentido, o que precisa estar decidido antes de dar pra desenhar uma feature de verdade.

Se `docs/in-planning/` (ou seu `_template.md`) não existir neste projeto, crie os dois agora, copiando a estrutura abaixo para `docs/in-planning/_template.md`.

Use o próximo número livre (liste `docs/in-planning/` pra descobrir o último usado — sequência própria, independente da numeração de `docs/features/`). Siga este template:

```
---
prompt: |-
  {{prompt verbatim}}
---

# NNN — Título curto

## Contexto
Por que isso está sendo explorado. O que motivou.

## Definições
Termos, escopo — o que está dentro e o que está fora — e premissas.

## Estrutura
Desenho de protocolo: como as peças se encaixam, fases, fluxo, dependências previstas entre elas.

## Decisões
- Decisão já travada 1

## Perguntas em aberto
- O que ainda falta decidir

## Prompts
(vazio até haver iteração nova)

## Attacks
(vazio até o primeiro /attack)
```

**Obrigatório:** o frontmatter `prompt:` tem que conter o pedido verbatim que originou este arquivo. Se estiver aprofundando um arquivo já existente (não criando um novo), nunca reescreva o `prompt:` original — adicione uma linha em `## Prompts` com data e o trecho verbatim do pedido novo. É a fonte da verdade que `attack` usa depois pra saber o que realmente foi pedido.

Se o pedido implicar protocolos claramente distintos (domínios de código sem relação entre si), crie múltiplos arquivos numerados em vez de espremer tudo num só. Se for claramente a continuação de um protocolo já em `docs/in-planning/`, prefira aprofundar o arquivo existente a criar um novo.

Não implemente nada, não crie tarefa nenhuma, não toque em `docs/features/`. Escreva/atualize só o arquivo de planning e pare para o usuário revisar e iterar.
