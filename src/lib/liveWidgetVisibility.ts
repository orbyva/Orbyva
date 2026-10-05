/**
 * Preferência local de visibilidade do widget flutuante do timer "Live" (feature 226).
 *
 * É preferência de visualização, não dado: fica em `localStorage`, por navegador, e nunca vira
 * coluna de banco. Toda leitura/escrita é tolerante — `localStorage` pode não existir (SSR, teste em
 * ambiente "node") ou lançar (modo privado, cota, cookies bloqueados); nesses casos a tela cai no
 * padrão em vez de quebrar.
 *
 * O padrão é **visível**: chave ausente ou com valor inválido nunca esconde o widget, pra ninguém
 * perder o acesso ao timer por acidente (lixo gravado por outra versão, storage pela metade).
 */

export const LIVE_WIDGET_HIDDEN_STORAGE_KEY = "orbyva_live_widget_hidden_v1";

/** O valor único que significa "escondido" — qualquer outra string é lixo e lê como visível. */
const HIDDEN_VALUE = "1";

/** `true` só quando a chave guarda exatamente o valor que `writeLiveWidgetHidden` grava. Ausente,
 * qualquer outro valor ou `localStorage` indisponível/que lança → `false` (visível). */
export function readLiveWidgetHidden(): boolean {
  try {
    return localStorage.getItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY) === HIDDEN_VALUE;
  } catch {
    return false;
  }
}

/** Grava a escolha. Visível **remove** a chave em vez de gravar `"0"` — nada de valor morto
 * acumulado que a próxima leitura teria de descartar. */
export function writeLiveWidgetHidden(hidden: boolean): void {
  try {
    if (hidden) {
      localStorage.setItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY, HIDDEN_VALUE);
    } else {
      localStorage.removeItem(LIVE_WIDGET_HIDDEN_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}
