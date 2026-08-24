# Evals do Orb

Smoke de 6 casos contra a Edge `orb-agent`. Cobre o que já quebrou de verdade
— não é suite de cobertura, é rede de regressão sobre bugs conhecidos.

```bash
npm run eval:orb                    # todos
npm run eval:orb desambiguacao-converge   # um caso
```

Precisa do ambiente local de pé (`supabase start` + `supabase functions serve`).

## Custo

Cada caso é uma conversa real, então gasta tokens. Com `ORB_MODEL=claude-haiku-4-5`
dá ~**$0,01 por turno** — a suite inteira sai por ~**$0,06**. Por isso fica fora
de `npm run test`: rode depois de mexer em `prompt.ts`, nas tools ou no modelo.

## Por que cada caso existe

| Caso | Bug que ele previne |
|---|---|
| `filme-direto` | caminho feliz — resolve no TMDB e extrai nota/status de uma frase |
| `desambiguacao-converge` | o Orb repetia a pergunta mesmo após o usuário responder com ano e diretor |
| `livro-fora-do-catalogo` | livro ausente do Google Books virava beco sem saída |
| `album-so-por-artista` | "o novo álbum do Drake" exigia o título |
| `album-com-titulo` | regressão de tornar o título opcional |
| `parecidos-responde-no-chat` | o Orb prometia recomendações numa "interface" inexistente |

## Duas decisões de design

**Usuário próprio, biblioteca zerada.** O bootstrap manda a biblioteca do usuário
no prompt, então um item já marcado muda a resposta — o Orb corretamente deixa de
propor o que já está lá. Rodar na conta que você usa pra testar no navegador dá
falso negativo. O runner cria `orb-eval@orbyva.local` e limpa antes de cada execução.

**Uma retentativa.** O modelo é não-determinístico; um caso que passa na 2ª tentativa
é instabilidade, não regressão. Sai marcado com `~` para não virar ruído nem ser
varrido pra debaixo do tapete.

## Guarda

O runner recusa rodar se `ORB_EVAL_API` apontar pra `*.supabase.co` — os casos criam
threads e propostas de verdade.
