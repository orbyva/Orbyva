/**
 * Sinal de que a landing não deve pintar o marketing: já tem sessão em cache, o OAuth voltou
 * com token na hash, ou o PKCE deixou `?code=` no Site URL (`/`). Sem isso, o visitante vê a
 * home pública até o idle — ou o código nunca é trocado, se a landing não importar o cliente.
 */
export function landingShouldDeferToApp(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  if (/[#&]access_token=/.test(hash) || /[#&]refresh_token=/.test(hash)) {
    return true;
  }
  try {
    if (new URLSearchParams(window.location.search).has("code")) return true;
  } catch {
    /* ignore */
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (raw && raw !== "null" && raw !== "{}") return true;
    }
  } catch {
    /* private mode */
  }
  return false;
}
