# Qualidade

Onde ficam as decisões de teste do Orbyva. O código dos testes está em
[`e2e/`](../e2e/README.md) e em `src/**/__tests__`.

| Documento                                    | Responde                                                         |
| -------------------------------------------- | ---------------------------------------------------------------- |
| [Estratégia de teste](testing-strategy.md)   | Que camada cobre o quê, o que merece ser E2E, regras anti-flake   |
| [Mapa de cenários](scenario-map.md)          | O que está coberto, o que falta e em que ordem fazer              |

## O ciclo

1. Escolher o cenário mais alto do P0 no [mapa](scenario-map.md).
2. Implementar em `e2e/<área>/`, usando `fixtures/test.ts`.
3. Rodar duas vezes seguidas — se a segunda falha, o teste deixou sujeira.
4. Perguntar se ele **conseguiria ficar vermelho** (quebre a feature de
   propósito e confirme).
5. Marcar `✅` no mapa com o commit.

## Comandos

```bash
npm run test           # unitários (Vitest)
npm run test:e2e       # suíte E2E inteira
npm run test:e2e:smoke # só @smoke — barato, sem massa
npm run test:e2e:public# só o que não exige credencial
```

## Princípio

> Dado estruturado é a fonte de verdade; documento é projeção.

A tabela de rotas em `e2e/helpers/routes.ts` é o exemplo: ela alimenta o smoke
de render **e** o teste de guarda. Rota nova ganha os dois de graça, e não
existe uma segunda lista para ficar desatualizada.
