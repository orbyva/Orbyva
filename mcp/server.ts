#!/usr/bin/env node
/**
 * Servidor MCP do Orbyva — expõe os dados do usuário (finanças, tarefas, hábitos, metas, conteúdo)
 * como tools para qualquer host MCP: Claude Code, Claude Desktop, ou a própria Orb.
 *
 * Este arquivo é só o AMBIENTE: `.env`, sessão do Supabase e transporte stdio. O protocolo
 * (handlers de tool, annotations, `instructions`, logging) mora em `orbMcpServer.ts`, que monta
 * junto os resources (`resources.ts`) e os prompts (`prompts.ts`) — nada ali toca em runtime, e por
 * isso tem teste: `src/domain/orb/__tests__/mcpServer.test.ts`.
 *
 * As tools NÃO são declaradas em nenhum dos dois: elas vêm de
 * `supabase/functions/_shared/orb/registry.ts`, o mesmo registro que a Edge Function `orb-agent`
 * consome.
 *
 * ORDEM DO BOOT: lê o ambiente, monta o servidor, conecta o stdio e só então resolve a sessão, na
 * primeira chamada de tool. O contrário (autenticar antes de conectar) faz o host ficar sem
 * resposta ao `initialize` e mostrar "servidor desconectado" quando o problema é só credencial
 * errada — a mensagem real morreria no stderr, que nenhum host exibe. Por isso `ListTools` responde
 * sem sessão nenhuma.
 *
 * Somente leitura: nenhuma tool escreve no banco. A fronteira de segurança continua sendo o RLS —
 * o client é criado com a anon key mais o JWT do usuário, nunca com service role.
 */

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { bannerDeBoot, createOrbMcpServer, VERSION } from "./orbMcpServer.ts";

export { VERSION };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Sessão gravada por `npm run mcp:login`. Fica fora do repositório (`$HOME`), então não precisa
 * entrar no `.gitignore`; o conteúdo nunca é logado, só o caminho.
 * O mesmo par de constantes existe em `scripts/mcp-login.mjs`, que roda em Node puro e não
 * consegue importar este arquivo .ts.
 */
const DIRETORIO_CREDENCIAIS = join(homedir(), ".orbyva");
const CAMINHO_CREDENCIAIS = join(DIRETORIO_CREDENCIAIS, "credentials.json");

/** Teto do login. Acima disso o host já desistiu de esperar e é melhor devolver o motivo. */
const LOGIN_TIMEOUT_MS = 10_000;

/**
 * Um host MCP inicia o servidor sem passar pelo shell do usuário, então o `.env` do repositório não
 * chega em `process.env`. Ler o arquivo aqui é o que faz `npm run mcp` e o Claude Code se
 * comportarem igual. `process.env` continua tendo prioridade.
 */
function loadRepoEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(join(repoRoot, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(
    `Variável de ambiente ausente: defina ${names.join(" ou ")} no .env ou no ambiente do host MCP.`
  );
}

type OrigemDaSessao = "token" | "credenciais" | "senha";

interface Sessao {
  client: SupabaseClient;
  userId: string;
  origem: OrigemDaSessao;
}

interface CredenciaisSalvas {
  refresh_token: string;
  user_id?: string;
  email?: string;
}

function lerCredenciais(): CredenciaisSalvas | null {
  let raw: string;
  try {
    raw = readFileSync(CAMINHO_CREDENCIAIS, "utf8");
  } catch {
    return null;
  }
  try {
    const dados = JSON.parse(raw) as Partial<CredenciaisSalvas>;
    if (typeof dados.refresh_token === "string" && dados.refresh_token.length > 0) {
      return {
        refresh_token: dados.refresh_token,
        user_id: typeof dados.user_id === "string" ? dados.user_id : undefined,
        email: typeof dados.email === "string" ? dados.email : undefined,
      };
    }
  } catch {
    // JSON quebrado cai no mesmo aviso do arquivo sem refresh_token.
  }
  console.error(
    `Sessão salva em ${CAMINHO_CREDENCIAIS} está ilegível. Rode "npm run mcp:login" para gravar de novo.`
  );
  return null;
}

/**
 * O Supabase rotaciona o refresh token a cada renovação: sem regravar, a próxima renovação usa um
 * token já consumido e o usuário é obrigado a logar de novo toda hora.
 */
function gravarCredenciais(credenciais: CredenciaisSalvas): void {
  try {
    mkdirSync(DIRETORIO_CREDENCIAIS, { recursive: true, mode: 0o700 });
    writeFileSync(CAMINHO_CREDENCIAIS, `${JSON.stringify(credenciais, null, 2)}\n`, {
      mode: 0o600,
    });
    // `mode` do writeFileSync só vale na criação (e ainda passa pelo umask); o chmod é o que garante.
    chmodSync(CAMINHO_CREDENCIAIS, 0o600);
  } catch (erro) {
    console.error(
      `Não consegui regravar a sessão em ${CAMINHO_CREDENCIAIS}: ${mensagemDoErro(erro)}. ` +
        `Se as tools pararem de responder, rode "npm run mcp:login".`
    );
  }
}

/**
 * Resolve a sessão do usuário, nesta ordem:
 *  1. `ORBYVA_ACCESS_TOKEN` — override de CI. JWT pronto, morre em ~1h e não renova.
 *  2. `~/.orbyva/credentials.json` — caminho recomendado, gravado por `npm run mcp:login`.
 *  3. `ORBYVA_EMAIL` + `ORBYVA_PASSWORD` — legado. Ver o aviso no stderr abaixo.
 */
async function autenticar(): Promise<Sessao> {
  const url = requireEnv("ORBYVA_SUPABASE_URL", "VITE_SUPABASE_URL");
  const anonKey = requireEnv("ORBYVA_SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY");

  const accessToken = process.env.ORBYVA_ACCESS_TOKEN;
  if (accessToken) {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new Error(
        `ORBYVA_ACCESS_TOKEN inválido ou expirado (${error?.message ?? "sem usuário"}). ` +
          `Gere outro token ou rode "npm run mcp:login", que renova a sessão sozinho.`
      );
    }
    return { client, userId: data.user.id, origem: "token" };
  }

  const salvas = lerCredenciais();
  if (salvas) {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.refreshSession({
      refresh_token: salvas.refresh_token,
    });
    if (error || !data.session || !data.user) {
      throw new Error(
        `A sessão salva em ${CAMINHO_CREDENCIAIS} não vale mais (${error?.message ?? "sem sessão"}). ` +
          `Rode "npm run mcp:login" para entrar de novo.`
      );
    }
    gravarCredenciais({
      refresh_token: data.session.refresh_token,
      user_id: data.user.id,
      email: data.user.email ?? salvas.email,
    });
    /**
     * O `getSession()` interno renova sozinho quando o access token vence, mesmo com
     * `autoRefreshToken: false` — e essa renovação também rotaciona o refresh token. Sem ouvir o
     * evento, o token do disco vira um token já consumido depois de uma hora de servidor ligado, e
     * o próximo boot exigiria `mcp:login` de novo.
     */
    client.auth.onAuthStateChange((evento, sessao) => {
      if (evento !== "TOKEN_REFRESHED" || !sessao?.refresh_token) return;
      gravarCredenciais({
        refresh_token: sessao.refresh_token,
        user_id: sessao.user.id,
        email: sessao.user.email ?? salvas.email,
      });
    });
    return { client, userId: data.user.id, origem: "credenciais" };
  }

  const email = process.env.ORBYVA_EMAIL;
  const password = process.env.ORBYVA_PASSWORD;
  if (!email || !password) {
    throw new Error(
      `Nenhuma credencial do Orbyva encontrada. Rode "npm run mcp:login" para entrar uma vez e ` +
        `gravar a sessão em ${CAMINHO_CREDENCIAIS}.`
    );
  }
  console.error(
    "Aviso: entrando por ORBYVA_EMAIL/ORBYVA_PASSWORD, o caminho legado — a senha no .env permite " +
      'trocar e-mail e senha da conta. Rode "npm run mcp:login" e apague as duas variáveis.'
  );
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Login no Supabase falhou: ${error?.message ?? "sem usuário"}`);
  }
  return { client, userId: data.user.id, origem: "senha" };
}

function mensagemDoErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

async function comLimiteDeTempo<T>(promessa: Promise<T>, ms: number, oQue: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const estouro = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${oQue} demorou mais de ${Math.round(ms / 1000)}s e foi interrompido.`)),
      ms
    );
  });
  try {
    return await Promise.race([promessa, estouro]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * A sessão é memoizada: resolvida na primeira `CallTool` e reusada nas seguintes. Falha não fica
 * em cache — o usuário conserta a credencial e a próxima chamada tenta de novo, sem reiniciar o host.
 */
let sessaoEmCurso: Promise<Sessao> | null = null;

function sessaoAtual(): Promise<Sessao> {
  if (!sessaoEmCurso) {
    sessaoEmCurso = comLimiteDeTempo(autenticar(), LOGIN_TIMEOUT_MS, "O login no Supabase").then(
      (sessao) => {
        console.error(`Sessão do Orbyva ativa (origem: ${sessao.origem}).`);
        return sessao;
      },
      (erro: unknown) => {
        sessaoEmCurso = null;
        throw erro;
      }
    );
  }
  return sessaoEmCurso;
}

/** Hoje no fuso do usuário — o servidor pode rodar em UTC e as queries são por data local. */
function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main(): Promise<void> {
  loadRepoEnv();
  const timezone = process.env.ORBYVA_TIMEZONE || "America/Sao_Paulo";

  /**
   * `today` é recalculado a cada chamada, não fixado no boot: um servidor MCP fica ligado enquanto
   * o host estiver aberto, e "hoje" congelado na data em que o Claude Code subiu faria a Orb
   * responder sobre ontem sem nenhum sinal de que está errada.
   *
   * `renovar` chega quando uma tool falhou com `auth_expirada` — descartar a promessa memoizada é
   * o que faz a próxima resolução realmente ir buscar um JWT novo.
   */
  const server = createOrbMcpServer(async ({ renovar } = {}) => {
    if (renovar) sessaoEmCurso = null;
    const sessao = await sessaoAtual();
    return {
      db: sessao.client,
      userId: sessao.userId,
      today: todayInTimezone(timezone),
      timezone,
    };
  });

  await server.connect(new StdioServerTransport());
  // stdout é o canal do protocolo: todo log do servidor vai para stderr.
  console.error(bannerDeBoot());
}

main().catch((error: unknown) => {
  console.error("Erro fatal no servidor MCP do Orbyva:", error);
  process.exit(1);
});
