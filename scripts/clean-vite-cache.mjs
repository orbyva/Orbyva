import { rmSync } from "node:fs";
import { resolve } from "node:path";

/** Evita deps otimizados pela metade (chunk-*.js sumindo com metadata antiga). */
const viteCache = resolve(process.cwd(), "node_modules/.vite");
try {
  rmSync(viteCache, { recursive: true, force: true });
} catch {
  // ignore
}
