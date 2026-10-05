/**
 * orb-avatar — gera uma versão da Orb com o modelo de imagem do Gemini (feature 152).
 *
 * Body: { prompt, references: [{ mime, data(base64) }], today: "YYYY-MM-DD", timezone }
 * 200:  { id, user_id, url, prompt, model, is_active, created_at, remaining }
 *
 * Função própria, não ramo do `orb-agent`: entrada multimodal, saída binária, sem SSE e sem loop de
 * tools. É a única função da Orb que grava direto (fora do fluxo de proposta das tools): a cota
 * diária só existe se toda geração deixar linha em `orb_avatar`, então quem gera é quem grava.
 *
 * Segurança: JWT obrigatório, client anon + Authorization (RLS e policy do bucket são as do
 * usuário). A chave do Gemini vive só no secret. Nenhum log carrega prompt, referência nem imagem.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { GoogleGenAI } from "npm:@google/genai@2.21.0";

import { corsHeadersForRequest } from "../_shared/cors.ts";
import { buildImageRequest, extractPngBase64, OrbImageError, type ImageResponse } from "./gemini.ts";
import { buildOrbImagePrompt } from "./prompt.ts";
import { dailyWindow, parseGenerateRequest, remainingToday } from "./request.ts";

const DEFAULT_IMAGE_MODEL = "gemini-2.5-flash-image";
const DEFAULT_DAILY_LIMIT = 10;
/** 3 referências de 600 KB em base64 + prompt + folga do JSON. */
const MAX_BODY_BYTES = Math.round(2.5 * 1024 * 1024);
/** Geração de imagem é bem mais lenta que um turno de texto. */
const GENERATION_BUDGET_MS = 60_000;
const BUCKET = "orb-avatars";

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function dailyLimit(): number {
  const raw = Number.parseInt(Deno.env.get("ORB_IMAGE_DAILY_LIMIT") ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_LIMIT;
}

function providerMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return jsonResponse(
      { error: "Geração da Orb não configurada: falta GEMINI_API_KEY." },
      503,
      cors
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401, cors);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await db.auth.getUser();
  if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401, cors);

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse({ error: "Pedido inválido." }, 400, cors);
  }
  if (byteLength(rawBody) > MAX_BODY_BYTES) {
    return jsonResponse(
      { error: "Imagens grandes demais para um pedido só. Use imagens menores." },
      413,
      cors
    );
  }

  let request;
  try {
    request = parseGenerateRequest(JSON.parse(rawBody));
  } catch (err) {
    const message = err instanceof SyntaxError ? "Pedido inválido." : providerMessage(err);
    return jsonResponse({ error: message }, 400, cors);
  }

  const limit = dailyLimit();
  const { start, end } = dailyWindow(request.today, request.timezone);
  const { count, error: countError } = await db
    .from("orb_avatar")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", start)
    .lt("created_at", end);
  if (countError) {
    return jsonResponse({ error: "Não foi possível conferir a cota de hoje." }, 500, cors);
  }
  const used = count ?? 0;
  if (used >= limit) {
    return jsonResponse(
      {
        error: `Você já gerou ${limit} versões da Orb hoje. A cota volta amanhã, à meia-noite.`,
        remaining: 0,
        limit,
      },
      429,
      cors
    );
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const model = Deno.env.get("ORB_IMAGE_MODEL") || DEFAULT_IMAGE_MODEL;
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  let base64: string;
  try {
    const params = buildImageRequest({
      model,
      prompt: buildOrbImagePrompt(request.prompt),
      references: request.references,
    });
    const response = await ai.models.generateContent({
      ...params,
      config: { ...params.config, abortSignal: AbortSignal.timeout(GENERATION_BUDGET_MS) },
    });
    base64 = extractPngBase64(response as unknown as ImageResponse).base64;
  } catch (err) {
    if (err instanceof OrbImageError) {
      console.warn(`[orb-avatar] ${requestId} ${err.kind} ${err.reason ?? ""}`);
      return jsonResponse({ error: err.message }, err.kind === "refused" ? 422 : 502, cors);
    }
    console.error(`[orb-avatar] ${requestId} provider error after ${Date.now() - startedAt}ms`);
    return jsonResponse(
      { error: `O modelo de imagem falhou: ${providerMessage(err)}` },
      502,
      cors
    );
  }

  const bytes = base64ToBytes(base64);
  const path = `${user.id}/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: false });
  if (uploadError) {
    return jsonResponse({ error: "Não foi possível salvar a imagem gerada." }, 500, cors);
  }
  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // Falha no insert depois do upload deixa o arquivo órfão no bucket, de propósito (mesma escolha
  // de `src/api/tasks/iconAssets.ts`): apagar no catch esconderia o erro real atrás de outro.
  const { data: row, error: insertError } = await db
    .from("orb_avatar")
    .insert({ user_id: user.id, prompt: request.prompt, url, model, is_active: false })
    .select("id, user_id, url, prompt, model, is_active, created_at")
    .single();
  if (insertError || !row) {
    return jsonResponse({ error: "Não foi possível registrar a versão gerada." }, 500, cors);
  }

  console.log(
    `[orb-avatar] ${requestId} ok ${Date.now() - startedAt}ms ${bytes.length}B`
  );
  return jsonResponse({ ...row, remaining: remainingToday(used + 1, limit) }, 200, cors);
});
