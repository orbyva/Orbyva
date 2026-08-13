/**
 * Minifica o service worker gerado (dist/sw.js + dist/workbox-*.js).
 * O generateSW roda em mode development (crash do @rollup/plugin-terser 1.0.0
 * em mode production); aqui aplicamos esbuild minify + drop do dev-log.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "esbuild";

const dist = new URL("../dist", import.meta.url).pathname;

const targets = readdirSync(dist).filter(
  (f) => f === "sw.js" || (f.startsWith("workbox-") && f.endsWith(".js"))
);

if (targets.length === 0) {
  console.error("minify-sw: nenhum sw.js/workbox-*.js em dist/, rode o build antes.");
  process.exit(1);
}

for (const file of targets) {
  const path = join(dist, file);
  const before = statSync(path).size;
  const source = readFileSync(path, "utf8");
  const { code } = transformSync(source, {
    minify: true,
    target: "es2019",
    // Workbox dev usa process.env.NODE_ENV para gating de logs.
    define: { "process.env.NODE_ENV": '"production"' },
  });
  writeFileSync(path, code);
  const after = statSync(path).size;
  console.log(
    `minify-sw: ${file} ${(before / 1024).toFixed(1)}kB → ${(after / 1024).toFixed(1)}kB`
  );
}
