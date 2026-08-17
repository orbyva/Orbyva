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

/** Vendor lazy (mermaid), gzip max por chunk — ver LAZY_VENDOR_RE. */
const MAX_LAZY_VENDOR_GZIP = 200 * 1024;

const VENDOR_RE =
  /^(react-vendor|recharts|d3|radix|supabase|sentry|motion|ui-utils|codemirror)-/;

/**
 * Chunks do mermaid (feature 057), carregados só quando uma nota tem um bloco ```mermaid — nunca no
 * caminho crítico de rota nenhuma. Por isso têm limite próprio em vez de entrar no teto de rota.
 *
 * Eles **não** passam por `manualChunks` de propósito: o mermaid já se divide por tipo de diagrama
 * (`sequenceDiagram`, `cynefin`, `architectureDiagram`…), então quem abre um flowchart baixa o
 * flowchart e mais nada. Forçar um chunk `mermaid` único foi medido: 888 KB gzip num arquivo só,
 * contra 133 KB do `mermaid.core` com a divisão natural. A consequência é esta lista de nomes, que
 * vem dos nomes de chunk do próprio mermaid, que carregam o sufixo de 8 caracteres do build dele
 * (`cynefin-VYW2F7L2`, `sequenceDiagram-SI44F4Z6`) — é esse sufixo que a segunda metade do regex
 * reconhece. Nome novo que escape da lista cai no teto de rota e **falha** aqui: falha ruidosa, de
 * conserto de uma linha, que é o comportamento desejado (o contrário seria um chunk gigante passar
 * despercebido).
 */
const LAZY_VENDOR_BASE_RE =
  /^(mermaid\.core|cytoscape|cose-bilkent|cose-base|layout-base|fcose|katex|dagre|roughjs)/;
/** `sequenceDiagram-SI44F4Z6-<hash do vite>.js` — o do meio é o sufixo do build do mermaid. */
const LAZY_VENDOR_FILE_RE = /-[A-Z0-9]{8}-[A-Za-z0-9_-]+\.js$/;

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
  } else if (LAZY_VENDOR_BASE_RE.test(base) || LAZY_VENDOR_FILE_RE.test(file)) {
    limit = MAX_LAZY_VENDOR_GZIP;
    kind = "lazy";
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
