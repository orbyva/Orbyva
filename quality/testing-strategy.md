# Estratégia de teste

## Que camada cobre o quê

| Camada        | Ferramenta            | Cobre                                              | Custo |
| ------------- | --------------------- | -------------------------------------------------- | ----- |
| Unitário      | Vitest                | Lógica pura, hooks, formatação, cálculo de saldo    | Baixo |
| Orçamento     | bundle budget + LHCI  | Tamanho de bundle e métrica de performance          | Baixo |
| Ponta a ponta | Playwright            | Fluxo real no browser, contra Supabase de verdade   | Alto  |

O volume de verificação deve ficar no Vitest. Playwright é a camada mais cara e
a mais frágil — cada spec precisa justificar por que **só** funciona ali.

## O critério para um cenário ser E2E

Um cenário merece Playwright quando depende de pelo menos um destes:

- navegação real entre rotas e guarda de sessão;
- RLS — o que uma conta consegue ler e escrever da outra;
- render de tela inteira com dado vindo do PostgREST;
- comportamento que só existe no browser: service worker, outbox offline,
  `localStorage`, PWA.

Se a pergunta pode ser respondida olhando o retorno de uma função ou o formato
de uma resposta, é teste unitário — mais barato e mais estável.

## Os três eixos de execução

Independentes entre si.

| Eixo       | Pergunta                  | Valores                                            |
| ---------- | ------------------------- | -------------------------------------------------- |
| **Alvo**   | Onde a aplicação roda     | `local` (preview do build) · `CI` · _prod nunca_    |
| **Sessão** | Quem está logado          | anônimo · conta A (`E2E_EMAIL`) · conta B (RLS)     |
| **Tag**    | O que é seguro rodar ali  | `@smoke` `@critical` `@data` `@security` `@regressao` |

| Tag         | Significado                                                              |
| ----------- | ------------------------------------------------------------------------ |
| `@smoke`    | Barato, sem massa. Deve rodar em todo push.                              |
| `@critical` | Quebrou, o produto está quebrado para o usuário.                         |
| `@data`     | Cria ou altera dado real. Exige `cleanup` rastreado.                     |
| `@security` | Isolamento entre contas.                                                 |
| `@regressao`| Defeito já corrigido que não pode voltar.                                |

**Produção não tem execução autorizada.** A conta E2E vive no mesmo Supabase do
produto: todo spec `@data` escreve em base real e por isso é obrigado a limpar.

## As regras que tornam a suíte confiável

> **Assere efeito observável e estrutura. Nunca texto de terceiro nem pixel.**

| ❌ Nunca                                    | ✅ Sempre                                        |
| ------------------------------------------- | ------------------------------------------------ |
| Classe do Tailwind como seletor             | `getByRole("heading", { level: 1, name })`       |
| `waitForTimeout(2000)`                      | `expect(...).toBeVisible({ timeout })`           |
| Conferir "há 3 lançamentos" na lista        | Conferir que **o stamp que o teste criou** aparece |
| Reusar massa que outro spec criou           | `e2eStamp()` próprio + `cleanup.track*`          |
| `if (await x.isVisible()) { ... }` sem else | Ramo condicional só para ruído (tour, aba)       |

A conta E2E é compartilhada entre os specs, então valor genérico colide com o
seed. Daí o padrão de plantar valor raro (`R$ 777,77`) ou descrição carimbada
(`E2E-DEL-1754…`) e cobrar exatamente ele de volta.

## Custo, que é uma restrição de desenho

`workers: 1` no config — uma única conta E2E não suporta paralelismo sem corrida
entre specs que mexem no mesmo mês de orçamento. Consequências práticas:

1. **Agrupar por navegação.** Um spec parametrizado que passa por 16 rotas custa
   um login e cobre o app inteiro. Dezesseis specs custariam dezesseis logins.
2. **Empurrar para unitário o que der.** Cálculo de saldo, agregação de mês e
   formatação de moeda não precisam de browser.
3. **Login por API, nunca por formulário.** O formulário é testado uma vez.

## Passar não é o mesmo que estar correto

Antes de considerar um spec pronto, responda:

- **Ele falharia se a funcionalidade estivesse quebrada?** Se não consegue
  ficar vermelho, não protege nada.
- **Existe caminho de falso positivo?** `if (await x.isVisible())` sem `else` é
  o padrão mais comum: quando o seletor não casa, o teste passa sem asserir.
- **Depende de outro spec?** Se a ordem importa, não é um teste, é uma etapa.
- **Roda duas vezes seguidas?** Se a segunda falha, ele deixou sujeira.
- **A massa criada está declarada no `cleanup`?**

## O que a estratégia ainda não resolve

- Sem cobertura de mobile real — só o viewport `Desktop Chrome`.
- Sem cobertura de fluxo de pagamento (Stripe) nem do gate de plano expirado.
- `console.error` é coletado, mas ainda não reprova teste — ver backlog.
- A conta E2E precisa de plano ativo: se o trial expirar, o `AdminLayout`
  redireciona tudo para `/account?trial=expired` e a suíte inteira cai. A
  fixture avisa com mensagem explícita, mas ninguém renova sozinho.
