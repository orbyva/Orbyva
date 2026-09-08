---
name: refine
description: Transforma descrições brutas em docs/features/to-refine/ em arquivos de planejamento em docs/in-planning/ — não cria features, só amadurece o material bruto pro formato de planning
disable-model-invocation: false
allowed-tools: Read, Write, Glob, Bash
---

Para cada arquivo em `docs/features/to-refine/` que bater com `$ARGUMENTS` (ou todos, se `$ARGUMENTS` vier vazio): leia o conteúdo bruto e escreva um arquivo de planning em `docs/in-planning/NNN-<slug>.md`.

Se `docs/in-planning/` (ou seu `_template.md`) não existir neste projeto, crie os dois primeiro, com esta estrutura (a mesma que a skill `plan` usa):

```
---
prompt: |-
  {{conteúdo bruto do arquivo de to-refine, verbatim}}
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

O frontmatter `prompt:` é obrigatório — preencha com o conteúdo bruto do arquivo de `to-refine/` verbatim (é a instrução-mãe; não parafraseie).

Explore o código relevante (padrões do domínio, componentes/serviços adjacentes, convenções do projeto) antes de escrever. Isso é um primeiro rascunho pra iteração, não uma decisão final — é aceitável, e esperado, deixar `## Perguntas em aberto` com itens reais que só o usuário resolve, em vez de forçar uma decisão que você não tem base pra tomar.

Descubra o próximo NNN livre listando `docs/in-planning/` (sequência própria, independente de `docs/features/`). Se o texto bruto implicar protocolos claramente distintos, crie múltiplos arquivos numerados em sequência em vez de espremer tudo num só.

Depois de escrever o(s) arquivo(s) de planning, apague o(s) arquivo(s) original(is) de `to-refine/`.

Não crie feature nenhuma. Não escreva `## Tarefas`. Não toque em `docs/features/todo/`, `in-progress/` ou `done/` — só `attack`, chamado explicitamente sobre um arquivo de planning, faz essa ponte.
