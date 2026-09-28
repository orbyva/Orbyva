/**
 * # Rolagem proporcional entre editor e preview (feature 070)
 *
 * No modo "Dividir", o preview acompanha o editor: rolar 40% do texto mostra 40% do renderizado.
 *
 * **Proporcional, não por bloco.** Mapear linha-fonte → elemento renderizado exigiria `sourcepos`
 * em cada nó do markdown e um índice mantido a cada tecla; o proporcional resolve 90% do caso a 5%
 * do custo, e quem precisa de precisão usa o sumário. E é **um sentido só** (editor manda, preview
 * segue): sincronizar nos dois lados cria laço de rolagem, em que cada painel reage ao outro.
 *
 * A conta mora aqui, pura, porque é ela que erra — dividir por zero quando não há o que rolar, ou
 * passar do fim quando os dois painéis têm alturas diferentes.
 */

export interface ScrollBox {
  /** Quanto já rolou. */
  scrollTop: number;
  /** Altura total do conteúdo. */
  scrollHeight: number;
  /** Altura visível. */
  clientHeight: number;
}

/**
 * A posição que o painel destino deve assumir para mostrar a mesma **fração** do conteúdo que o
 * painel origem está mostrando.
 *
 * Conteúdo que cabe inteiro na tela (nada a rolar) devolve `0` em vez de `NaN` — é o caso de nota
 * curta, que é a maioria.
 */
export function proportionalScrollTop(source: ScrollBox, target: ScrollBox): number {
  const sourceRange = source.scrollHeight - source.clientHeight;
  const targetRange = target.scrollHeight - target.clientHeight;
  if (sourceRange <= 0 || targetRange <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, source.scrollTop / sourceRange));
  return Math.round(ratio * targetRange);
}
