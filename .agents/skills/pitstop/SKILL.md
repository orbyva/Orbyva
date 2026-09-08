---
name: pitstop
description: Dá um panorama do estado atual do projeto — features em andamento, tarefas já implementadas vs pendentes, e mudanças de código ainda não commitadas
disable-model-invocation: false
allowed-tools: Read, Glob, Bash
---

Monte um panorama rápido do que está sendo feito no projeto atual. Não implemente nada, não edite nada — só leia e relate.

## 1. Features (`docs/features/`)

Se a pasta não existir neste projeto, pule direto para o passo 2 (git) e diga isso.

Liste `docs/features/{to-refine,todo,in-progress,done}/` (ignore `.gitkeep` e arquivos que não sejam `.md`).

Para cada arquivo em **`in-progress/`**: leia o conteúdo, conte quantas `- [ ]` (pendentes) e `- [x]` (feitas) existem na seção Tarefas, e leia a última linha de **Notas** se houver (costuma indicar o desvio mais recente ou onde parou).

Para **`todo/`** e **`to-refine/`**: só liste o título (primeira linha `# NNN — Título`) — são features que ainda não têm código.

Para **`done/`**: não detalhe tarefa por tarefa. Cite só as concluídas mais recentemente (`ls -t` pelos arquivos, as 3-5 últimas) como contexto do que acabou de sair.

## 2. Estado real do git

Se o diretório atual não for um repositório git, pule este passo.

Rode em paralelo:
- `git status --short` — arquivos modificados/novos/staged (isso é "código já escrito" mas ainda não commitado)
- `git log --oneline -10` — commits recentes, para saber o que já foi finalizado
- `git branch --show-current` — em que branch está

Cruze isso com o passo 1: se um arquivo em `in-progress/` tem tarefas marcadas `[x]` mas os arquivos de código relacionados aparecem em `git status`, isso é trabalho feito e ainda não commitado — vale destacar.

## 3. Formato da resposta

Responda direto no chat (não crie arquivo), curto e escaneável:

- **Branch atual** e se há mudanças não commitadas (quantos arquivos).
- **Em andamento** (`in-progress/`): uma linha por feature — `NNN-slug: X/Y tarefas feitas — <última nota ou próxima tarefa pendente>`.
- **Na fila** (`todo/` + `to-refine/`): só os títulos, agrupados.
- **Concluído recentemente** (`done/`): as últimas 3-5, uma linha cada.
- Se `git status` mostrar arquivos modificados que não batem com nenhuma feature em `in-progress/`, sinalize como "mudança solta" (fora do fluxo de features) — não é erro, só um aviso.

Sem seções vazias — se `to-refine/` estiver vazio, não escreva "Na fila: (vazio)", simplesmente omita.
