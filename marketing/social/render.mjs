#!/usr/bin/env node
/*
 * Renderiza as peças sociais do Orbyva.
 *
 *   node render.mjs posts            → out/posts/*.png      (1080×1350)
 *   node render.mjs videos           → out/videos/*.mp4     (1080×1920)
 *   node render.mjs profile          → out/profile/*.png    (1080×1080)
 *   node render.mjs highlights       → out/highlights/*.png (1080×1920)
 *   node render.mjs all
 *   node render.mjs posts 03         → só as peças cujo nome contém "03"
 *
 * Vídeo é capturado quadro a quadro com a timeline das animações CSS travada
 * (Web Animations API) — o resultado é determinístico, não uma gravação de tela.
 */

import { chromium } from "playwright";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const FPS = 30;

const SIZES = {
  posts: { width: 1080, height: 1350 },
  videos: { width: 1080, height: 1920 },
  profile: { width: 1080, height: 1080 },
  highlights: { width: 1080, height: 1920 },
};

async function listPieces(kind, filter) {
  const dir = path.join(HERE, kind);
  const files = await fs.readdir(dir).catch(() => []);
  return files
    .filter((f) => f.endsWith(".html"))
    .filter((f) => !filter || f.includes(filter))
    .sort()
    .map((f) => ({ name: path.basename(f, ".html"), file: path.join(dir, f) }));
}

/** Espera fontes, kit e layout estabilizarem antes de capturar. */
async function settle(page) {
  await page.waitForFunction(() => window.__orbyvaKitReady === true);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  );
}

/*
 * Rede de proteção: texto que estoura o palco sai cortado no PNG sem erro
 * nenhum. Aqui comparamos cada elemento com a área útil do .stage.
 */
async function checkOverflow(page, name) {
  const bad = await page.evaluate(() => {
    const stage = document.querySelector(".stage");
    const s = stage.getBoundingClientRect();
    const cs = getComputedStyle(stage);
    const pad = {
      t: parseFloat(cs.paddingTop),
      r: parseFloat(cs.paddingRight),
      b: parseFloat(cs.paddingBottom),
      l: parseFloat(cs.paddingLeft),
    };
    const out = [];
    stage.querySelectorAll("*").forEach((n) => {
      // sangram por projeto: assinatura, atmosfera e a lavada de fundo dos vídeos
      if (n.closest(".orbit-sig, .atmo, .sky-wash") || n.tagName === "svg" || n.closest("svg")) return;
      const r = n.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const over = [];
      if (r.top < s.top + pad.t - 2) over.push(`topo ${Math.round(s.top + pad.t - r.top)}px`);
      if (r.bottom > s.bottom - pad.b + 2) over.push(`base ${Math.round(r.bottom - s.bottom + pad.b)}px`);
      if (r.left < s.left + pad.l - 2) over.push(`esq ${Math.round(s.left + pad.l - r.left)}px`);
      if (r.right > s.right - pad.r + 2) over.push(`dir ${Math.round(r.right - s.right + pad.r)}px`);
      if (over.length) {
        const tag = n.className && typeof n.className === "string"
          ? "." + n.className.split(" ").filter(Boolean)[0]
          : n.tagName.toLowerCase();
        out.push(`${tag} → ${over.join(", ")}`);
      }
    });
    return [...new Set(out)];
  });
  if (bad.length) {
    console.log(`    ⚠ ${name} estoura o palco:`);
    bad.slice(0, 6).forEach((b) => console.log(`        ${b}`));
  }
  return bad.length === 0;
}

async function renderStills(browser, kind, filter) {
  const pieces = await listPieces(kind, filter);
  if (!pieces.length) return [];
  const dir = path.join(OUT, kind);
  await fs.mkdir(dir, { recursive: true });

  const page = await browser.newPage({
    viewport: SIZES[kind],
    deviceScaleFactor: 1,
  });

  const done = [];
  for (const { name, file } of pieces) {
    await page.goto(`file://${file}`);
    await settle(page);
    await checkOverflow(page, name);
    const stage = page.locator(".stage").first();
    const out = path.join(dir, `${name}.png`);
    await stage.screenshot({ path: out });
    console.log(`  ✓ ${kind}/${name}.png`);
    done.push(out);
  }
  await page.close();
  return done;
}

async function renderVideos(browser, filter) {
  const pieces = await listPieces("videos", filter);
  if (!pieces.length) return [];
  const dir = path.join(OUT, "videos");
  await fs.mkdir(dir, { recursive: true });

  const page = await browser.newPage({
    viewport: SIZES.videos,
    deviceScaleFactor: 1,
  });

  const done = [];
  for (const { name, file } of pieces) {
    await page.goto(`file://${file}`);
    await settle(page);

    const duration = await page.evaluate(() =>
      Number(document.querySelector('meta[name="duration"]')?.content || 8)
    );

    // Trava a timeline: sem isso cada screenshot pegaria um instante diferente.
    await page.evaluate(() => {
      document.getAnimations().forEach((a) => a.pause());
    });

    // O palco vertical é mais apertado no fecho, quando tudo já entrou.
    await page.evaluate((ms) => {
      document.getAnimations().forEach((a) => {
        a.pause();
        a.currentTime = ms;
      });
    }, duration * 1000 * 0.97);
    await checkOverflow(page, name);

    const frames = Math.round(duration * FPS);
    const tmp = path.join(dir, `.frames-${name}`);
    await fs.rm(tmp, { recursive: true, force: true });
    await fs.mkdir(tmp, { recursive: true });

    const stage = page.locator(".stage").first();
    for (let i = 0; i < frames; i++) {
      const t = (i / FPS) * 1000;
      await page.evaluate((ms) => {
        document.getAnimations().forEach((a) => {
          a.pause();
          a.currentTime = ms;
        });
        // números contando: o CSS anima só o progresso, o kit formata
        window.__orbyvaTick?.();
      }, t);
      await stage.screenshot({
        path: path.join(tmp, String(i).padStart(5, "0") + ".png"),
      });
    }

    // Capa do Reel: quadro já com a mensagem final montada.
    const coverIdx = Math.min(frames - 1, Math.round(frames * 0.93));
    await fs.copyFile(
      path.join(tmp, String(coverIdx).padStart(5, "0") + ".png"),
      path.join(dir, `${name}-capa.png`)
    );

    const mp4 = path.join(dir, `${name}.mp4`);
    await run("ffmpeg", [
      "-y", "-loglevel", "error",
      "-framerate", String(FPS),
      "-i", path.join(tmp, "%05d.png"),
      "-c:v", "libx264",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-preset", "slow",
      "-crf", "19",
      "-r", String(FPS),
      "-movflags", "+faststart",
      mp4,
    ]);
    await fs.rm(tmp, { recursive: true, force: true });

    console.log(`  ✓ videos/${name}.mp4 (${duration}s, ${frames} quadros)`);
    done.push(mp4);
  }
  await page.close();
  return done;
}

/*
 * Contact sheet do feed na ordem de publicação — serve para conferir se o
 * perfil lê como uma marca só (ritmo ink/paper, lockup na mesma posição).
 * Ordem definida em docs/social-media.md § "Ordem recomendada de publicação".
 */
const FEED_ORDER = [
  "01-apresentacao", "02-problema", "03-financas",
  "12-integracao", "07-metas", "04-orcamento",
  "05-recorrencias", "06-habitos", "13-saude",
  "14-tarefas", "08-viagens", "09-lugares",
  "11-entretenimento", "10-veiculos", "15-notas-compras",
  "16-orb",
]; // igual à tabela de ordem em docs/social-media.md § 4

async function contactSheet() {
  const src = path.join(OUT, "posts");
  const tmp = path.join(OUT, ".contact");
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(tmp, { recursive: true });

  for (const [i, name] of FEED_ORDER.entries()) {
    await fs.copyFile(
      path.join(src, `${name}.png`),
      path.join(tmp, String(i + 1).padStart(2, "0") + ".png")
    );
  }

  const out = path.join(OUT, "feed-grid.png");
  await run("ffmpeg", [
    "-y", "-loglevel", "error",
    "-i", path.join(tmp, "%02d.png"),
    "-vf", `scale=360:450,tile=3x${Math.ceil(FEED_ORDER.length / 3)}:margin=16:padding=10:color=#1b1b1d`,
    "-frames:v", "1",
    out,
  ]);
  await fs.rm(tmp, { recursive: true, force: true });
  console.log(`  ✓ feed-grid.png (ordem de publicação)`);
}

/*
 * Playwright 1.61 resolve o host como mac-x64 neste macOS (Darwin 25) e não
 * encontra os binários, que estão instalados como mac-arm64. Em vez de mexer no
 * cache do usuário, localizamos o executável e passamos explicitamente.
 * Override manual: ORBYVA_CHROMIUM=/caminho/do/binario
 */
async function launchChromium() {
  try {
    return await chromium.launch();
  } catch (err) {
    if (!/Executable doesn't exist/.test(String(err))) throw err;

    const roots = [
      process.env.PLAYWRIGHT_BROWSERS_PATH,
      path.join(process.env.HOME || "", "Library/Caches/ms-playwright"),
      path.join(process.env.HOME || "", ".cache/ms-playwright"),
    ].filter(Boolean);

    const suffixes = [
      ["chromium_headless_shell", "chrome-headless-shell"],
      ["chromium", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
      ["chromium", "Chromium.app/Contents/MacOS/Chromium"],
      ["chromium", "chrome"],
    ];

    for (const root of roots) {
      const dirs = await fs.readdir(root).catch(() => []);
      for (const [prefix, bin] of suffixes) {
        for (const dir of dirs.filter((d) => d.startsWith(prefix + "-"))) {
          const base = path.join(root, dir);
          for (const arch of await fs.readdir(base).catch(() => [])) {
            const exe = path.join(base, arch, bin);
            if (await fs.access(exe).then(() => true, () => false)) {
              console.log(`  (usando ${path.relative(root, exe)})`);
              return chromium.launch({ executablePath: exe });
            }
          }
        }
      }
    }
    throw new Error(
      "Chromium não encontrado. Rode `npx playwright install chromium` " +
        "ou defina ORBYVA_CHROMIUM com o caminho do binário."
    );
  }
}

const kinds = process.argv[2] === "all" || !process.argv[2]
  ? ["posts", "videos", "profile", "highlights"]
  : [process.argv[2]];
const filter = process.argv[3];

if (kinds.length === 1 && kinds[0] === "contact") {
  console.log("\ncontact:");
  await contactSheet();
} else {
  const browser = process.env.ORBYVA_CHROMIUM
    ? await chromium.launch({ executablePath: process.env.ORBYVA_CHROMIUM })
    : await launchChromium();
  for (const kind of kinds) {
    console.log(`\n${kind}:`);
    if (kind === "videos") await renderVideos(browser, filter);
    else await renderStills(browser, kind, filter);
  }
  await browser.close();
  if (kinds.includes("posts")) {
    console.log("\ncontact:");
    await contactSheet();
  }
}
console.log("\nSaída em marketing/social/out/");
