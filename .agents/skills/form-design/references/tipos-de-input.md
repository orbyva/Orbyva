# Tipos de input e widgets de seleção

## Dropdown é o padrão mais abusado do design de formulários

Dropdown esconde as opções por trás de um clique, força scroll dentro de uma lista, e sofre da Lei de Steering (quanto mais estreito e longo o alvo, mais lento e impreciso o movimento do cursor/dedo até ele). Teste da CXL com 354 usuários: opções expostas via radio button horizontal completam a tarefa ~2.5s mais rápido que o equivalente em dropdown.

Além disso, forçar scroll numa lista de 200 países para um dado que a pessoa sabe de cor (país de origem, por exemplo) é pior que deixar digitar com autocomplete.

## Tabela de decisão: widget por número de opções

| Nº de opções | Widget recomendado | Por quê |
|---|---|---|
| 2 (binário) | Toggle switch ou par de radio buttons | Não esconda uma escolha óbvia atrás de clique |
| até ~5 | Radio group visível (horizontal ou vertical) | Todas as opções visíveis de uma vez = decisão mais rápida, sem carga de memória |
| 5–15 | Select nativo (dropdown) | Faixa onde o dropdown ainda compensa — domínio conhecido e finito |
| 15+ | Autocomplete / combobox com busca | Digitar e filtrar é mais rápido que rolar uma lista longa |
| Datas | Input mascarado (DD/MM/AAAA) em vez de 3 selects separados (dia/mês/ano) | 3 dropdowns pra uma data é o exemplo clássico de padrão obsoleto |

## Tipo de input HTML e teclado mobile

O teclado que aparece no mobile deve casar com o tipo de dado esperado — isso não é cosmético, muda diretamente a velocidade e a taxa de erro de digitação.

| Situação | Atributo | Efeito |
|---|---|---|
| Email | `type="email"` | Teclado com `@` e atalhos de domínio |
| Telefone | `type="tel"` | Teclado numérico de discagem |
| URL | `type="url"` | Teclado com `/` e `.com` |
| Número puro (CEP, código) que **não** é uma quantidade | `type="text" inputmode="numeric" pattern="[0-9]*"` | Teclado numérico sem os spin buttons (setas de incremento) que `type="number"` injeta e que atrapalham em desktop |
| Valor decimal/monetário | `inputmode="decimal"` | Permite separador decimal |

**Nunca use `type="number"`** em campos que não representam uma quantidade a ser incrementada/decrementada (CEP, CPF, código de segurança). Ele adiciona spin buttons que geram alteração acidental de valor ao passar o mouse/scroll por cima.

## Autocomplete e autofill

Autofill nativo do navegador/SO é o maior alavancador de conclusão disponível de graça — dado da Zuko Analytics: ~23% das submissões bem-sucedidas dependem de autofill funcionando corretamente; quebrar esse fluxo (com máscaras exóticas, campos não-padrão) derruba a conclusão para a faixa de ~59%.

Atributos a sempre declarar:
- `autocomplete="email"`, `autocomplete="street-address"`, `autocomplete="tel"` etc. nos campos padrão.
- `autocomplete="new-password"` em criação de conta (ativa gerador de senha do navegador) vs `autocomplete="current-password"` em login.
- `autocapitalize="none"` e `autocorrect="off"` em campos de senha/código (evita capitalização/correção indevida).
- Toggle de mostrar/ocultar senha (ícone de olho) — reduz ansiedade de digitação errada em campo mascarado.

## Touch targets

Elementos interativos (botões, radio, checkbox, campo de toque) devem ter no mínimo 44×44px de área de toque (referência WCAG) para evitar erro de "dedo gordo" em mobile.
