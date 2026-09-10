# Evals do Orb

Smoke de 20 casos contra a Edge `orb-agent`. Cobre o que já quebrou de verdade
— não é suite de cobertura, é rede de regressão sobre bugs conhecidos.

```bash
npm run eval:orb                    # todos
npm run eval:orb desambiguacao-converge   # um caso
```

Precisa do ambiente local de pé (`supabase start` + `supabase functions serve`).

## Custo

Cada caso é uma conversa real, então gasta tokens — por isso fica fora de
`npm run test`: rode depois de mexer em `prompt.ts`, nas tools ou no modelo.

O runner **mede e reporta** o custo, lendo o `usage` que a Edge devolve por turno:

```
✓ filme-direto  (3.2s, $0.0089, 3 rodadas, 5210 tok de cache)
...
20/20 passaram
modelo claude-haiku-4-5 · 26 turnos · 2.8 rodadas/turno · cache hit 61%
custo $0.2314 total · $0.0089/turno
```

É esse número que decide troca de modelo: rode a suíte com um `ORB_MODEL` e com
outro e compare **taxa de acerto e custo lado a lado**, em vez de benchmark de
terceiro. Preços por modelo ficam em `PRICES`, no topo do `run.mjs`; modelo fora
da tabela conta tokens e omite o custo em vez de chutar.

O `cache hit` só é diferente de zero por causa do breakpoint de cache em
`prompt.ts` — o bloco estático (identidade + regras) vem antes da parte volátil
(data e resumo da biblioteca), então tools + regras são relidas a ~10% do custo
nas rodadas seguintes do mesmo turno.

## Bug aberto que os evals expõem

`abandonei-vira-abandoned` falha de propósito. A `GOOGLE_BOOKS_API_KEY` em uso é
uma chave **restrita por referer** (as `VITE_*` são feitas pro browser): da Edge,
que não manda referer, o Google responde **403**. Todo `search_book_catalog`
volta vazio — até "Dom Casmurro" caía no cadastro manual, sem capa nem ISBN.

**Correção:** criar no Google Cloud Console uma chave **sem restrição de
referer** (restrita por API, não por origem) e usá-la no secret
`GOOGLE_BOOKS_API_KEY` da Edge. A chave do browser continua sendo a `VITE_*`.

Enquanto isso, o Orb ao menos admite a indisponibilidade em vez de afirmar que o
livro não existe — é o que `catalogo-fora-nao-vira-manual` protege.

## Por que cada caso existe

| Caso | Bug que ele previne |
|---|---|
| `filme-direto` | caminho feliz — resolve no TMDB e extrai nota/status de uma frase |
| `desambiguacao-converge` | o Orb repetia a pergunta mesmo após o usuário responder com ano e diretor |
| `livro-fora-do-catalogo` | livro ausente do Google Books virava beco sem saída |
| `album-so-por-artista` | "o novo álbum do Drake" exigia o título |
| `album-com-titulo` | regressão de tornar o título opcional |
| `parecidos-responde-no-chat` | o Orb prometia recomendações numa "interface" inexistente |
| `quero-assistir-nao-e-assisti` | tempo verbal futuro virando "assistido" grava como visto algo que a pessoa não viu |
| `abandonei-vira-abandoned` | "larguei na metade" é estado próprio, não "lendo" nem "lido" |
| `sem-nota-nao-inventa` | nota só entra se a pessoa disser; e tem de sobreviver ao turno de desambiguação |
| `nota-fora-da-escala` | "nota 11" numa escala 0–10: perguntar em vez de truncar calado |
| `meia-nota` | 8.5 não pode virar 8 nem 9 |
| `fora-de-escopo-financas` | pedido de outro módulo não pode gerar proposta |
| `consulta-nao-propoe` | pergunta sem pedido de registro não grava nada |
| `erro-de-digitacao` | sem acento e minúsculo é o padrão no celular |
| `erro-grave-nao-inventa-filme` | com typo o TMDB devolve zero — perguntar, nunca chutar |
| `duas-obras-na-mesma-frase` | "assisti X e ouvi Y" não pode perder uma das duas |
| `data-relativa-nao-vira-hoje` | "ontem" tem de virar ontem, não hoje |
| `nao-grava-direto` | mesmo mandando, tudo vira proposta — a Edge nunca escreve sozinha |
| `catalogo-fora-nao-vira-manual` | catálogo indisponível ≠ obra inexistente |
| `link-para-a-biblioteca` | listar itens sem oferecer o caminho pra tela deixa o usuário sem saída |

## Duas decisões de design

**Usuário próprio, biblioteca zerada.** O bootstrap manda a biblioteca do usuário
no prompt, então um item já marcado muda a resposta — o Orb corretamente deixa de
propor o que já está lá. Rodar na conta que você usa pra testar no navegador dá
falso negativo. O runner cria `orb-eval@orbyva.local` e limpa antes de cada execução.

**Uma retentativa.** O modelo é não-determinístico; um caso que passa na 2ª tentativa
é instabilidade, não regressão. Sai marcado com `~` para não virar ruído nem ser
varrido pra debaixo do tapete. Com `claude-haiku-4-5` é comum ver 1–3 instáveis
por rodada — se um caso ficar instável **sempre**, trate como bug de prompt.

## Escrever eval é mais difícil do que parece

Cinco das primeiras expectativas estavam erradas — o produto acertava e o teste é
que cobrava a coisa errada. Padrões que causaram isso:

- **Título com homônimo** ("Parasita", "Whiplash", "Coringa"): o agente pede
  desambiguação, corretamente. Ou use título único, ou escreva a conversa inteira.
- **Esperar tolerância que a API não tem**: TMDB aceita falta de acento, mas não
  troca de letra.
- **Esperar que ele conserte em silêncio**: com "nota 11", perguntar é melhor que
  truncar — o teste é que estava errado.
- **Estado compartilhado**: item já na biblioteca muda a resposta.

Antes de declarar bug, rode o caso à mão e leia a resposta inteira.

## Guarda

O runner recusa rodar se `ORB_EVAL_API` apontar pra `*.supabase.co` — os casos criam
threads e propostas de verdade.
