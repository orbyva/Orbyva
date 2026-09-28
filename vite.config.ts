/// <reference types="vitest/config" />
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSafariHmrNoReload } from "./vite.safari-hmr";

/**
 * Pacotes d3 que o `victory-vendor` (dependência do recharts) importa, mais os transitivos deles.
 * Qualquer outro `d3-*` no `node_modules` chegou junto com o mermaid.
 */
const RECHARTS_D3_RE =
  /node_modules\/(d3-array|d3-color|d3-ease|d3-format|d3-interpolate|d3-path|d3-scale|d3-shape|d3-time|d3-time-format|d3-timer|internmap)\//;
/** CSS do bundle sem bloquear FCP (LCP pinta pelo HTML). */
function preloadCriticalFonts(): Plugin {
  return {
    name: "orbyva-preload-critical-fonts",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        const next = html.replace(
          /<link rel="stylesheet" crossorigin href="([^"]+\.css)">/g,
          '<link rel="stylesheet" href="$1" media="print" data-boot-css>\n    <noscript><link rel="stylesheet" href="$1"></noscript>'
        );
        return next;
      },
    },
  };
}

/**
 * Pacotes de gramática que só entram por `import()` — o realce dentro de ` ```lang ` do editor de
 * notas (feature 070). Cada linguagem vira um chunk **próprio e nomeado** (`cm-lang-python-…`),
 * como o excalidraw faz por arquivo, por dois motivos medidos nesta feature:
 *
 * 1. sem regra nenhuma (deixando o Rollup decidir), `@lezer/javascript` e `@lezer/css` acabavam
 *    **dentro** do chunk `codemirror` — eles também são alcançáveis pelo grafo estático via
 *    `lang-markdown → lang-html`, e o vendor pulava de 138,9 KB para 201,5 KB gzip, estourando o
 *    teto de 200 KB. Um `manualChunks` explícito os tira de lá;
 * 2. o nome estável é o que faz `check-bundle-budget.mjs` classificá-los como vendor lazy. Sem
 *    nome, o Rollup os batiza de `index-…` (o arquivo de entrada de cada pacote se chama
 *    `index.js`) e o orçamento os confunde com o chunk de **entrada** do app — a mesma armadilha
 *    que a 069 documentou com o `lowlight`.
 */
const LAZY_FENCE_GRAMMAR_RE =
  /node_modules\/(?:@codemirror\/lang-|@lezer\/)(javascript|json|css|html|sql|python)\//;
/** Modos legados (`shell`) não têm pacote `@lezer` próprio: vêm todos de `legacy-modes`. */
const LEGACY_MODES_RE = /node_modules\/@codemirror\/legacy-modes\//;

export default defineConfig({
  plugins: [
    viteSafariHmrNoReload(),
    react(),
    preloadCriticalFonts(),
    VitePWA({
      registerType: "prompt",
      minify: true,
      includeAssets: [
        "logo.webp",
        "logo-mark.webp",
        "logo-mark-sky.png",
        "placeholder.svg",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-maskable-512.png",
        "marketing/hub.webp",
      ],
      manifest: {
        name: "Orbyva",
        short_name: "Orbyva",
        description:
          "Tudo da sua vida em uma só órbita, finanças, hábitos, metas, viagens e mais.",
        theme_color: "#0EA5E9",
        background_color: "#0B0F1A",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/home",
        lang: "pt-BR",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // generateSW com mode production crasha (@rollup/plugin-terser 1.0.0
        // trava em worker), geramos dev e minificamos em scripts/minify-sw.mjs.
        mode: "development",
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,webp,svg,woff2,png}"],
        /**
         * O canvas (feature 058) fica **fora do precache**: o JS do Excalidraw passa de 2 MB
         * (limite do Workbox) e só quem abre um canvas usa. Sem `manualChunks` o nome do arquivo
         * não é estável (`excalidraw-*` ou o símbolo interno da lib), então o teto de tamanho
         * é o que garante que um chunk gigante não entre no precache se o glob falhar.
         */
        globIgnores: [
          "**/excalidraw-*.js",
          "**/excalidraw-*.css",
          "**/ExcalidrawCanvas-*.js",
          "**/ExcalidrawCanvas-*.css",
          "**/percentages-BXMCSKIN-*.js",
          "**/subset-shared.chunk-*.js",
        ],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
          /^\/llms\.txt$/,
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
          /^\/gtm\.js$/,
          /^\/tmdb-media/,
          /^\/books-media/,
          /^\/mb-api/,
          /^\/caa-media/,
          /^\/spotify-media/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/tmdb-media"),
            handler: "CacheFirst",
            options: {
              cacheName: "tmdb-posters",
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/books-media"),
            handler: "CacheFirst",
            options: {
              cacheName: "books-covers",
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/caa-media"),
            handler: "CacheFirst",
            options: {
              cacheName: "album-covers-caa",
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/spotify-media"),
            handler: "CacheFirst",
            options: {
              cacheName: "album-covers-spotify",
              expiration: {
                maxEntries: 128,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 8,
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          /**
           * Antes do `node_modules` return: o helper de preload do Vite não mora em
           * `node_modules` (`\0vite/preload-helper`). Sem chunk próprio, o Rollup o joga no
           * primeiro vendor grande que o usa — o Excalidraw — e o `index` importa 4,7 MB só
           * para ter `__vitePreload`. Prod 2026-08-31: `TypeError: $ is not a function`.
           */
          if (
            id.includes("\0vite/") ||
            id.includes("vite/preload-helper") ||
            id.includes("vite/dynamic-import-helper")
          ) {
            return "vite-runtime";
          }
          if (!id.includes("node_modules")) return;
          // Utils pequenos, NÃO deixar cair no chunk do recharts (clsx era engolido).
          if (
            id.includes("clsx") ||
            id.includes("tailwind-merge") ||
            id.includes("class-variance-authority")
          ) {
            return "ui-utils";
          }
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/victory-vendor")
          ) {
            return "recharts";
          }
          /**
           * d3 tem **dois** consumidores desde a 057: o recharts (via `victory-vendor`, nas rotas
           * de gráfico) e o mermaid (nos diagramas, carregado sob demanda). Só os pacotes que o
           * `victory-vendor` puxa ficam num chunk compartilhado; o resto do d3
           * (`d3-sankey`, `d3-geo`, `d3-force`…) é exclusivo do mermaid e fica de fora de
           * propósito — sem `return`, o Rollup o coloca dentro dos chunks lazy do mermaid.
           * Com o `d3-` genérico aqui, o chunk `recharts` engordava 15 KB gzip com d3 que só o
           * diagrama usa, e toda rota de gráfico pagava por isso.
           */
          if (RECHARTS_D3_RE.test(id)) return "d3";
          if (id.includes("framer-motion")) return "motion";
          // Gramática de fence: um chunk por linguagem, antes da regra genérica de `@codemirror`
          // (que puxaria tudo para o vendor fixo do editor). Ver a constante acima.
          const fenceGrammar = LAZY_FENCE_GRAMMAR_RE.exec(id);
          if (fenceGrammar) return `cm-lang-${fenceGrammar[1]}`;
          if (LEGACY_MODES_RE.test(id)) return "cm-lang-shell";
          // CodeMirror (editor de notas, feature 056) é vendor pesado e só carrega na rota de
          // notas — sem chunk próprio ele entraria no chunk da rota e estouraria o teto de 160 KB.
          if (
            id.includes("@codemirror") ||
            id.includes("@uiw/react-codemirror") ||
            id.includes("@lezer") ||
            id.includes("node_modules/style-mod") ||
            id.includes("node_modules/crelt") ||
            id.includes("node_modules/w3c-keyname")
          ) {
            return "codemirror";
          }
          /**
           * Excalidraw **não** entra em `manualChunks`. Forçar nome (um arquivo só ou um por
           * arquivo do pacote) coloca o grafo do canvas no mesmo chunk do helper de preload, e o
           * boot da landing importa os 4,7 MB. O `React.lazy` / `import()` do `ExcalidrawCanvas`
           * e do `CanvasBlock` já o deixam lazy. `globIgnores` + teto de tamanho do Workbox
           * cobrem o precache. O guarda em `check-bundle-budget.mjs` falha se o `index`
           * importar o canvas.
           */
          /**
           * `lowlight` + `highlight.js` (realce de código das notas, feature 069) só são baixados
           * quando uma nota tem bloco de código — o `CodeBlock` os importa dinamicamente. O nome
           * próprio existe para o orçamento de bundle: sem ele o Rollup batiza o chunk de
           * `index-…` (o arquivo de entrada do lowlight se chama `index.js`) e
           * `check-bundle-budget.mjs` o confunde com o chunk de entrada do app, dando a ele o teto
           * de 380 KB em vez do de vendor lazy.
           */
          if (
            id.includes("node_modules/lowlight") ||
            id.includes("node_modules/highlight.js")
          ) {
            return "lowlight";
          }
          if (id.includes("@sentry")) return "sentry";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@radix-ui")) return "radix";
          if (
            id.includes("react-dom") ||
            id.includes("react-router") ||
            /node_modules\/react\//.test(id)
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
  server: {
    // Em dev, evita o browser reusar chunk antigo de node_modules/.vite/deps
    // depois de reiniciar o servidor (erro "file does not exist … chunk-*.js").
    headers: {
      "Cache-Control": "no-store",
    },
    proxy: {
      "/tmdb-media": {
        target: "https://image.tmdb.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tmdb-media/, ""),
      },
      /** Capas Google Books, CORS quebra canvas do share. */
      "/books-media": {
        target: "https://books.google.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/books-media/, ""),
      },
      "/mb-api": {
        target: "https://musicbrainz.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/mb-api/, ""),
        headers: {
          "User-Agent": "Orbyva/1.0 (https://orbyva.app; orbyva@gmail.com)",
        },
      },
      "/caa-media": {
        target: "https://coverartarchive.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/caa-media/, ""),
        followRedirects: true,
      },
      "/spotify-media": {
        target: "https://i.scdn.co",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/spotify-media/, ""),
      },
    },
    // Túneis ngrok das duas frentes: host sobrando é inofensivo, host faltando derruba o túnel.
    allowedHosts: [
      "localhost",
      "00fd-45-238-124-241.ngrok-free.app",
      "6cd8-45-238-124-170.ngrok-free.app",
      "5757-146-70-163-204.ngrok-free.app",
    ],
  },
  test: {
    globals: true,
    setupFiles: ["./src/test/setup-timezone.ts", "./src/test/setup-jsdom.ts"],
    env: {
      TZ: "America/Sao_Paulo",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
    // Vitest 4 removeu `environmentMatchGlobs`. Dois projetos herdam o restante do config:
    // `.test.ts` em node (lógica pura); `.test.tsx` em jsdom (componentes). Arquivos `.ts`
    // que precisam de DOM continuam com `// @vitest-environment jsdom` no topo.
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          include: ["src/**/*.test.tsx"],
          environment: "jsdom",
        },
      },
    ],
  },
});
