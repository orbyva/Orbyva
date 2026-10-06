---
prompt: |
  {{prompt do usuário que originou esta feature, verbatim — não parafraseado}}
commits:
  - {{sha curto}} — {{subject do commit}}
pr: {{#número + título, ou: nenhum — commitado direto na master}}
---

<!-- `commits:` e `pr:` são preenchidos antes de a feature ir pra `done/`. -->
<!-- Nenhuma tarefa pode depender de ação do usuário (`supabase db push`, secret, conferir no
     aparelho, teste manual): a feature é auto-contida — implementar, rodar teste automatizado,
     marcar [x]. Dependência de ambiente é pré-requisito no "Como testar", não caixinha. -->

# NNN — Título curto

## Contexto
Por que essa feature existe. 2-4 frases.

## Decisões
- Decisão 1
- Decisão 2

## Tarefas
- [ ] Tarefa 1
- [ ] Tarefa 2

## Prompts
- {{YYYY-MM-DD}} — {{trecho verbatim do prompt que gerou esta tarefa/mudança/desvio}}

## Notas
- Desvios do plano original: o quê e por quê. Esta seção é a que mais importa a longo prazo.

## Como testar

Roteiro que **outra pessoa**, sem contexto da implementação, segue pra avaliar o resultado.
Específico deste projeto: rota, comando, tela e dado reais. "Rode os testes e veja se passa" não é roteiro.

1. **Pré-requisitos** — migrations/seeds a rodar, servidor/worker a subir, variável de ambiente,
   com que usuário/perfil logar, em que estado o dado precisa estar.
2. **Verificação automatizada** — comandos exatos, um por linha, já com o filtro certo
   (`--filter=NomeDoTeste`, caminho do arquivo), e o que "passou" significa em cada um.
3. **Verificação manual, passo a passo** — numerada: onde ir (URL/rota/tela, ou chamada HTTP com o
   payload), o que fazer, e o resultado esperado explícito de cada passo.
4. **Casos de borda e caminhos negativos** — sem permissão, estado vazio, input inválido,
   limite/duplicado, usuário de outro tenant/escopo. Cada um com o resultado esperado.
5. **Sinais de que quebrou** — como o defeito apareceria (erro, tela em branco, valor errado, log),
   pra distinguir "não implementado" de "ambiente mal configurado".
