/// <reference types="vitest/config" />
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSafariHmrNoReload } from "./vite.safari-hmr";

/**
 * Pacotes d3 que o `victory-vendor` (dependência do recharts) importa, mais os transitivos deles.
 * Qualquer outro `d3-*` no `node_modules` chegou junto com o mermaid.
 */
const RECHARTS_D3_RE =
  /node_modules\/(d3-array|d3-color|d3-ease|d3-format|d3-interpolate|d3-path|d3-scale|d3-shape|d3-time|d3-time-format|d3-timer|internmap)\//;

export default defineConfig({
  plugins: [
    viteSafariHmrNoReload(),
    react(),
    VitePWA({
      registerType: "prompt",
      minify: true,
      includeAssets: [
        "logo.webp",
        "logo-mark.webp",
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
         * O canvas (feature 058) fica **fora do precache**: são 4,7 MB em ~100 chunks que só quem
         * abre um canvas usa. Precachear tudo faria a instalação do PWA baixar isso para todo
         * mundo (medido: 11,4 MB → 15,9 MB de precache). Continuam disponíveis pela rede, sob
         * demanda, como qualquer chunk lazy; a contrapartida aceita é que abrir um canvas pela
         * primeira vez exige estar online.
         */
        globIgnores: ["**/excalidraw-*.js", "**/excalidraw-*.css"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [
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
    rollupOptions: {
      output: {
        manualChunks(id) {
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
           * Excalidraw (canvas, feature 058) é a maior dependência do app — 4,7 MB de JS somando
           * tudo. Um `manualChunks` **único** foi medido e reprovado: colapsa os ~90 locales e os
           * chunks internos num arquivo de 1,5 MB gzip (e o Workbox nem consegue pré-cachear,
           * limite de 2 MB por arquivo). É a mesma armadilha que a 057 documentou com o mermaid.
           *
           * A regra abaixo é o contrário disso: **um chunk por arquivo do pacote**, que é onde o
           * próprio Excalidraw já traçou as fronteiras (core, subsetting de fonte, um arquivo por
           * idioma). Preserva o split natural — quem abre um canvas em pt-BR não baixa os outros
           * 89 idiomas — e ainda dá nome estável (`excalidraw-…`) para o orçamento de bundle
           * classificar, em vez de depender do sufixo de build da lib.
           */
          if (id.includes("@excalidraw")) {
            const file = id.split("?")[0].split("/").pop() ?? "core";
            return `excalidraw-${file.replace(/\.js$/, "")}`;
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
    allowedHosts: ["localhost", "5757-146-70-163-204.ngrok-free.app"]
  },
  test: {
    globals: true,
    environment: "node",
    // Testes de componente (`.test.tsx`) precisam de DOM real (render, click, assert em nós) —
    // `environmentMatchGlobs` mantém o resto da suíte (`.test.ts`, lógica pura) em "node", mais
    // rápido e sem custo de jsdom.
    environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
    setupFiles: ["./src/test/setup-jsdom.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
