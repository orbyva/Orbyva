/**
 * Inset inferior do chat da Orb.
 *
 * No iOS o KeyboardAvoidingView do RN falha com frequência em telas com header do Stack —
 * usamos a altura real do teclado. No Android com `softwareKeyboardLayoutMode: resize` a
 * janela já encolhe; somar a altura de novo empurraria o composer para cima demais.
 */
export function orbChatKeyboardInset(
  platform: string,
  keyboardHeight: number,
  safeBottom: number
): number {
  if (keyboardHeight <= 0) return Math.max(safeBottom, 8);
  if (platform === "android") return 8;
  return keyboardHeight;
}
