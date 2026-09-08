# Campos e labels

## Largura do campo deve refletir o dado esperado

Quando o retângulo do input espelha proporcionalmente o tamanho da resposta esperada, o processamento visual é mais rápido. Campo largo demais para um dado curto gera hesitação mensurável (Baymard: pausa, releitura do label, às vezes digitação errática pra "preencher o vazio").

| Dado | Largura recomendada |
|---|---|
| CEP | estreita (5–10 caracteres) |
| Telefone | média (~15 caracteres, acomoda indicativo) |
| Cidade | média-larga (~19 caracteres) |
| Email | larga (30–40 caracteres, domínios longos legíveis) |
| Texto livre | larga o bastante pra digitação completa ficar visível |

## Posição do label: top-aligned, sempre

Dado de eye-tracking (Wroblewski 2008, Penzo 2006): label acima do campo permite quase o dobro da velocidade de preenchimento vs. label à esquerda.

- **Top-aligned**: uma única fixação ocular cobre label + campo (~50ms). Escala perfeitamente em mobile e em textos longos (alemão, russo, traduções).
- **Left-aligned**: obriga zigue-zague ocular (~500ms por salto, 10x mais lento), cria "calhas" irregulares quando labels têm tamanhos diferentes, quebra em telas estreitas.
- **Right-aligned**: pior ainda — inverte o sentido natural de leitura.

Regra prática: se está escolhendo entre estilos de label num wireframe, top-aligned vence por default. Não há cenário comum onde left/right-aligned se justifique num formulário voltado ao público geral.

## Floating labels (IFTA): evite

O padrão onde o label começa centralizado no campo e "sobe" ao ganhar foco (popularizado pelo Material Design antigo) foi repudiado por Wroblewski e Adam Silver depois de testes extensivos. Problemas documentados:
- **Encolhimento**: o label fica minúsculo depois de migrar pra borda — dificulta revisão final antes do submit, penaliza usuários com baixa acuidade visual.
- **Movimento não-essencial**: a animação em campos consecutivos incomoda usuários com sensibilidade vestibular (pode gerar desconforto real, não só preferência estética).
- **Conflito com placeholder**: à distância, um campo vazio com label interno parece "já preenchido" — gera lapsos de preenchimento.
- **Expulsa o hint text**: não sobra espaço pra instrução de formato ("aceita só PDF, máx 5MB").

Default seguro: label estático acima do campo + borda visível ao redor do campo inteiro.

## Placeholder não é label

Placeholder desaparece no primeiro caractere digitado ou no primeiro toque — se a pessoa for interrompida (troca de app, notificação) e voltar, perde a referência do que aquele campo pedia. Além disso, tende a ter contraste baixo, o que viola WCAG 2.2 e falha com leitores de tela.

Uso correto de placeholder: só para exemplo de formato (`ex: nome@empresa.com`), nunca como substituto do label. O label fica sempre visível, fora do campo.

## Obrigatório vs opcional: marque os dois, sempre

Não assuma que "tudo é obrigatório, só marco a exceção" nem o inverso — ambos geram trabalho de inferência pro usuário. Marque explicitamente:
- Campo obrigatório: `*` + `aria-required="true"`.
- Campo opcional: a palavra "Opcional" visível ao lado do label — evite frases negativas como "não obrigatório" (carga cognitiva maior que a forma afirmativa).
