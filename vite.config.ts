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
      minify: false,
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
  },
});
