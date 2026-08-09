/// <reference types="vitest/config" />
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSafariHmrNoReload } from "./vite.safari-hmr";

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
          "Tudo da sua vida em uma só órbita — finanças, hábitos, metas, viagens e mais.",
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
        // trava em worker) — geramos dev e minificamos em scripts/minify-sw.mjs.
        mode: "development",
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,ico,webp,svg,woff2,png}"],
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
          // Utils pequenos — NÃO deixar cair no chunk do recharts (clsx era engolido).
          if (
            id.includes("clsx") ||
            id.includes("tailwind-merge") ||
            id.includes("class-variance-authority")
          ) {
            return "ui-utils";
          }
          if (
            id.includes("node_modules/recharts") ||
            id.includes("node_modules/victory-vendor") ||
            id.includes("node_modules/d3-")
          ) {
            return "recharts";
          }
          if (id.includes("framer-motion")) return "motion";
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
      /** Capas Google Books — CORS quebra canvas do share. */
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
    allowedHosts: ["localhost", "upswing-repose-easter.ngrok-free.dev"]
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
