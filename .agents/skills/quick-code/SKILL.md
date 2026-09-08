---
name: quick-code
description: Executa direto uma alteração pequena de código, sem passar pela esteira de features — sem arquivo em docs/features, sem tarefas, sem suíte completa. Use para ajustes rápidos e de baixo risco (texto, estilo, constante, correção óbvia, renomear, pequeno refactor local) em que a leitura do código já dá certeza do resultado.
disable-model-invocation: false
---

Faça a alteração pedida em `$ARGUMENTS` **direto no código, agora**. Sem arquivo de feature, sem `docs/features/`, sem lista de tarefas, sem checagem de satisfação. Aqui a esteira é overhead: o pedido é pequeno o bastante para que ler o código e escrever a mudança já garanta que está certo.

## O que fazer

1. Localize o ponto exato da mudança (`Grep`/`Glob`/`Read`). Leia o trecho e o suficiente em volta para não quebrar quem usa aquilo — em especial: outras chamadas do símbolo que você vai renomear/mudar de assinatura, e o tipo/contrato que o trecho respeita.
2. Aplique a alteração seguindo as convenções do arquivo (nomeação, idioma dos textos, densidade de comentário, padrão de import).
3. Se houver ocorrências irmãs óbvias do mesmo problema no caminho (mesma constante duplicada, mesmo typo no arquivo ao lado), corrija-as junto e diga no relatório. Não saia refatorando o entorno além disso.
4. Relate em uma ou duas linhas o que mudou, com `caminho/arquivo.ts:linha` para cada ponto tocado.

## Verificação — leve, proporcional

O padrão aqui é **confiar na leitura do código**. Não escreva testes novos, não rode a suíte inteira, não peça confirmação antes de editar.

O único piso obrigatório: se a mudança tocou algo que o compilador/linter enxerga (TypeScript, imports, tipos, assinatura), rode a checagem barata do projeto sobre isso — `npx tsc --noEmit` ou `npm run lint`. É segundos, e pega exatamente a classe de erro que a leitura deixa passar. Mudança puramente textual (copy, comentário, valor de string sem tipo) dispensa até isso.

Se já existe teste cobrindo o trecho e ele roda rápido, rodar só ele é bem-vindo. Se não existe, siga em frente — nesta skill escrever teste não é parte da tarefa.

Chrome/browser automation continua bloqueado, sem exceção. Se a única forma de conferir a mudança fosse abrir o navegador, isso é sinal de que ela não é `quick-code`.

## Quando NÃO usar — pare e escale

Se durante a execução aparecer qualquer um destes, **pare de editar** e diga ao usuário que o pedido é maior que uma alteração rápida, recomendando `/plan` (ou `/pipeline`, se ele estiver rodando a esteira):

- A mudança encosta em mais de um punhado de arquivos, ou muda um contrato/schema/migração/API consumida por outros lugares.
- É comportamento novo de verdade (uma feature), não um ajuste de comportamento existente.
- Envolve ação destrutiva ou irreversível (apagar dado, migração, mexer em produção, reescrever histórico do git).
- Existe uma decisão real de arquitetura ou de produto no caminho — duas soluções plausíveis com trade-off, e você não tem base para escolher pelo usuário.
- Você terminou de ler o código e continua sem certeza de que a edição está correta. Falta de certeza é o sinal de que essa mudança precisa de teste — e isso é escopo de `/plan` + `/next`, não daqui.

O que já foi editado antes de escalar fica no lugar; explique o que ficou pela metade.

## Relação com as outras skills

- `plan` / `pipeline` / `next` = esteira formal, para features: arquivo em `docs/features/`, tarefas, teste obrigatório por tarefa, suíte completa, rastreabilidade do `prompt:`.
- `quick-code` = atalho deliberado para o que não justifica esse rito. Nada do que sai daqui vira arquivo em `docs/features/`, e nada daqui atualiza `## Prompts` de feature nenhuma.

Na dúvida entre as duas, o critério é a certeza: se ler o código já basta para saber que ficou certo, é `quick-code`; se só um teste comprovaria, é `/plan`.
