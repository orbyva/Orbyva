/**
 * Pós-build: visita rotas públicas e grava HTML estático em dist/
 * para crawlers (Vercel serve o arquivo antes do rewrite SPA).
 *
 * Uso: node scripts/prerender.mjs
 * Requer dist/ já gerado (vite build) e Playwright instalado.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const ROUTES = [
  "/",
  "/financas-pessoais",
  "/metas",
  "/organizacao-pessoal",
  "/life-os",
  "/controle-financeiro",
  "/planejamento-pessoal",
  "/app-organizacao-pessoal",
  "/dentro-do-orcamento",
  "/about",
  "/blog",
  "/blog/o-que-e-life-os",
  "/blog/como-organizar-financas-e-metas",
  "/terms",
  "/privacy",
];

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

function waitForUrl(url, ms = 60_000) {
  const start = Date.now();
  return (async () => {
    while (Date.now() - start < ms) {
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Preview não respondeu: ${url}`);
  })();
}

function outPathForRoute(route) {
  if (route === "/") return path.join(dist, "index.html");
  const clean = route.replace(/^\//, "").replace(/\/$/, "");
  return path.join(dist, clean, "index.html");
}

async function main() {
  const indexProbe = path.join(dist, "index.html");
  try {
    await readFile(indexProbe, "utf8");
  } catch {
    console.error("dist/index.html ausente — rode vite build antes.");
    process.exit(1);
  }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const preview = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    }
  );

  let previewLog = "";
  preview.stdout?.on("data", (d) => {
    previewLog += d.toString();
  });
  preview.stderr?.on("data", (d) => {
    previewLog += d.toString();
  });

  const killPreview = () => {
    try {
      preview.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  };

  try {
    await waitForUrl(base);
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (launchErr) {
      console.warn("Chromium ausente — instalando via Playwright…");
      const { execSync } = await import("node:child_process");
      execSync("npx playwright install chromium", {
        cwd: root,
        stdio: "inherit",
      });
      browser = await chromium.launch({ headless: true });
    }
    try {
      for (const route of ROUTES) {
        const page = await browser.newPage();
        await page.addInitScript(() => {
          window.__ORBYVA_PRERENDER__ = true;
        });
        const url = `${base}${route}`;
        console.log(`prerender ${route}`);
        await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
        await page.waitForSelector("#conteudo, main h1, article h1", {
          timeout: 30_000,
        });
        // Garante que meta client-side já rodou
        await page.waitForTimeout(400);
        await page.evaluate(() => {
          document.getElementById("seo-noscript")?.remove();
        });
        const html = await page.content();
        const out = outPathForRoute(route);
        await mkdir(path.dirname(out), { recursive: true });
        await writeFile(out, html, "utf8");
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error(err);
    console.error(previewLog);
    killPreview();
    process.exit(1);
  }

  killPreview();
  console.log(`prerender ok (${ROUTES.length} rotas)`);
}

main();
