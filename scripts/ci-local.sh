#!/usr/bin/env bash
# Espelha .github/workflows/ci.yml para rodar localmente (sem push).
# Uso: npm run ci:local
# Precisa de .env / .env.local com VITE_SUPABASE_* (build) e E2E_* (e2e autenticado).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

load_env_file() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    local key="${BASH_REMATCH[1]}"
    local val="${BASH_REMATCH[2]}"
    val="${val%%#*}"
    val="${val#"${val%%[![:space:]]*}"}"
    val="${val%"${val##*[![:space:]]}"}"
    if [[ "$val" =~ ^\"(.*)\"$ ]]; then val="${BASH_REMATCH[1]}"; fi
    if [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    export "$key=$val"
  done < "$file"
}

load_env_file .env
load_env_file .env.local

echo "==> npm audit (prod, high+)"
npm audit --omit=dev --audit-level=high

echo "==> lint"
npm run lint

echo "==> unit tests (env dummy como no CI)"
TZ=America/Sao_Paulo \
VITE_SUPABASE_URL=https://example.supabase.co \
VITE_SUPABASE_ANON_KEY=test-anon-key \
  npm run test

echo "==> build"
if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
  echo "ERRO: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local"
  exit 1
fi
npm run build

echo "==> bundle budget"
npm run check:bundle

echo "==> Lighthouse CI"
npx --yes @lhci/cli@0.15.x autorun

echo "==> Playwright Chromium (idempotente)"
npx playwright install chromium

echo "==> e2e"
if [[ -z "${E2E_EMAIL:-}" || -z "${E2E_PASSWORD:-}" ]]; then
  echo "AVISO: E2E_EMAIL / E2E_PASSWORD ausentes — specs autenticados serão skipped."
fi
npm run test:e2e

echo ""
echo "ci:local OK — audit → lint → test → build → bundle → lhci → e2e"
