# Orbyva

Stack e convenções fixas: `docs/stack.md`.

<!-- conf-projects:start -->
<!-- Bloco canônico da esteira. Gerado por `/conf-projects sync` a partir de
     ~/.claude/skills/conf-projects/CLAUDE.block.md — edite lá, não aqui. -->

## Skills

As skills da esteira vivem em `~/.claude/skills` (raiz do usuário), **não** neste repositório:
`pipeline`, `refine`, `plan`, `attack`, `next`, `quick-code`, `pitstop`, `consume`, `jev`.

Busque a skill primeiro na raiz; só carregue uma versão local em `.claude/skills/` se ela existir e
for genuinamente mais específica. Cópia local desatualizada sombreia a raiz em silêncio — é a forma
clássica de os repositórios divergirem de novo. `/conf-skills` mostra o inventário e o que está
sombreando; `/conf-projects` diz se este repo está sincronizado.

`~/.claude/skills` não é versionado em repositório nenhum. Em máquina nova, sincronize a pasta antes
de usar qualquer uma dessas skills.

## Esteira de features

Cada feature é um arquivo `NNN-nome.md`. `NNN` é uma sequência **única**, compartilhada por todas as
pastas — nenhum número se repete, mesmo entre pastas diferentes.

```
docs/features/to-refine/     descrição bruta, sem formato nem número
      ↓  /refine
docs/features/in-planning/   desenho: Contexto, Estrutura, Decisões, Perguntas em aberto
      ↓  /attack             ← só com toda `**Resposta:**` preenchida
docs/features/todo/          feature com ## Tarefas e ## Como testar
      ↓  /next
docs/features/in-progress/   primeira tarefa marcada
      ↓  /next               ← checagem de satisfação
docs/features/done/
```

- `/quick-code` é o atalho fora da esteira: mudança em que ler o código já dá certeza do resultado
  vai direto, sem arquivo em `docs/features/`. O critério de corte é **certeza, não tamanho**.
- `/pipeline` é a esteira autônoma de ponta a ponta: refina `to-refine/`, **ataca sozinha todo
  planning pronto**, delega implementação (um implementador por vez) e só para quando `to-refine/`,
  os plannings prontos, `todo/` e `in-progress/` esvaziarem. Rodar `/pipeline` com material pronto
  deve terminar tudo na mesma sessão.
  - **Pronto = nenhuma `**Resposta:**` vazia no planning.** É o único portão do ataque automático:
    pergunta em aberto segura o arquivo em `in-planning/` e a esteira segue com as outras frentes,
    sem atacar pela metade e sem seguir as recomendadas por conta própria.
  - **Um implementador por vez continua valendo.** `attack` numera as features na ordem real de
    implementação e declara `Depende de:` em cada uma — paralelizar quebra essa ordem, além de
    conflitar arquivo e git. Agentes separados, um de cada vez.
  - Ataques, ao contrário, rodam em paralelo — com **bloco de NNN reservado por planning** pelo
    orquestrador, senão dois agentes leem a mesma lista de pastas e geram o mesmo número.
- `/pitstop` dá o panorama do estado atual sem alterar nada.

Toda feature carrega o prompt que a originou:

- frontmatter `prompt:` — o pedido verbatim do usuário, instrução-mãe que define o que "cumprir a
  feature" significa;
- `## Prompts` — log obrigatório de todo pedido do usuário que acrescenta ou muda tarefa no meio da
  implementação, verbatim e com data. Desvio seu, sem pedido do usuário, vai em `## Notas`;
- `## Como testar` — última seção, o roteiro que **outra pessoa** segue pra avaliar o resultado.
- frontmatter `commits:` e `pr:` — o que entregou a feature (`<sha> — <subject>`, um por commit; sem
  PR, `pr: nenhum — commitado direto na master`), preenchidos antes de ir pra `done/`.

## Feature auto-contida — nenhuma tarefa espera o usuário

Nenhuma `- [ ]` depende de ação do usuário: `supabase db push`, aplicar secret, criar conta em
serviço de terceiro, conferir no aparelho, teste manual. Quem implementa tem de poder implementar,
rodar teste **automatizado** e marcar `[x]` sozinho, do começo ao fim. Dependência de ambiente é
pré-requisito no `## Como testar`; conferência humana é roteiro de avaliação — nenhuma das duas é
caixinha. `AGUARDA O USUÁRIO` em tarefa deixa a feature presa em `in-progress/` para sempre e trava
a esteira atrás dela.

## Verificação — Chrome bloqueado

Chrome/automação de navegador não entra na implementação nem na verificação, sem exceção. A prova é
por código: teste de integração, teste de componente com assert de saída real, ou chamada real
conferindo status/payload/efeito. `tsc`/lint/build passando **não basta** — provam que compila, não
que faz. Se a única forma de confirmar algo fosse olhar no navegador, isso é sinal de cobertura
automatizada faltando: escrever esse teste é parte da tarefa, não adendo.

## Portões do Jev

Os pontos de decisão da esteira passam por critérios fixos e tipados (skill `jev`, modelo System One
da TypeSafe) em vez de julgamento solto da sessão: `route-request` (qual entrada atende o pedido),
`refine-ready`, `attack-ready`, `task-verified` (antes de cada `[x]`), `feature-satisfied` (antes de
`done/`) e `decision-autonomy` (a esteira segue sozinha ou a decisão é do usuário).

BLOCK trava o passo; WARN manda executar a ação devolvida; `**Resposta:**` preenchida pelo usuário
vence o Jev sempre. Sem `TYPESAFE_API_KEY` no ambiente, cada portão devolve o fallback e a regra
escrita da própria skill vale sozinha — a esteira nunca para por falta de Jev.

## Base de conhecimento

Referências externas deste projeto vivem em `~/.claude/knowledge/orbyva/`, fora do
repositório, alimentadas por `/consume`. Comece por `index.md`; `maps/*.md` indexa cada repositório
clonado e `repos/*/` tem o código completo — leia e grepe direto ali, não pare no mapa nem no README.

Consulte essa base **antes de planejar** (`/plan`, `/refine`, `/attack`): se já existe referência
ingerida sobre a área que vai ser desenhada, o desenho parte dela em vez de reinventar.

<!-- conf-projects:end -->

## Banco de dados

`supabase db push` aplica ao banco remoto (não há Supabase local neste projeto) — sempre confirmar com o usuário antes de rodar. Migrations nunca compartilham timestamp (já causou um bug real de bookkeeping do CLI — ver Notas de `docs/features/done/002-vinculo-tarefa-recorrencia-financeira.md`).

