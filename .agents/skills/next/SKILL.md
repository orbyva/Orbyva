---
name: next
description: Implementa as tarefas pendentes de uma feature em docs/features/, uma a uma, sem parar entre elas
disable-model-invocation: false
---

Ache o arquivo cujo número/slug bate com `$ARGUMENTS` em `docs/features/todo/`, `docs/features/in-progress/` ou `docs/features/done/` (organizado por status, não solto em `docs/features/`).

Se o arquivo não tiver frontmatter `prompt:` (feature antiga, criada antes desse campo existir), pare e peça pro usuário reconstruir o prompt original antes de continuar — não dá pra checar satisfação no final sem ele (ver última seção).

Pegue a primeira tarefa `- [ ]`. Implemente e verifique de verdade antes de marcar `[x]`.

Chrome/browser automation está bloqueado neste fluxo, sem exceção — nem por tarefa, nem no fim da feature. Isso significa que a verificação por código precisa ser suficiente sozinha, então `npx tsc --noEmit`/`npm run lint`/`npm run build` passando **não bastam** — eles só provam que o código compila, não que faz o que devia. Toda tarefa precisa de uma afirmação concreta sobre comportamento, não só ausência de erro:
- **Lógica de servidor/API**: teste de integração, ou uma chamada real (`curl`/`fetch`/script) contra o servidor rodando, checando status/payload/efeito colateral esperado — não só que a função não lança exceção.
- **Componente/UI**: teste de componente (Testing Library, Vitest, etc.) que renderiza e faz assert no output/estado real — nunca só "renderiza sem crashar".
- **Sem Chrome como rede de segurança**, o teste é a única prova de que funciona: se a tarefa não tem cobertura existente pro comportamento que introduz, escrever esse teste faz parte da tarefa, não é opcional. Não marque `[x]` só porque o build passou.

Rode a suíte relevante (`npm run test:unit` e afins) junto com tipo/lint/build; nunca marque `[x]` sem tudo isso passar E sem uma assertiva concreta cobrindo o comportamento novo.

Terminou e verificou uma tarefa? Não pare para perguntar — parta direto para a próxima `- [ ]` do mesmo arquivo, no mesmo fluxo. Só pare de verdade quando:
- não sobrar nenhuma `- [ ]` no arquivo E a checagem de satisfação abaixo passar (feature concluída de verdade), ou
- travar em algo que exige decisão do usuário (ambiguidade real, escolha de arquitetura, ação destrutiva/irreversível), ou
- uma verificação falhar e o conserto não for óbvio.

Depois de marcar cada tarefa, mantenha a pasta coerente com o estado real:
- Se o arquivo estava em `todo/` (essa foi a primeira tarefa marcada), mova para `in-progress/`.
- Se essa era a última `- [ ]` do arquivo (não sobrou nenhuma) **e** a checagem de satisfação abaixo passar, mova para `done/`. Nunca mova pra `done/` só porque as caixinhas acabaram.

## Rastreio de prompt — obrigatório

Toda vez que uma tarefa nova entrar no arquivo (ou uma existente mudar de escopo) por causa de um pedido do usuário no meio da implementação — não o prompt original que já está no frontmatter —, adicione uma linha em `## Prompts` com a data e o trecho verbatim do pedido, **antes** de escrever as tarefas derivadas dele. Isso não é opcional: sem essa linha não tem como reconstruir depois por que a tarefa existe. Se desviar do plano por conta própria (não por pedido do usuário), isso continua indo em `## Notas`, não em `## Prompts` — `Prompts` é só pra pedidos verbatim do usuário.

## Checagem de satisfação — obrigatória antes de mover pra `done/`

Quando não sobrar nenhuma `- [ ]`, antes de mover o arquivo pra `done/`: releia o `prompt:` do frontmatter (a instrução-mãe) junto com todo o histórico em `## Prompts`, e avalie de verdade — não só "todas as tarefas viraram `[x]`" — se o que foi implementado cumpre o que foi pedido. Isso tem duas partes obrigatórias, nenhuma delas Chrome:
1. **Rastreabilidade** — para cada item do `prompt:` e de `## Prompts`, aponte o artefato concreto que prova que foi cumprido (nome do teste que passou, resposta real de uma chamada de API, output de log, snapshot). "Pelo código parece certo" não é verificação — se não há um artefato que comprove um requisito, esse requisito não está confirmado, mesmo que a tarefa relacionada esteja marcada `[x]`.
2. **Suíte completa** — rode a suíte de testes inteira do projeto (não só os testes novos da feature) antes de mover pra `done/`. Garante que nada quebrou em código adjacente que as tarefas individuais não tocaram diretamente.

Se a única forma de confirmar algo fosse visual no navegador, isso é sinal de que falta cobertura automatizada (teste de componente/snapshot); trate como uma tarefa a mais no arquivo, não como motivo pra abrir o Chrome.

Se cumpriu: mova pra `done/`, normalmente.
Se não cumpriu (faltou algo, ficou parcial, ou a implementação resolveu um problema adjacente mas não o pedido em si): **não mova pra `done/`**. Escreva as tarefas que faltam direto no mesmo arquivo (mesma seção `## Tarefas`) e continue implementando, sem parar pra perguntar, até a checagem passar. Repita a checagem a cada rodada de tarefas novas concluída.
