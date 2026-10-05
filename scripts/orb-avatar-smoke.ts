/**
 * Smoke da geração de versão da Orb contra a API real do Gemini, sem Deno e sem banco.
 *
 * POR QUE ISTO EXISTE: `supabase/functions/orb-avatar/index.ts` roda em Deno e não é coberto por
 * `tsc -b` nem pelo Vitest. Este script usa os mesmos módulos puros da função (`prompt.ts` e
 * `gemini.ts`) e faz a chamada de verdade — se ele volta um PNG, o contrato com o modelo está certo
 * e o que sobra de risco na Edge é só o que é específico do Deno (auth, banco, bucket).
 *
 * Uso:  npm run orb:avatar-smoke
 *       npm run orb:avatar-smoke -- "esfera de vidro azul com faíscas"
 *
 * Precisa de GEMINI_API_KEY no `.env` da raiz. Gasta uma geração de imagem de verdade.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleGenAI } from "@google/genai";

import {
  buildImageRequest,
  extractPngBase64,
  type ImageResponse,
} from "../supabase/functions/orb-avatar/gemini.ts";
import { buildOrbImagePrompt } from "../supabase/functions/orb-avatar/prompt.ts";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

function lerEnv(chave: string): string | undefined {
  if (process.env[chave]) return process.env[chave];
  try {
    const conteudo = readFileSync(join(raiz, ".env"), "utf8");
    const achado = new RegExp(`^${chave}=(.*)$`, "m").exec(conteudo);
    return achado?.[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

const chave = lerEnv("GEMINI_API_KEY");
if (!chave) {
  console.error("Falta GEMINI_API_KEY no .env da raiz (ou no ambiente).");
  process.exit(1);
}
const modelo = lerEnv("ORB_IMAGE_MODEL") || "gemini-2.5-flash-image";
const pedido =
  process.argv.slice(2).join(" ") || "uma esfera roxa com um anel de luz suave em volta";

/** PNG 8×8 roxo, só para provar que a referência multimodal passa pelo contrato. */
const REFERENCIA_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGNoMH6GFTEMLQkA2pFmQfY6FfsAAAAASUVORK5CYII=";

const ai = new GoogleGenAI({ apiKey: chave });
const pedidoGemini = buildImageRequest({
  model: modelo,
  prompt: buildOrbImagePrompt(pedido),
  references: [{ mime: "image/png", data: REFERENCIA_PNG }],
});

const inicio = Date.now();
try {
  const resposta = await ai.models.generateContent(
    pedidoGemini as unknown as Parameters<typeof ai.models.generateContent>[0]
  );
  const { base64 } = extractPngBase64(resposta as unknown as ImageResponse);
  const bytes = Buffer.from(base64, "base64");
  const destino = join("/tmp", `orb-avatar-smoke-${Date.now()}.png`);
  writeFileSync(destino, bytes);
  const assinaturaPng = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  console.log(`modelo:   ${modelo}`);
  console.log(`duração:  ${Date.now() - inicio} ms`);
  console.log(`tamanho:  ${bytes.length} bytes`);
  console.log(`png:      ${assinaturaPng ? "sim (assinatura confere)" : "NÃO — assinatura diferente"}`);
  console.log(`arquivo:  ${destino}`);
  if (!assinaturaPng) process.exit(2);
} catch (err) {
  console.error(`falhou em ${Date.now() - inicio} ms com o modelo ${modelo}:`);
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
