import type { Plugin } from "vite";

/**
 * Safari/macOS (e alguns browsers) matam o WebSocket do HMR ao trocar de aba
 * ou minimizar. O client do Vite então faz `location.reload()`, fechando modais
 * e resetando estado. Em vez disso, só reconecta o WS.
 */
export function viteSafariHmrNoReload(): Plugin {
  return {
    name: "vite-safari-hmr-no-reload",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      const isViteClient =
        id.includes("/@vite/client") ||
        id.includes("vite/dist/client/client.mjs") ||
        (id.includes("node_modules/vite/") && id.includes("client.mjs"));
      if (!isViteClient) return null;
      if (!code.includes("server connection lost")) return null;

      const patched = code.replace(
        /await waitForSuccessfulPing\(url\.href\);\s*location\.reload\(\);/,
        `await waitForSuccessfulPing(url.href);
          console.info(
            "[vite] HMR reconnect — reload ignorado (preserva modais/estado)"
          );`
      );

      if (patched === code) return null;
      return { code: patched, map: null };
    },
  };
}
