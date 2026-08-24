#!/usr/bin/env node
/**
 * Smoke de evals do Orb — roda contra o Supabase LOCAL, nunca produção.
 *
 * Cada caso é uma conversa real com a Edge `orb-agent`, então gasta tokens de
 * verdade (~$0,01 por turno no Haiku). Por isso fica fora de `npm run test`:
 * rode explicitamente com `npm run eval:orb` depois de mexer em prompt.ts,
 * nas tools ou no modelo.
 *
 * Só passa se o ambiente local estiver de pé (`supabase start` +
 * `supabase functions serve`).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const API = process.env.ORB_EVAL_API ?? "http://127.0.0.1:54321";
// Usuário próprio dos evals: a biblioteca é zerada a cada execução, então não
// dá pra reaproveitar a conta que a pessoa usa pra testar no navegador — o
// bootstrap manda a biblioteca no prompt, e um item já marcado muda a resposta
// (o Orb corretamente deixa de propor o que já está lá).
const EMAIL = process.env.ORB_EVAL_EMAIL ?? "orb-eval@orbyva.local";
const PASSWORD = process.env.ORB_EVAL_PASSWORD ?? "orb-eval-123456";
const SERVICE_KEY =
  process.env.ORB_EVAL_SERVICE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
// Chave demo padrão do Supabase local — idêntica em qualquer máquina, não é segredo.
const ANON =
  process.env.ORB_EVAL_ANON ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

function guardLocal() {
  if (/supabase\.co/.test(API)) {
    console.error(
      `\n  RECUSADO: ORB_EVAL_API aponta para ${API}.\n  Os evals criam threads e propostas de verdade — só rode contra o local.\n`
    );
    process.exit(2);
  }
}

/** Cria o usuário de eval se ainda não existir (idempotente). */
async function ensureUser() {
  await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    }),
  }).catch(() => {});
}

/**
 * Zera a biblioteca do usuário de eval. Sem isso o 2º run diverge do 1º: o
 * bootstrap passa a listar o que ficou, e o Orb deixa de propor item repetido.
 */
async function resetLibrary(token) {
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  };
  for (const table of ["movie", "book", "album", "orb_proposal", "orb_message", "orb_thread"]) {
    // O PostgREST exige um filtro no DELETE; `user_id` existe nas 6 tabelas e a
    // RLS já restringe às linhas do próprio usuário.
    await fetch(`${API}/rest/v1/${table}?user_id=not.is.null`, {
      method: "DELETE",
      headers,
    }).catch(() => {});
  }
}

async function signIn() {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login falhou (HTTP ${res.status})`);
  const { access_token: token } = await res.json();
  if (!token) throw new Error("login não devolveu access_token");
  return token;
}

async function send(token, threadId, message) {
  const res = await fetch(`${API}/functions/v1/orb-agent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ thread_id: threadId, message }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

/** Compara só as chaves declaradas — o resto do payload é livre. */
function checkPayload(payload, expected) {
  const fails = [];
  for (const [key, want] of Object.entries(expected)) {
    const got = payload?.[key];
    if (got !== want) fails.push(`payload.${key}: esperado ${JSON.stringify(want)}, veio ${JSON.stringify(got)}`);
  }
  return fails;
}

function checkCase(last, expect) {
  const fails = [];
  const proposals = last.proposals ?? [];

  if (expect.tool) {
    const hit = proposals.find((p) => p.tool_name === expect.tool);
    if (!hit) {
      fails.push(
        `tool: esperado ${expect.tool}, veio [${proposals.map((p) => p.tool_name).join(", ") || "nenhuma proposta"}]`
      );
    } else if (expect.payload) {
      fails.push(...checkPayload(hit.payload, expect.payload));
    }
  }

  if (expect.no_clarify && last.clarify) {
    fails.push(`clarify: esperado nenhum, veio "${last.clarify.question}"`);
  }

  const text = last.text ?? "";
  if (expect.text_matches && !new RegExp(expect.text_matches, "i").test(text)) {
    fails.push(`texto não casou /${expect.text_matches}/: "${text.slice(0, 120)}"`);
  }
  if (expect.text_not_matches && new RegExp(expect.text_not_matches, "i").test(text)) {
    fails.push(`texto casou o proibido /${expect.text_not_matches}/: "${text.slice(0, 160)}"`);
  }

  return fails;
}

async function main() {
  guardLocal();
  const cases = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));
  const only = process.argv[2];
  const selected = only ? cases.filter((c) => c.id === only) : cases;
  if (!selected.length) {
    console.error(`nenhum caso com id "${only}"`);
    process.exit(2);
  }

  await ensureUser();
  const token = await signIn();
  await resetLibrary(token);

  let failed = 0;
  let flaky = 0;

  for (const c of selected) {
    const started = Date.now();
    // Uma retentativa: o modelo é não-determinístico, e um caso que passa na 2ª
    // é instabilidade, não regressão. Vale distinguir os dois no relatório.
    let fails = [];
    let attempts = 0;
    for (attempts = 1; attempts <= 2; attempts++) {
      let threadId = null;
      let last = null;
      try {
        for (const turn of c.turns) {
          last = await send(token, threadId, turn.send);
          threadId = last.thread_id;
        }
      } catch (err) {
        fails = [`erro: ${err.message}`];
        continue;
      }
      fails = checkCase(last, c.expect);
      if (!fails.length) break;
      if (attempts < 2) await resetLibrary(token);
    }

    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (fails.length) {
      failed++;
      console.log(`✗ ${c.id}  (${secs}s, ${attempts - 1} tentativas)`);
      console.log(`    ${c.why}`);
      for (const f of fails) console.log(`    → ${f}`);
    } else if (attempts > 1) {
      flaky++;
      console.log(`~ ${c.id}  (${secs}s) — passou só na 2ª tentativa`);
    } else {
      console.log(`✓ ${c.id}  (${secs}s)`);
    }
  }

  console.log(
    `\n${selected.length - failed}/${selected.length} passaram` +
      (flaky ? ` · ${flaky} instáveis` : "") +
      (failed ? ` · ${failed} falharam` : "")
  );
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nfalhou antes de rodar os casos: ${err.message}`);
  console.error("O ambiente local está de pé? (supabase start + functions serve)");
  process.exit(2);
});
