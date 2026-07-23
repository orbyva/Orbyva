/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_TMDB_API_KEY?: string;
  readonly VITE_OMDB_API_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_BILLING_FORCE_PRO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
