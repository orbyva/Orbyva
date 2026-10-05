/** Contratos da Orb no client — espelham o que `supabase/functions/orb-agent` emite. */

export type OrbRole = "user" | "assistant";

/** Estado de uma chamada de tool dentro de um turno. */
export type OrbToolStatus = "running" | "ok" | "error";

/**
 * Uma chamada de tool do turno, identificada pelo `id` que o servidor manda no `start` e repete no
 * `done`. É por id, e não por nome: a Orb consulta a mesma tool duas vezes no mesmo turno (dois
 * meses, duas categorias) e agrupar por nome esconderia a segunda consulta de onde o número veio.
 */
export interface OrbToolCall {
  id: string;
  name: string;
  /** Parâmetros já filtrados pelo servidor (whitelist do `inputSchema`), prontos para a tela. */
  input?: Record<string, unknown>;
  status: OrbToolStatus;
  /** Resumo do resultado — nunca o resultado bruto. Shape livre: quem renderiza é que interpreta. */
  summary?: unknown;
  durationMs?: number;
}

/**
 * Consumo do turno, vindo do evento `done`.
 *
 * TODOS os campos são opcionais de propósito: o servidor pode acrescentar ou parar de mandar um
 * deles (já trocou de provedor uma vez) e a tela de chat não pode quebrar por causa do rodapé de
 * custo. Use `isOrbUsage` antes de ler — nunca um cast.
 */
export interface OrbUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  thinking_tokens?: number;
  /** Rodadas modelo↔tools gastas no turno. */
  rounds?: number;
}

const CHAVES_DE_USO = [
  "input_tokens",
  "output_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
  "thinking_tokens",
  "rounds",
] as const;

/**
 * Aceita o `usage` do `done` só quando ele traz pelo menos um número conhecido e nenhum campo
 * conhecido com tipo errado. Campo desconhecido é ignorado (o servidor pode acrescentar), campo
 * conhecido inválido derruba o objeto inteiro — melhor rodapé ausente do que número inventado.
 */
export function isOrbUsage(valor: unknown): valor is OrbUsage {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const registro = valor as Record<string, unknown>;

  let temAlgum = false;
  for (const chave of CHAVES_DE_USO) {
    const numero = registro[chave];
    if (numero === undefined || numero === null) continue;
    if (typeof numero !== "number" || !Number.isFinite(numero) || numero < 0) return false;
    temAlgum = true;
  }
  return temAlgum;
}

export interface OrbMessage {
  id: string;
  role: OrbRole;
  content: string;
  /** Chamadas de tool desta resposta, na ordem em que a Orb as disparou. */
  tools?: OrbToolCall[];
  /** Turno ainda em stream. */
  pending?: boolean;
  /** Turno que terminou em erro; o texto fica em `content`. */
  failed?: boolean;
  /** Turno que o usuário parou no meio — não é erro, mas também aceita "Tentar de novo". */
  interrupted?: boolean;
  /** Erro de sessão pede "Entrar de novo", não "Tentar de novo". Só existe com `failed`. */
  errorKind?: "session" | "generic";
  /** Consumo reportado pelo `done`, já validado por `isOrbUsage`. */
  usage?: OrbUsage;
}

/**
 * Um evento SSE do `orb-agent`.
 *
 * `id`, `input`, `ok` e `duration_ms` são opcionais no tipo, e não porque o servidor atual os
 * omita: uma função publicada mais velha que o bundle do browser (deploy fora de ordem) continua
 * mandando o evento curto, e o client tem que sobreviver a isso.
 */
export type OrbStreamEvent =
  | { type: "text"; text: string }
  | {
      type: "tool";
      id?: string;
      name: string;
      phase: "start";
      input?: Record<string, unknown>;
    }
  | {
      type: "tool";
      id?: string;
      name: string;
      phase: "done";
      ok?: boolean;
      summary?: unknown;
      duration_ms?: number;
    }
  | { type: "done"; usage?: unknown }
  | { type: "error"; message: string };

/** Uma versão da Orb gerada por IA — espelha `public.orb_avatar`; no máximo uma `is_active` por dono. */
export interface OrbAvatar {
  id: string;
  user_id: string;
  prompt: string;
  /** URL pública do PNG em `orb-avatars/{userId}/{uuid}.png`. */
  url: string;
  model: string;
  is_active: boolean;
  created_at: string;
}

/** O que o client manda no corpo do POST. */
export interface OrbTurnRequest {
  messages: { role: OrbRole; content: string }[];
  today: string;
  timezone: string;
}
