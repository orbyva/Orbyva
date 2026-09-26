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

/** Vendor lazy (mermaid), gzip max por chunk — ver LAZY_VENDOR_BASE_RE. */
const MAX_LAZY_VENDOR_GZIP = 200 * 1024;

/**
 * Chunks do excalidraw (feature 058), classe própria — ver EXCALIDRAW_RE.
 *
 * **Nenhum teto foi afrouxado para caber o canvas**: rota continua 160 KB, vendor 200 KB e vendor
 * lazy 200 KB. O que existe aqui é uma classe nova, para um vendor que só é baixado quando o
 * usuário abre um canvas e que nunca encosta num chunk de rota (medido: `NoteDetail` 9,3 KB gzip
 * com o canvas ligado, contra 8,4 KB antes).
 *
 * O limite é 1.600 KB porque o canvas vive num único chunk `excalidraw` (medido: ~1.532 KB gzip).
 * Um chunk por arquivo do pacote foi tentado para preservar locales e **quebrou o boot em
 * produção** (2026-08-31): chunks circulares, `TypeError: $ is not a function`, landing presa no
 * `#boot`. Não voltar a fatiar por arquivo. Se este teto subir, é a lib que cresceu.
 *
 * Estes chunks ficam **fora do precache do service worker** (`globIgnores` no `vite.config.ts`),
 * senão todo usuário do app baixaria 4,7 MB de canvas na instalação do PWA.
 */
const MAX_EXCALIDRAW_GZIP = 1600 * 1024;

/**
 * O prefixo `excalidraw-` vem do `manualChunks` (um chunk só para o pacote) — é estável, ao
 * contrário do nome que o Rollup daria sozinho (`percentages-BXMCSKIN-…`, tirado de um símbolo
 * qualquer de dentro do bundle da lib).
 */
const EXCALIDRAW_RE =
  /^(excalidraw-|percentages-BXMCSKIN|subset-shared|ExcalidrawCanvas)/i;

const VENDOR_RE =
  /^(react-vendor|recharts|d3|radix|supabase|sentry|motion|ui-utils|codemirror|vite-runtime)-/;

/**
 * Chunks do mermaid (feature 057) e do excalidraw (feature 058), carregados só quando uma nota tem
 * um bloco ```mermaid ou o usuário abre um canvas — nunca no caminho crítico de rota nenhuma. Por
 * isso têm limite próprio em vez de entrar no teto de rota. Desde a 069, `lowlight` (realce de
 * código, baixado só quando a nota tem bloco de código) entra na mesma classe — ele ganha nome
 * estável pelo `manualChunks` do `vite.config.ts`, senão sairia como `index-…`, que esta regra
 * confundiria com o chunk de entrada do app.
 *
 * O `excalidraw` **tem** `manualChunks` (ao contrário do mermaid): ele não se divide sozinho por
 * funcionalidade, é um aplicativo de desenho inteiro, e sem a regra o Rollup espalharia pedaços
 * dele por chunks compartilhados com rota. Um arquivo só, carregado por `React.lazy`. Fatiar
 * por arquivo do pacote quebra o boot — ver `MAX_EXCALIDRAW_GZIP`.
 *
 * Desde a 070, as gramáticas de fence do editor (`cm-lang-javascript`, `cm-lang-python`…) entram
 * na mesma classe, pelo mesmo motivo do `lowlight`: são baixadas só quando a nota tem um bloco
 * daquela linguagem, e o `manualChunks` do `vite.config.ts` lhes dá nome estável — sem ele saíam
 * como `index-…`, que esta regra confundiria com o chunk de entrada do app.
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
  /^(mermaid\.core|cytoscape|cose-bilkent|cose-base|layout-base|fcose|katex|dagre|roughjs|lowlight|cm-lang-)/;
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
  } else if (EXCALIDRAW_RE.test(base) || EXCALIDRAW_RE.test(file) || /ExcalidrawCanvas/i.test(file)) {
    limit = MAX_EXCALIDRAW_GZIP;
    kind = "canvas";
  } else if (gz > 400 * 1024 && kind !== "entry") {
    // Sem `manualChunks`, o Rollup batiza o canvas com um símbolo interno da lib
    // (`percentages-…`). Qualquer JS > 400 KB gzip que não seja o entry é o canvas.
    limit = MAX_EXCALIDRAW_GZIP;
    kind = "canvas";
  } else if (VENDOR_RE.test(base) || VENDOR_RE.test(file)) {
    limit = MAX_VENDOR_GZIP;
    kind = "vendor";
  } else if (
    LAZY_VENDOR_BASE_RE.test(base) ||
    // Também contra o nome do arquivo, como as duas regras acima: nome com hífen no meio
    // (`cm-lang-javascript-<hash>.js`) é encurtado demais pelo `base` — ele vira só `cm`.
    LAZY_VENDOR_BASE_RE.test(file) ||
    LAZY_VENDOR_FILE_RE.test(file)
  ) {
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

/**
 * O split do Excalidraw puxou o grafo do canvas para o `index` (helper de preload do Vite
 * num chunk do canvas). Import estático de qualquer chunk `canvas` = landing em branco.
 */
const html = fs.readFileSync(path.join(__dirname, "..", "dist", "index.html"), "utf8");
const entryHref = html.match(/src="\/assets\/(index-[^"]+\.js)"/)?.[1];
const canvasFiles = new Set(rows.filter((r) => r.kind === "canvas").map((r) => r.file));
if (entryHref) {
  const src = fs.readFileSync(path.join(assetsDir, entryHref), "utf8");
  const imported = [...src.matchAll(/(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)].map(
    (m) => m[1]
  );
  const leaked = imported.filter((name) => canvasFiles.has(name) || /excalidraw/i.test(name));
  if (leaked.length > 0) {
    console.error(
      `\nEntry ${entryHref} importa o canvas no boot: ${leaked.join(", ")}`
    );
    failed = true;
  }
} else {
  console.error("\nindex.html sem script de entry em /assets/index-*.js");
  failed = true;
}

if (failed) {
  console.error("\nBundle budget excedido. Ajuste splits ou o limite em scripts/check-bundle-budget.mjs.");
  process.exit(1);
}

console.log("\nBundle budget OK.");
