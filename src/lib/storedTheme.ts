export type StoredTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/**
 * Tema salvo pelo usuário (`Header` / `NavUser`). O `.dark` no `<html>` só entra quando um deles
 * monta, então telas que aparecem antes (loader) leem daqui. Sem escolha salva vale o escuro,
 * igual ao fundo do `index.html` e à landing.
 */
export function readStoredTheme(): StoredTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
