#!/usr/bin/env node
/**
 * Fase D, falha o CI se chunks gzip estourarem o orçamento.
 * Rode após `npm run build` (lê dist/assets/*.js).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, "..", "dist", "assets");

/** Entry / shell (index-*.js), gzip max */
const MAX_ENTRY_GZIP = 380 * 1024;
/** Qualquer outro chunk de app (rotas), gzip max */
const MAX_ROUTE_GZIP = 160 * 1024;
/** Vendor pesado permitido (recharts etc.), gzip max */
const MAX_VENDOR_GZIP = 200 * 1024;

const VENDOR_RE =
  /^(react-vendor|recharts|radix|supabase|sentry|motion|ui-utils)-/;

function gzipSize(buf) {
  return zlib.gzipSync(buf).length;
}

function fmt(n) {
  return `${(n / 1024).toFixed(1)} KB`;
}

if (!fs.existsSync(assetsDir)) {
  console.error(`Bundle budget: pasta ausente ${assetsDir}. Rode o build antes.`);
  process.exit(1);
}

const files = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith(".js") && !f.endsWith(".map"));

if (files.length === 0) {
  console.error("Bundle budget: nenhum .js em dist/assets.");
  process.exit(1);
}

let failed = false;
const rows = [];

for (const file of files) {
  const raw = fs.readFileSync(path.join(assetsDir, file));
  const gz = gzipSize(raw);
  const base = file.replace(/-[A-Za-z0-9_-]{6,}\.js$/, "").replace(/\.js$/, "");
  let limit = MAX_ROUTE_GZIP;
  let kind = "route";
  if (base === "index" || file.startsWith("index-")) {
    limit = MAX_ENTRY_GZIP;
    kind = "entry";
  } else if (VENDOR_RE.test(base) || VENDOR_RE.test(file)) {
    limit = MAX_VENDOR_GZIP;
    kind = "vendor";
  }
  const ok = gz <= limit;
  rows.push({ file, kind, gz, limit, ok });
  if (!ok) failed = true;
}

rows.sort((a, b) => b.gz - a.gz);
console.log("Bundle budget (gzip):");
for (const r of rows) {
  const mark = r.ok ? "OK " : "FAIL";
  console.log(
    `  [${mark}] ${r.kind.padEnd(6)} ${fmt(r.gz).padStart(8)} / ${fmt(r.limit).padStart(8)}  ${r.file}`
  );
}

if (failed) {
  console.error("\nBundle budget excedido. Ajuste splits ou o limite em scripts/check-bundle-budget.mjs.");
  process.exit(1);
}

console.log("\nBundle budget OK.");
