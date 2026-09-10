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

/**
 * US$ por 1M tokens, por modelo. Leitura de cache custa 0,1x do input e escrita
 * 1,25x — é o que torna o breakpoint de `prompt.ts` visível aqui.
 * Modelo desconhecido: contabiliza tokens e omite o custo, em vez de chutar.
 */
const PRICES = {
  "claude-sonnet-5": { in: 2.0, out: 10.0 },
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "claude-opus-5": { in: 5.0, out: 25.0 },
};

const zeroUsage = () => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  rounds: 0,
  turns: 0,
  model: null,
});

function addUsage(acc, u) {
  if (!u) return acc;
  acc.input_tokens += u.input_tokens ?? 0;
  acc.output_tokens += u.output_tokens ?? 0;
  acc.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
  acc.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
  acc.rounds += u.rounds ?? 0;
  acc.turns += 1;
  acc.model = u.model ?? acc.model;
  return acc;
}

/** Custo em US$, ou null se o modelo não estiver na tabela. */
function costOf(acc) {
  const p = PRICES[acc.model];
  if (!p) return null;
  return (
    (acc.input_tokens * p.in +
      acc.cache_read_input_tokens * p.in * 0.1 +
      acc.cache_creation_input_tokens * p.in * 1.25 +
      acc.output_tokens * p.out) /
    1e6
  );
}

const money = (v) => (v == null ? "?" : `$${v.toFixed(4)}`);

/** Compara só as chaves declaradas — o resto do payload é livre. */
function checkPayload(payload, expected) {
  const fails = [];
  for (const [key, want] of Object.entries(expected)) {
    const got = payload?.[key];
    if (got !== want) {
      fails.push(
        `payload.${key}: esperado ${JSON.stringify(want)}, veio ${JSON.stringify(got)}`
      );
    }
  }
  return fails;
}

/** Chaves que precisam vir vazias — o agente não pode inventar valor. */
function checkPayloadNull(payload, keys) {
  return keys
    .filter((k) => payload?.[k] != null)
    .map((k) => `payload.${k}: esperado vazio, veio ${JSON.stringify(payload[k])}`);
}

/** Faixa fechada [min, max] — para nota, página, ano. */
function checkPayloadRange(payload, ranges) {
  const fails = [];
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const got = payload?.[key];
    if (typeof got !== "number" || got < min || got > max) {
      fails.push(`payload.${key}: esperado entre ${min} e ${max}, veio ${JSON.stringify(got)}`);
    }
  }
  return fails;
}

function checkCase(last, expect) {
  const fails = [];
  const proposals = last.proposals ?? [];

  if (expect.proposals_count != null && proposals.length !== expect.proposals_count) {
    fails.push(
      `propostas: esperado ${expect.proposals_count}, veio ${proposals.length} [${proposals.map((p) => p.tool_name).join(", ")}]`
    );
  }

  if (expect.no_proposal && proposals.length) {
    fails.push(
      `esperado nenhuma proposta, veio [${proposals.map((p) => p.tool_name).join(", ")}]`
    );
  }

  if (expect.tool) {
    const hit = proposals.find((p) => p.tool_name === expect.tool);
    if (!hit) {
      fails.push(
        `tool: esperado ${expect.tool}, veio [${proposals.map((p) => p.tool_name).join(", ") || "nenhuma proposta"}]`
      );
    } else {
      if (expect.payload) fails.push(...checkPayload(hit.payload, expect.payload));
      if (expect.payload_null) {
        fails.push(...checkPayloadNull(hit.payload, expect.payload_null));
      }
      if (expect.payload_range) {
        fails.push(...checkPayloadRange(hit.payload, expect.payload_range));
      }
    }
  }

  if (expect.suggested_action) {
    const want = expect.suggested_action;
    const hit = (last.suggested_actions ?? []).find((a) => a.action === want.action);
    if (!hit) {
      fails.push(
        `ação sugerida: esperada ${want.action}, veio [${(last.suggested_actions ?? []).map((a) => a.action).join(", ") || "nenhuma"}]`
      );
    } else if (want.args) {
      for (const [k, v] of Object.entries(want.args)) {
        if (hit.args?.[k] !== v) {
          fails.push(`ação.args.${k}: esperado ${JSON.stringify(v)}, veio ${JSON.stringify(hit.args?.[k])}`);
        }
      }
    }
  }

  if (expect.tools_any) {
    const names = proposals.map((p) => p.tool_name);
    if (!expect.tools_any.some((t) => names.includes(t))) {
      fails.push(
        `tool: esperado uma de [${expect.tools_any.join(", ")}], veio [${names.join(", ") || "nenhuma"}]`
      );
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
  const total = zeroUsage();

  for (const c of selected) {
    const started = Date.now();
    // Uma retentativa: o modelo é não-determinístico, e um caso que passa na 2ª
    // é instabilidade, não regressão. Vale distinguir os dois no relatório.
    let fails = [];
    let attempts = 0;
    // Conta as duas tentativas: a retentativa custa dinheiro de verdade.
    const spent = zeroUsage();
    for (attempts = 1; attempts <= 2; attempts++) {
      let threadId = null;
      let last = null;
      try {
        for (const turn of c.turns) {
          last = await send(token, threadId, turn.send);
          addUsage(spent, last.usage);
          addUsage(total, last.usage);
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
    const cached = spent.cache_read_input_tokens;
    const cost = spent.turns
      ? `, ${money(costOf(spent))}, ${spent.rounds} rodadas${cached ? `, ${cached} tok de cache` : ""}`
      : "";
    if (fails.length) {
      failed++;
      const tag = c.known_broken ? "✗ (conhecido)" : "✗";
      console.log(`${tag} ${c.id}  (${secs}s${cost}, ${attempts - 1} tentativas)`);
      if (c.known_broken) console.log(`    bloqueado por: ${c.known_broken}`);
      console.log(`    ${c.why}`);
      for (const f of fails) console.log(`    → ${f}`);
    } else if (attempts > 1) {
      flaky++;
      console.log(`~ ${c.id}  (${secs}s${cost}) — passou só na 2ª tentativa`);
    } else {
      console.log(`✓ ${c.id}  (${secs}s${cost})`);
    }
  }

  console.log(
    `\n${selected.length - failed}/${selected.length} passaram` +
      (flaky ? ` · ${flaky} instáveis` : "") +
      (failed ? ` · ${failed} falharam` : "")
  );

  if (total.turns) {
    const c = costOf(total);
    const hit =
      total.cache_read_input_tokens + total.input_tokens > 0
        ? (
            (100 * total.cache_read_input_tokens) /
            (total.cache_read_input_tokens + total.input_tokens)
          ).toFixed(0)
        : "0";
    console.log(
      `modelo ${total.model ?? "?"} · ${total.turns} turnos · ` +
        `${(total.rounds / total.turns).toFixed(1)} rodadas/turno · ` +
        `cache hit ${hit}%`
    );
    console.log(
      `custo ${money(c)} total · ${money(c == null ? null : c / total.turns)}/turno` +
        (c == null ? "  (modelo fora da tabela de preços)" : "")
    );
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nfalhou antes de rodar os casos: ${err.message}`);
  console.error("O ambiente local está de pé? (supabase start + functions serve)");
  process.exit(2);
});
