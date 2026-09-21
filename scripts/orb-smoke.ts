/**
 * Smoke da Orb contra a API real do Gemini, sem Deno e sem banco.
 *
 * POR QUE ISTO EXISTE: `supabase/functions/orb-agent/index.ts` roda em Deno e não é coberto por
 * `tsc -b` nem pelo Vitest — erro de contrato com o modelo só apareceria depois do deploy. Este
 * script reproduz o miolo do loop (mesmo catálogo de tools, mesma montagem de
 * `functionDeclarations`, mesmo formato de `functionResponse`) usando o `fakeDb` da suíte no lugar
 * do Supabase. Se ele passa, o que sobra de risco na Edge é só o que é específico do Deno.
 *
 * Uso:  npm run orb:smoke               (pergunta padrão sobre gastos)
 *       npm run orb:smoke -- "sua pergunta aqui"
 *
 * Precisa de GEMINI_API_KEY no `.env` da raiz. Gasta tokens de verdade — é uma chamada por rodada.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GoogleGenAI } from "@google/genai";

import { orbTools, runOrbTool } from "../supabase/functions/_shared/orb/registry.ts";
import { orbSystemContext, orbSystemPolicy } from "../supabase/functions/orb-agent/prompt.ts";
import { fakeDb } from "../src/domain/orb/__tests__/fakeDb.ts";

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
const modelo = lerEnv("ORB_MODEL") || "gemini-3.1-flash-lite";
const pergunta = process.argv.slice(2).join(" ") || "Quanto eu gastei com alimentação esse mês?";
const hoje = new Date().toISOString().slice(0, 10);
const timezone = "America/Sao_Paulo";

/** Espelha `index.ts`: tool sem parâmetro nenhum vai SEM `parametersJsonSchema`. */
const functionDeclarations = orbTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  ...(Object.keys(tool.inputSchema.properties ?? {}).length > 0
    ? { parametersJsonSchema: tool.inputSchema }
    : {}),
}));

const systemInstruction = `${orbSystemPolicy()}\n\n${orbSystemContext({
  today: hoje,
  timezone,
  userName: "Rafael",
})}`;

/** Extrato mínimo, só para as tools terem o que devolver. O banco real não é tocado. */
const db = fakeDb({
  transaction: [
    linha(1, "Mercado", 240.5, `${hoje.slice(0, 7)}-03`, "Supermercado", "Alimentação", "Despesa"),
    linha(2, "Hamburgueria", 89.9, `${hoje.slice(0, 7)}-06`, "Fast-food", "Alimentação", "Despesa"),
    linha(3, "Salário", 7500, `${hoje.slice(0, 7)}-01`, "Salário", "Renda", "Receita"),
  ],
});

function linha(
  id: number,
  description: string,
  value: number,
  transaction_at: string,
  classe: string,
  tipo: string,
  natureza: string
) {
  return {
    id,
    value,
    description,
    transaction_at,
    installment_number: null,
    class: {
      id,
      name: classe,
      type: { name: tipo, exclude_from_spend: false, nature: { name: natureza } },
    },
  };
}

const ctx = { db, userId: "smoke", today: hoje, timezone };
const ai = new GoogleGenAI({ apiKey: chave });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const conversation: any[] = [{ role: "user", parts: [{ text: pergunta }] }];

const uso = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, thinking_tokens: 0 };
let resposta = "";
let assinaturasVistas = 0;

const semParametro = functionDeclarations.filter((f) => !("parametersJsonSchema" in f)).length;
console.log(
  `Catálogo: ${functionDeclarations.length} tools (${semParametro} sem parâmetro). Modelo: ${modelo}.`
);
console.log(`Pergunta: ${pergunta}\n`);

for (let rodada = 0; rodada < 8; rodada += 1) {
  const turn = await ai.models.generateContentStream({
    model: modelo,
    contents: conversation,
    config: {
      systemInstruction,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false },
      tools: [{ functionDeclarations }],
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partesDoModelo: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chamadas: any[] = [];
  let motivo: string | undefined;

  for await (const chunk of turn) {
    const u = chunk.usageMetadata;
    if (u) {
      uso.input_tokens += u.promptTokenCount ?? 0;
      uso.output_tokens += u.candidatesTokenCount ?? 0;
      uso.cache_read_input_tokens += u.cachedContentTokenCount ?? 0;
      uso.thinking_tokens += u.thoughtsTokenCount ?? 0;
    }
    const candidato = chunk.candidates?.[0];
    if (candidato?.finishReason) motivo = String(candidato.finishReason);
    for (const parte of candidato?.content?.parts ?? []) {
      partesDoModelo.push(parte);
      if (parte.thoughtSignature) assinaturasVistas += 1;
      if (parte.functionCall?.name) {
        chamadas.push({
          name: parte.functionCall.name,
          args: parte.functionCall.args ?? {},
          bruta: parte.functionCall,
        });
      } else if (typeof parte.text === "string" && parte.text !== "" && !parte.thought) {
        resposta += parte.text;
        process.stdout.write(parte.text);
      }
    }
  }

  if (chamadas.length === 0) {
    console.log(`\n\n[rodada ${rodada + 1}] finishReason=${motivo} — turno encerrado.`);
    break;
  }

  console.log(`\n[rodada ${rodada + 1}] ${chamadas.length} consulta(s):`);
  conversation.push({ role: "model", parts: partesDoModelo });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const respostas: any[] = [];
  for (const call of chamadas) {
    const { ok, result } = await runOrbTool(call.name, call.args, ctx);
    console.log(`  → ${call.name}(${JSON.stringify(call.args)}) ok=${ok}`);
    respostas.push({
      functionResponse: {
        ...(call.bruta.id ? { id: call.bruta.id } : {}),
        name: call.name,
        response: ok ? { output: result } : { error: result },
      },
    });
  }
  conversation.push({ role: "user", parts: respostas });
}

console.log(`\n--- uso --- ${JSON.stringify(uso)}`);
console.log(`--- partes com thoughtSignature preservadas: ${assinaturasVistas} ---`);
if (uso.cache_read_input_tokens > 0) {
  console.log("--- cache implícito do Gemini pegou o prefixo ---");
}
if (!resposta.trim()) {
  console.error("\nFALHOU: o modelo não produziu texto.");
  process.exit(1);
}
console.log("\nOK: loop de function calling completo, com texto final.");
