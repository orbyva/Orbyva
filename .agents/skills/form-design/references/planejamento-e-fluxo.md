# Planejamento e fluxo

## Minimização de campos

O número de campos é o preditor mais confiável da taxa de conclusão de um formulário. Cada campo adicional custa: tempo de processamento, esforço motor, mais uma decisão, mais um vetor de erro de validação.

Antes de adicionar qualquer campo, aplique duas perguntas:
1. Essa informação é estritamente necessária para completar a ação imediata (não "útil para estatística")?
2. Se não for, dá pra coletar depois, de forma assíncrona (progressive profiling)?

Caso de referência (MarketingExperiments/Marketo): reduzir um formulário de captura de 9 → 7 → 5 campos aumentou conversão a cada corte. Não é intuição, é o padrão mais replicado em CRO.

## Single-step vs multi-step (progressive disclosure)

Quando o número de campos não pode cair mais (onboarding B2B, cotação de seguro, pagamento complexo), a saída é dividir no tempo, não no espaço: mostrar só o subconjunto mínimo necessário para o passo atual, revelar o resto conforme o contexto avança.

Caso de referência (Stan's AC / Geek Powered Studios, teste A/B via Google Optimize, 854 sessões): converter formulário longo em single-page para multi-step levou taxa de submissão de 7.62% → 13.13% (+72% relativo). A estrutura vencedora:
1. **Baixa barreira de entrada** — pergunta de esforço mínimo primeiro (ex: botões grandes de escolha), gera momentum.
2. **Decisão linear** — um assunto por tela (ex: data/hora), sem ruído visual concorrente.
3. **Dado neutro** — localização, endereço.
4. **Dado sensível por último** — contato pessoal só depois que a pessoa já investiu tempo (aversão à perda trabalha a favor da conclusão).

Regras de execução do multi-step:
- Uma única CTA específica por tela.
- Barra de progresso visível (ciclo incompleto gera tensão psicológica que empurra à conclusão).
- Decida single vs multi-step pelo **tipo** de complexidade, não só pela contagem bruta de campos: um formulário de 6 campos homogêneos (todos sobre a mesma entidade) pode ficar em uma tela; 6 campos heterogêneos (dados pessoais + pagamento + preferências) já pede separação.

## Layout: coluna única

Leitura ocidental é esquerda→direita, cima→baixo. Layouts multi-coluna quebram esse vetor e criam ambiguidade de varredura: a pessoa hesita se deve ler em zigue-zague ou esgotar a coluna esquerda primeiro. Isso interrompe o "momentum vertical" de preenchimento.

- Default: uma coluna central, sempre.
- Única exceção real: pares de campos com vínculo mental inseparável — nome/sobrenome, validade/CVV, CEP/cidade. Esses podem dividir a mesma linha sem prejuízo, porque a pessoa já os processa como uma unidade.
- Fora dessa exceção, não junte campos na mesma linha só para "economizar espaço vertical" — o custo cognitivo é maior que o ganho de compactação.
