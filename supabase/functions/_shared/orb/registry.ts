/**
 * Registro central das tools da Orb — o único lugar que uma tool nova precisa tocar.
 *
 * Padrão emprestado de `StevenStavrakis/mcp-starter-template` (`src/tools/index.ts`), na base de
 * conhecimento do projeto: uma pasta por área, um registro só, e o handler devolvendo erro em vez
 * de derrubar o host.
 */

import type {
  OrbTool,
  OrbToolAnnotations,
  OrbToolContext,
  OrbToolErrorCode,
} from "./types.ts";
import { OrbToolError } from "./types.ts";
import { classifyDbError, describeDbError } from "./helpers.ts";
import { financeTools } from "./tools/finance.ts";
import { productivityTools } from "./tools/productivity.ts";
import { lifeTools } from "./tools/life.ts";
import { travelTools } from "./tools/travel.ts";
import { shoppingTools } from "./tools/shopping.ts";
import { healthTools } from "./tools/health.ts";
import { notesTools } from "./tools/notes.ts";
import { timelineTools } from "./tools/timeline.ts";
import { placesTools } from "./tools/places.ts";
import { vehiclesTools } from "./tools/vehicles.ts";
import { navigationTools } from "./tools/navigation.ts";
import { dataTools } from "./tools/data.ts";
import { createTools } from "./tools/create.ts";

/**
 * A ORDEM DESTE ARRAY É PARTE DO CONTRATO COM A API — não reordene por gosto.
 *
 * O catálogo de tools é serializado nesta ordem no bloco `tools` de toda request, e o prompt
 * caching põe o breakpoint na ÚLTIMA definição de tool: o prefixo cacheado é o catálogo inteiro,
 * na ordem em que ele sai daqui. Trocar duas áreas de lugar (ou inserir uma no meio) muda o
 * prefixo e invalida o cache de todo mundo — cada request seguinte volta a pagar o catálogo
 * completo como input novo.
 *
 * Regras para mexer:
 * - Tool nova de uma área que já existe: acrescente no FIM do array daquela área (`tools/*.ts`).
 * - Área nova: acrescente um `...novaTools` no FIM desta lista, nunca no meio.
 * - Só reordene se houver ganho medido que pague um cache miss global.
 *
 * Áreas, na ordem: finanças, produtividade, vida, viagens, compras, saúde, notas, timeline,
 * lugares, veículos, navegação, API de dados, criação. As cinco últimas chegaram depois (2T.2,
 * 2T.4 e a feature 100) e por isso entraram no fim.
 */
export const orbTools: OrbTool[] = [
  ...financeTools,
  ...productivityTools,
  ...lifeTools,
  ...travelTools,
  ...shoppingTools,
  ...healthTools,
  ...notesTools,
  ...timelineTools,
  ...placesTools,
  ...vehiclesTools,
  ...navigationTools,
  ...dataTools,
  ...createTools,
];

/**
 * Tools que só fazem sentido DENTRO do app (feature 100).
 *
 * `open_screen` troca a tela que a pessoa está vendo e `propose_create` devolve uma proposta que
 * vira um cartão com botão — as duas dependem de uma tela do Orbyva aberta. Num host MCP (Claude
 * Code, Claude Desktop) não há tela: `open_screen` devolveria um caminho relativo sem app para
 * abri-lo e `propose_create` um objeto que ninguém confirma. Ficam fora de `orbMcpTools`, e o
 * catálogo do MCP volta a ser o que ele promete no `instructions`: leitura e simulação.
 */
export const ORB_APP_ONLY_TOOLS: readonly string[] = ["open_screen", "propose_create"];

/** O catálogo que o servidor MCP anuncia. */
export const orbMcpTools: OrbTool[] = orbTools.filter(
  (tool) => !ORB_APP_ONLY_TOOLS.includes(tool.name)
);

/** Teto de tempo por tool. Acima disso o turno inteiro já parece travado para quem espera. */
export const ORB_TOOL_TIMEOUT_MS = 15_000;

/**
 * O default vale para o catálogo de leitura, que é quase todo ele. `propose_create` (feature 100)
 * declara as suas próprias `annotations` justamente por não ser leitura — ela é o começo de uma
 * escrita, e o host precisa saber para pedir confirmação. Não mexer aqui para acomodar uma tool.
 */
const ANNOTATIONS_PADRAO: Required<OrbToolAnnotations> = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function orbToolAnnotations(tool: OrbTool): Required<OrbToolAnnotations> {
  return { ...ANNOTATIONS_PADRAO, ...(tool.annotations ?? {}) };
}

export function findOrbTool(name: string): OrbTool | undefined {
  return orbTools.find((tool) => tool.name === name);
}

/**
 * Rótulo humano de uma tool ("Notas"), com o `name` como fallback. É a fonte única do rótulo: um
 * mapa paralelo escrito à mão na UI diverge na primeira tool nova, que aparece lá como `query_x`.
 */
export function orbToolTitle(name: string): string {
  return findOrbTool(name)?.title ?? name;
}

interface CampoSchema {
  type?: string;
  enum?: unknown[];
}

/** O modelo manda `"true"` e `"12"` como texto o tempo todo; coagir é mais barato que recusar. */
function coagir(valor: unknown, tipo: string | undefined): unknown {
  if (typeof valor !== "string") return valor;
  if (tipo === "boolean") {
    if (valor === "true") return true;
    if (valor === "false") return false;
    return valor;
  }
  if (tipo === "number" || tipo === "integer") {
    const numero = Number(valor.trim());
    if (valor.trim() !== "" && Number.isFinite(numero)) return numero;
  }
  return valor;
}

/**
 * Valida o input contra o `inputSchema` da tool e devolve a versão COAGIDA que vai para o `run`.
 * As mensagens são escritas para o modelo ler e corrigir a própria chamada — daí nomearem sempre o
 * campo e listarem o que é aceito.
 *
 * Sem isto, o `additionalProperties: false` que os schemas prometem não é cumprido por ninguém: um
 * campo inventado pelo modelo passava direto e a tool respondia sobre um filtro que ignorou.
 */
export function validateOrbToolInput(
  tool: OrbTool,
  input: Record<string, unknown>
): Record<string, unknown> {
  const properties = (tool.inputSchema.properties ?? {}) as Record<string, unknown>;
  const conhecidos = Object.keys(properties);
  const validado: Record<string, unknown> = {};

  for (const campo of tool.inputSchema.required ?? []) {
    const valor = input[campo];
    if (valor === undefined || valor === null || valor === "") {
      throw new OrbToolError(
        `A tool "${tool.name}" exige o campo "${campo}". Chame de novo preenchendo esse campo.`
      );
    }
  }

  for (const [campo, bruto] of Object.entries(input)) {
    const schema = properties[campo] as CampoSchema | undefined;
    if (!schema || typeof schema !== "object") {
      throw new OrbToolError(
        `A tool "${tool.name}" não aceita o campo "${campo}". Campos aceitos: ` +
          `${conhecidos.length > 0 ? conhecidos.join(", ") : "nenhum (chame sem argumentos)"}.`
      );
    }
    if (bruto === undefined || bruto === null) continue;

    const valor = coagir(bruto, schema.type);

    if (Array.isArray(schema.enum) && !schema.enum.includes(valor)) {
      throw new OrbToolError(
        `O campo "${campo}" da tool "${tool.name}" aceita apenas: ` +
          `${schema.enum.map((opcao) => String(opcao)).join(", ")}. Recebi "${String(valor)}".`
      );
    }

    if (schema.type === "string" && typeof valor !== "string") {
      throw new OrbToolError(`O campo "${campo}" da tool "${tool.name}" precisa ser um texto.`);
    }
    if (
      (schema.type === "number" || schema.type === "integer") &&
      (typeof valor !== "number" || !Number.isFinite(valor))
    ) {
      throw new OrbToolError(`O campo "${campo}" da tool "${tool.name}" precisa ser um número.`);
    }
    if (schema.type === "boolean" && typeof valor !== "boolean") {
      throw new OrbToolError(
        `O campo "${campo}" da tool "${tool.name}" precisa ser true ou false.`
      );
    }

    validado[campo] = valor;
  }

  return validado;
}

/** Corpo do `result` quando `ok` é `false`: texto para o modelo + causa para o host decidir. */
export interface OrbToolFailure {
  error: string;
  code: OrbToolErrorCode;
}

/**
 * Lê a causa de um `result` de falha de `runOrbTool`. É o que substitui o reconhecimento por regex
 * sobre o texto do erro: `orbToolErrorCode(result) === "auth_expirada"` diz que vale reautenticar e
 * repetir a chamada.
 */
export function orbToolErrorCode(result: unknown): OrbToolErrorCode | undefined {
  if (typeof result !== "object" || result === null) return undefined;
  const code = (result as { code?: unknown }).code;
  return typeof code === "string" ? (code as OrbToolErrorCode) : undefined;
}

/**
 * Executa uma tool e devolve sempre um resultado serializável. Um erro aqui é informação para o
 * modelo ("não achei essa categoria"), não motivo para abortar o turno.
 *
 * A forma `{ ok, result }` é contrato dos dois hosts (`orb-agent/index.ts` e `mcp/server.ts`) e dos
 * testes — não mude. Em falha, `result` é sempre um `OrbToolFailure`.
 */
export async function runOrbTool(
  name: string,
  input: Record<string, unknown>,
  ctx: OrbToolContext
): Promise<{ ok: boolean; result: unknown }> {
  const tool = findOrbTool(name);
  if (!tool) {
    return { ok: false, result: falha(`Tool desconhecida: ${name}`, "nao_encontrado") };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const validado = validateOrbToolInput(tool, input ?? {});
    const estouro = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new OrbToolError(
            `A consulta "${tool.name}" demorou demais (mais de ${Math.round(
              ORB_TOOL_TIMEOUT_MS / 1000
            )}s) e foi interrompida. Tente de novo com um período menor ou um filtro mais estreito.`,
            "timeout"
          )
        );
      }, ORB_TOOL_TIMEOUT_MS);
    });
    return { ok: true, result: await Promise.race([tool.run(validado, ctx), estouro]) };
  } catch (error) {
    if (error instanceof OrbToolError) {
      return { ok: false, result: falha(error.message, error.code) };
    }

    // Erro que ninguém previu (bug na tool, rede caindo): a mensagem dele nunca foi escrita para o
    // modelo ler e pode carregar stack ou SQL, então vai só para o log — mas ainda classificamos,
    // porque um JWT morto que escape do `unwrap` precisa continuar virando `auth_expirada`.
    const detail = describeDbError(error);
    const code = classifyDbError(error);
    console.error(`[orb] falha inesperada em "${name}" (${code}): ${detail}`);
    return {
      ok: false,
      result: falha(
        code === "auth_expirada"
          ? "Sua sessão expirou. Entre de novo no Orbyva para eu poder consultar seus dados."
          : `Não consegui completar a consulta "${name}" agora.`,
        code
      ),
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function falha(error: string, code: OrbToolErrorCode): OrbToolFailure {
  return { error, code };
}

export type { OrbTool, OrbToolAnnotations, OrbToolContext, OrbToolErrorCode };
