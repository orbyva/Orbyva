#!/usr/bin/env node
/**
 * Login único do servidor MCP do Orbyva (`npm run mcp:login`).
 *
 * Pergunta e-mail e senha no terminal, entra uma vez no Supabase e grava SÓ o refresh token em
 * `~/.orbyva/credentials.json` (0600, dentro de um diretório 0700). A senha não é gravada em lugar
 * nenhum e o access token, que expira em ~1h, também não: `mcp/server.ts` troca o refresh token por
 * um access token novo a cada sessão e regrava o token rotacionado.
 *
 * Existe para tirar `ORBYVA_PASSWORD` do `.env` — ali fica a credencial mais poderosa da conta (com
 * ela dá para trocar e-mail e senha) num servidor que se declara somente leitura. O arquivo mora
 * fora do repositório, então não precisa entrar no `.gitignore`, e o conteúdo nunca é impresso.
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const raizDoRepo = join(dirname(fileURLToPath(import.meta.url)), "..");

// O mesmo par de constantes está em `mcp/server.ts`, que é .ts e não dá para importar daqui.
const DIRETORIO_CREDENCIAIS = join(homedir(), ".orbyva");
const CAMINHO_CREDENCIAIS = join(DIRETORIO_CREDENCIAIS, "credentials.json");

const AJUDA = `Uso: npm run mcp:login

Pergunta e-mail e senha, entra no Supabase e grava a sessão do servidor MCP em
${CAMINHO_CREDENCIAIS} (só o refresh token, com permissão 0600).

Lê a URL e a anon key do .env da raiz (ORBYVA_SUPABASE_URL/VITE_SUPABASE_URL e
ORBYVA_SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY); variáveis já definidas no ambiente têm
prioridade. Depois disso, ORBYVA_EMAIL e ORBYVA_PASSWORD podem sair do .env.
`;

/** Mesmo leitor de `.env` do servidor MCP: o script pode rodar sem as variáveis exportadas. */
function carregarEnvDoRepo() {
  let bruto;
  try {
    bruto = readFileSync(join(raizDoRepo, ".env"), "utf8");
  } catch {
    return;
  }
  for (const linha of bruto.split("\n")) {
    const casou = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
    if (!casou) continue;
    const [, chave, valor] = casou;
    if (process.env[chave] !== undefined) continue;
    process.env[chave] = valor.trim().replace(/^["']|["']$/g, "");
  }
}

function exigirEnv(...nomes) {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor) return valor;
  }
  console.error(
    `Variável de ambiente ausente: defina ${nomes.join(" ou ")} no .env da raiz antes de entrar.`
  );
  process.exit(1);
}

async function perguntar() {
  const ehTerminal = Boolean(process.stdin.isTTY);

  // Writable intermediário: readline ecoa o que foi digitado por aqui, e é o que a gente silencia
  // na hora da senha. Sem TTY (entrada por pipe) não há eco para silenciar — daí o aviso.
  const saida = new Writable({
    write(pedaco, _codificacao, pronto) {
      if (!saida.mudo) process.stdout.write(pedaco);
      pronto();
    },
  });
  saida.mudo = false;

  const rl = createInterface({ input: process.stdin, output: saida, terminal: ehTerminal });
  try {
    const email = (await rl.question("E-mail do Orbyva: ")).trim();

    if (!ehTerminal) {
      console.error("Aviso: sem terminal interativo, a senha vai aparecer na tela enquanto digita.");
    }
    process.stdout.write("Senha: ");
    saida.mudo = ehTerminal;
    const senha = await rl.question("");
    saida.mudo = false;
    process.stdout.write("\n");

    return { email, senha };
  } finally {
    rl.close();
  }
}

function gravarCredenciais(credenciais) {
  mkdirSync(DIRETORIO_CREDENCIAIS, { recursive: true, mode: 0o700 });
  // `mode` do mkdir/writeFile só vale na criação e ainda passa pelo umask; o chmod é o que garante.
  chmodSync(DIRETORIO_CREDENCIAIS, 0o700);
  writeFileSync(CAMINHO_CREDENCIAIS, `${JSON.stringify(credenciais, null, 2)}\n`, { mode: 0o600 });
  chmodSync(CAMINHO_CREDENCIAIS, 0o600);
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
    process.stdout.write(AJUDA);
    return;
  }

  carregarEnvDoRepo();
  const url = exigirEnv("ORBYVA_SUPABASE_URL", "VITE_SUPABASE_URL");
  const anonKey = exigirEnv("ORBYVA_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");

  const { email, senha } = await perguntar();
  if (!email || !senha) {
    console.error("E-mail e senha são obrigatórios.");
    process.exit(1);
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
  if (error || !data.session || !data.user) {
    console.error(`Login falhou: ${error?.message ?? "o Supabase não devolveu sessão"}`);
    process.exit(1);
  }

  gravarCredenciais({
    refresh_token: data.session.refresh_token,
    user_id: data.user.id,
    email: data.user.email ?? email,
  });

  console.log(`Sessão gravada em ${CAMINHO_CREDENCIAIS} (0600) para ${data.user.email ?? email}.`);
  if (process.env.ORBYVA_PASSWORD || process.env.ORBYVA_EMAIL) {
    console.log("Agora dá para apagar ORBYVA_EMAIL e ORBYVA_PASSWORD do .env.");
  }
}

main().catch((erro) => {
  console.error("Erro no login do MCP do Orbyva:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
