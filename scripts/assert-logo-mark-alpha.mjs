#!/usr/bin/env node
/**
 * Garante que public/logo-mark.png tem corners transparentes e mark azul opaco.
 * O centro geométrico pode ser transparente (buraco do "O").
 * Uso: node scripts/assert-logo-mark-alpha.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const path = "public/logo-mark.png";
if (!existsSync(path)) {
  console.error(`missing ${path}`);
  process.exit(1);
}

function pixel(expr) {
  return execFileSync(
    "magick",
    [path, "-format", `%[pixel:${expr}]`, "info:"],
    { encoding: "utf8" }
  ).trim();
}

function alphaIsZero(px) {
  if (/^none$/i.test(px)) return true;
  const m = px.match(/,\s*([0-9.]+)\s*\)\s*$/);
  if (!m) return false;
  return Number(m[1]) === 0;
}

function looksLikeMarkInk(px) {
  // srgba / srgba com azul dominante e alpha > 0.5, ou srgb opaco azul
  const m = px.match(
    /srgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/i
  );
  if (!m) return false;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a < 0.5) return false;
  // Mark Orbyva: azul (#0EA5E9-ish) — B alto, R baixo
  return b > 150 && b > r && g > 80;
}

const corners = [
  "p{0,0}",
  "p{%[fx:w-1],0}",
  "p{0,%[fx:h-1]}",
  "p{%[fx:w-1],%[fx:h-1]}",
];

for (const expr of corners) {
  const px = pixel(expr);
  if (!alphaIsZero(px)) {
    console.error(`Corner not transparent: ${expr} => ${px}`);
    process.exit(1);
  }
}

// Anel superior (buraco do O fica no centro; a tinta fica ~y=200 em 1024)
const ink = pixel("p{%[fx:int(w/2)],200}");
if (!looksLikeMarkInk(ink)) {
  console.error(`Mark ink missing at top ring: ${ink}`);
  process.exit(1);
}

console.log("logo-mark alpha ok");
