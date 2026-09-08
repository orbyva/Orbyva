---
name: form-design
description: Heurísticas validadas (Baymard, NN/g, Luke Wroblewski, CXL) para desenhar ou revisar formulários — escolha de tipo de input, layout, separação em steps, labels, validação. Use sempre que for criar, revisar ou discutir um formulário, wireframe de formulário, ou fluxo de captura de dados (cadastro, checkout, onboarding, cotação).
disable-model-invocation: false
---

Formulário é o ponto de maior atrito entre intenção e conversão. As regras abaixo vêm de testes A/B e eye-tracking documentados (não de opinião estética) — trate como default, não como sugestão. Cada seção tem um arquivo de referência com a tabela/detalhe completo; leia o arquivo só quando a decisão específica exigir.

## Checklist rápido (aplique nessa ordem)

1. **Minimize campos primeiro.** Para cada campo, pergunte: é estritamente necessário para a ação imediata? Se é só "bom ter" para enriquecer perfil, corte — colete depois (progressive profiling). Cada campo a menos aumenta conversão de forma mensurável. → `references/planejamento-e-fluxo.md`

2. **Decida single-step vs multi-step.** Formulário curto e homogêneo (poucos campos, uma decisão) fica em uma tela. Formulário longo, heterogêneo ou com carga emocional (pagamento, cotação, onboarding) vira multi-step com progressive disclosure: passo de baixo compromisso primeiro, dado sensível/pessoal por último, uma CTA por tela, barra de progresso. → `references/planejamento-e-fluxo.md`

3. **Layout em coluna única, sempre.** Multi-coluna quebra o scan vertical e gera ambiguidade de leitura. Exceção: pares semanticamente inseparáveis (nome/sobrenome, validade/CVV, CEP/cidade) podem ficar lado a lado na mesma linha. → `references/planejamento-e-fluxo.md`

4. **Label sempre acima do campo (top-aligned).** Nunca floating label, nunca placeholder fazendo as vezes de label. Largura do campo deve refletir o tamanho esperado do dado (CEP estreito, email largo). → `references/campos-e-labels.md`

5. **Marque obrigatório E opcional explicitamente.** Asterisco `*` + `aria-required="true"` nos obrigatórios; a palavra "Opcional" nos demais — nunca deixe implícito. → `references/campos-e-labels.md`

6. **Escolha o widget pelo número de opções**, não por preferência visual — dropdown é o padrão mais abusado e mais lento do design de formulários:
   - 2 opções binárias → toggle switch ou radio
   - até ~5 opções → radio group visível (sem esconder atrás de clique)
   - 5–15 opções → select nativo
   - 15+ opções ou dado que a pessoa já sabe de cor (país, cidade) → autocomplete/combobox com busca
   → `references/tipos-de-input.md`

7. **Tipo de input e teclado mobile corretos**: `type="email"/"tel"/"url"` nos nativos; nunca `type="number"` em campo que não é cálculo (usar `inputmode="numeric"` + `pattern`); `autocomplete` correto (`email`, `street-address`, `new-password` vs `current-password`); toggle de mostrar/ocultar senha. → `references/tipos-de-input.md`

8. **Valide no blur, não a cada tecla.** Mensagem de erro é afirmativa e diz o que fazer ("Mínimo de 8 caracteres" em vez de "Senha inválida"). Reforço visual positivo em campo válido. Nunca botão de "limpar formulário" ou reset destrutivo. Touch targets ≥ 44×44px. → `references/validacao-e-erros.md`

## Quando isso não se aplica

Formulários internos de uso repetido por usuário treinado (admin/dashboard interno) toleram mais densidade e menos hand-holding do que formulários públicos de conversão única — ajuste a rigidez das regras de acordo, mas labels top-aligned e tipo de input correto continuam valendo sempre.
