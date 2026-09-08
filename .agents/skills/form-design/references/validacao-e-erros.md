# Validação, erros e microcopy

## Quando validar

Valide no evento **blur** (quando o campo perde o foco), não a cada tecla digitada (`keyup`). Validar enquanto a pessoa ainda está no meio de escrever mostra erro sobre um valor que nem está completo ainda — gera alarme falso e frustração. Exceção aceitável: força de senha em tempo real (feedback progressivo, não bloqueio), e confirmação positiva sutil quando o formato já fechou (ex: cartão de crédito reconhecido).

## Tom da mensagem de erro: afirmativo, não punitivo

Erro deve dizer o que fazer, não repreender o que a pessoa fez errado.

| Evitar | Preferir |
|---|---|
| "Senha inválida" | "Mínimo de 8 caracteres, incluindo um número" |
| "Email incorreto" | "Formato esperado: nome@empresa.com" |
| "Campo obrigatório" (sozinho, sem contexto) | "Precisamos do seu telefone para confirmar o agendamento" |

Baymard: retificação não-punitiva reduz a frustração percebida e a taxa de abandono no ponto de erro, mesmo quando o erro em si é do usuário.

## Reforço positivo

Sinalizar visualmente (ex: check verde discreto) quando um campo complexo é preenchido corretamente reduz a ansiedade acumulada em formulários longos — a pessoa não precisa "confiar" que fez certo, ela vê.

## Nunca ofereça reset destrutivo

Botões como "Limpar formulário" ou "Apagar tudo" são um risco alto para ganho baixo: um clique acidental apaga minutos de trabalho sem confirmação, sem desfazer. NN/g trata isso como padrão a evitar por default. Exceção rara e justificada: fluxos sensíveis onde a própria persistência do dado é o risco (ex: formulário compartilhado em terminal público) — mesmo aí, peça confirmação explícita antes de limpar.

## Checklist final antes de considerar um formulário pronto

- [ ] Nenhum campo supérfluo (cada um passou pelo teste de necessidade imediata)
- [ ] Layout em coluna única, exceto pares inseparáveis
- [ ] Labels top-aligned, nenhum floating label, nenhum placeholder-como-label
- [ ] Largura de campo proporcional ao dado esperado
- [ ] Obrigatório e opcional marcados explicitamente
- [ ] Widget de seleção escolhido pelo nº de opções (não por estética)
- [ ] `type`/`inputmode`/`autocomplete` corretos em cada campo
- [ ] Validação no blur, mensagens afirmativas e específicas
- [ ] Sem botão de limpar/reset destrutivo
- [ ] Touch targets ≥ 44×44px
- [ ] Se o formulário é longo/heterogêneo: já foi dividido em steps com progressive disclosure?
