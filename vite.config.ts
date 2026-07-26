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
            src: "/pwa-512.png",
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
        globPatterns: ["**/*.{js,css,html,ico,webp,svg,woff2,png}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/tmdb-media/],
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
          if (id.includes("recharts") || id.includes("/d3-")) return "recharts";
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
    proxy: {
      "/tmdb-media": {
        target: "https://image.tmdb.org",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tmdb-media/, ""),
      },
    },
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
