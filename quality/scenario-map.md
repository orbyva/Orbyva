# Mapa de cenários

Inventário do que a suíte cobre e do que falta, ordenado por **resultado por
esforço**. É a fonte de tarefas de qualidade: ao implementar um cenário, marque
`✅` e registre o commit.

**Valor** — o que quebra se o cenário não existir: `A` produto quebrado para o
usuário · `M` funcionalidade degradada · `B` incômodo.
**Esforço** — `P` até ~20 linhas e sem massa nova · `M` precisa de massa ou de
interação com formulário · `G` fluxo multi-tela ou dado derivado.

---

## Coberto

| #   | Cenário                                                | V   | E   | Spec                            | Commit    |
| --- | ------------------------------------------------------ | --- | --- | ------------------------------- | --------- |
| 1   | ✅ 18 rotas privadas sem sessão vão para `/login`       | A   | P   | `public/auth-gate.spec.ts`      | _pendente_ |
| 2   | ✅ 16 telas do app renderizam `<h1>` e não crasham      | A   | P   | `app/route-smoke.spec.ts`       | _pendente_ |
| 3   | ✅ Rotas públicas abrem sem sessão                      | A   | P   | `public/auth-gate.spec.ts`      | _pendente_ |
| 4   | ✅ Rota inexistente mostra 404                          | M   | P   | `public/auth-gate.spec.ts`      | _pendente_ |
| 5   | ✅ `/finance/dimensions` redireciona para categorias    | M   | P   | `app/route-smoke.spec.ts`       | _pendente_ |
| 6   | ✅ Landing: marca, CTA, preço Pro, FAQ, legal           | M   | P   | `public/landing.spec.ts`        | anterior  |
| 7   | ✅ Login oferece Google e e-mail                        | A   | P   | `public/landing.spec.ts`        | anterior  |
| 8   | ✅ Login por API chega ao app                           | A   | P   | `app/auth.spec.ts`              | anterior  |
| 9   | ✅ Ativação: login → 1ª tx → orçamento visível          | A   | M   | `app/activation.spec.ts`        | anterior  |
| 10  | ✅ Orçamento do mês aparece na UI com valor plantado    | A   | M   | `app/finance-ops.spec.ts`       | anterior  |
| 11  | ✅ Recorrência/parcela criada aparece na lista          | M   | M   | `app/finance-ops.spec.ts`       | anterior  |
| 12  | ✅ Excluir transação some da lista                      | A   | M   | `app/finance-ops.spec.ts`       | anterior  |
| 13  | ✅ Conta expõe export CSV                               | M   | P   | `app/finance-ops.spec.ts`       | anterior  |
| 14  | ✅ Banner de fila offline aparece                       | M   | P   | `app/offline.spec.ts`           | anterior  |
| 15  | ✅ RLS: conta B não lê nem apaga tx/orçamento de A      | A   | M   | `security/rls.spec.ts`          | anterior  |
| 16  | ✅ Nenhuma das 15 tabelas com dono devolve linha alheia  | A   | P   | `security/rls-tenancy.spec.ts`  | _pendente_ |

---

## P0 — próximo lote (alto valor, esforço P)

| #   | Cenário                                                                 | V   | E   | Por que primeiro                                                        |
| --- | ----------------------------------------------------------------------- | --- | --- | ----------------------------------------------------------------------- |
| 17  | ⬜ `/ops` nega acesso a usuário **logado** não-admin                     | A   | P   | Hoje só se testa anônimo. Console operacional exposto é o pior tipo de falha de guarda. |
| 18  | ⬜ Logout limpa sessão e volta para `/login` (voltar não reentra)        | A   | P   | Sessão que sobrevive ao logout é defeito clássico de SPA.                |
| 19  | ⬜ Busca por descrição filtra a tabela de transações                     | A   | P   | Massa já existe no spec de tx; é plantar stamp e conferir o filtro.      |
| 20  | ⬜ Filtro por natureza (Receita/Despesa) muda a lista                    | A   | P   | Mesmo custo do #19, na mesma tela.                                       |
| 21  | ⬜ `console.error` reprova o teste (afiar allowlist da fixture)          | A   | P   | A coleta já existe em `fixtures/test.ts` — falta ligar a asserção.       |
| 22  | ⬜ Convite `/invite/:code` inválido mostra erro sem vazar dado           | M   | P   | Rota pública que consulta o banco.                                       |
| 23  | ⬜ PWA: manifest servido e service worker registrado                     | M   | P   | O build minifica SW próprio; quebra silenciosa hoje.                     |

## P1 — fluxos de núcleo (alto valor, esforço M)

| #   | Cenário                                                              | V   | E   | Nota                                                          |
| --- | -------------------------------------------------------------------- | --- | --- | ------------------------------------------------------------- |
| 24  | ⬜ **Criar transação pelo formulário da UI** (não por REST)           | A   | M   | Fluxo nº 1 do produto e o único ainda não exercitado pela UI.  |
| 25  | ⬜ Editar transação pela UI persiste após reload                      | A   | M   | Cobre o mesmo dialog do #24.                                   |
| 26  | ⬜ Orçamento: editar planejado persiste após reload                   | A   | M   | Hoje só se lê orçamento plantado por REST.                     |
| 27  | ⬜ Outbox sincroniza ao voltar online e o lançamento aparece          | A   | M   | Promessa central do offline; hoje só o banner é testado.       |
| 28  | ⬜ Dashboard soma o mês (planta 2 tx, cobra o total)                  | A   | M   | Número errado no dashboard é defeito invisível para o smoke.   |
| 29  | ⬜ Login pelo formulário de e-mail/senha, uma única vez               | A   | M   | O caminho real do usuário; o resto continua logando por API.   |
| 30  | ⬜ Gate de trial expirado redireciona para `/account?trial=expired`   | A   | M   | Exige segunda conta com plano vencido.                         |
| 31  | ⬜ Sessão expirada volta para `/login` sem loop de redirect           | A   | M   | Token adulterado no `localStorage`.                            |
| 32  | ⬜ Lista serve do cache quando offline (`fromCache`)                  | M   | M   | Texto "Sem conexão — mostrando os últimos lançamentos".        |
| 33  | ⬜ Export CSV baixa arquivo não vazio                                 | M   | M   | Hoje só se checa que o botão existe.                           |
| 34  | ⬜ Navegação pela sidebar (clique real, não `goto`)                   | M   | M   | O smoke usa URL direta; link quebrado passa despercebido.      |
| 35  | ⬜ Categorias: criar e renomear subcategoria                          | M   | M   | Base de toda a classificação financeira.                       |

## P2 — módulos secundários e cauda

| #   | Cenário                                                        | V   | E   |
| --- | -------------------------------------------------------------- | --- | --- |
| 36  | ⬜ Hábito: marcar o dia e ver o streak subir                    | M   | M   |
| 37  | ⬜ Meta: criar e acompanhar progresso                           | M   | M   |
| 38  | ⬜ Viagem: criar, abrir detalhe, adicionar atividade ao roteiro | M   | G   |
| 39  | ⬜ Roteiro: reordenar atividade persiste a ordem                | M   | G   |
| 40  | ⬜ Convite de viagem com token inválido mostra erro             | M   | P   |
| 41  | ⬜ Recorrência gera as parcelas do mês                          | A   | G   |
| 42  | ⬜ Import CSV do Letterboxd (fixture já existe)                 | M   | G   |
| 43  | ⬜ Busca global (⌘K) abre e leva ao resultado                   | M   | M   |
| 44  | ⬜ Viewport mobile: `MobileBottomNav` navega                    | M   | M   |
| 45  | ⬜ Lugares / Veículos / Livros / Música: criar e listar         | B   | M   |
| 46  | ⬜ Tema claro/escuro persiste entre recargas                    | B   | P   |
| 47  | ⬜ Paginação da lista de transações                             | B   | P   |

## Fora de automação, por decisão

| Cenário                                | Motivo                                                        |
| -------------------------------------- | ------------------------------------------------------------- |
| Excluir conta / limpar todos os dados  | Destrutivo na conta E2E real; verificação manual.             |
| Checkout Stripe                        | Depende de ambiente de pagamento; não há sandbox configurado. |
| Execução em produção                   | A conta E2E escreve em base real — só `local` e CI.           |

---

## Como manter isto vivo

1. Cenário implementado vira `✅` com o commit na tabela **Coberto**.
2. Rota nova entra em `e2e/helpers/routes.ts` — ganha smoke e guarda de graça.
3. Defeito encontrado em produção entra como cenário `@regressao` no P0.
4. Spec que ficou intermitente sai da suíte com motivo escrito aqui, não com
   `test.skip` silencioso no arquivo.
