/**
 * Orb — agente conversacional do Orbyva.
 *
 * Recebe o histórico da conversa, roda o loop de function calling do Gemini contra o registro
 * compartilhado de tools (`_shared/orb/registry.ts`) e devolve a resposta em stream SSE.
 *
 * Body: { messages: [{ role: "user"|"assistant", content: string }], today: "YYYY-MM-DD", timezone }
 * Eventos SSE (`data:` com um JSON por linha):
 *   { type: "text",  text }                                    delta de texto
 *   { type: "tool",  id, name, phase: "start", input }         tool começou
 *   { type: "tool",  id, name, phase: "done", ok, summary, duration_ms }
 *   { type: "done",  usage }                                   fim do turno
 *   { type: "error", message }
 * Entre os eventos sai um comentário SSE (`: ping`) a cada 10s — o parser do client ignora
 * comentário, e é isso que segura a conexão viva enquanto uma rodada demora.
 *
 * O contrato de eventos acima é o mesmo desde a feature 098 e NÃO muda com o provedor: o front
 * (`src/api/orb.ts`, `src/domain/orb/stream.ts`, `src/hooks/useOrbChat.ts`) depende dele.
 *
 * Segurança: JWT obrigatório, client com anon key + Authorization (RLS do usuário, igual
 * `home-bundle`). A chave do Gemini vive só no secret `GEMINI_API_KEY`, nunca no browser.
 * Antes do Gemini: sem `has_app_access()` → 402; cota diária/rajada (`orb_try_consume`, via
 * service role) estourada → 429 com `Retry-After`. Falha nessas checagens recusa (503).
 * Nenhum log carrega input nem resultado de tool: é dado financeiro pessoal.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { GoogleGenAI } from "npm:@google/genai@2.21.0";

import { corsHeadersForRequest } from "../_shared/cors.ts";
import { findOrbTool, orbTools, runOrbTool } from "../_shared/orb/registry.ts";
import { stripUiFields } from "../_shared/orb/helpers.ts";
import {
  ORB_QUOTA_CHECK_FAILED_MESSAGE,
  checkOrbAccess,
  consumeOrbQuota,
  orbLimitsFromEnv,
  type OrbGateDenial,
} from "../_shared/orbQuotaRules.ts";
import { parseMessages, type IncomingMessage } from "./messages.ts";
import { orbSystemContext, orbSystemPolicy } from "./prompt.ts";

/** Mesmo modelo já usado em produção no outro projeto do usuário; sobrescreva com `ORB_MODEL`. */
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
/** Teto de rodadas modelo↔tools por turno (limite do architecture.md, seção 7). */
const MAX_TOOL_ROUNDS = 8;
/** Teto de tempo do turno inteiro. Acima disso ninguém está mais esperando do outro lado. */
const TURN_BUDGET_MS = 90_000;
/** Intervalo do comentário SSE que segura a conexão enquanto o modelo pensa. */
const HEARTBEAT_MS = 10_000;
/** Corpo inteiro e mensagem individual. A cota por dia/minuto é `_shared/orbQuotaRules.ts`. */
const MAX_BODY_BYTES = 60 * 1024;
const MAX_MESSAGE_BYTES = 8 * 1024;
/** Uma resposta de tool gigante come o contexto das rodadas seguintes e derruba o turno inteiro. */
const TOOL_RESULT_MAX_CHARS = 20_000;
/**
 * O `summary` do evento `tool` é para a UI, não para o modelo: cabe no SSE ou vira contagem.
 *
 * Subiu de 4 KB para 24 KB na feature 100, quando o resultado passou a virar cartão na tela: 40
 * tarefas ou 30 filmes com pôster passam de 4 KB, e no teto antigo a tela recebia `{truncated:
 * true, itens: 40}` — ou seja, caía no fallback de tabela justamente nas listas grandes, que são as
 * que mais ganham com o cartão. Este número NÃO custa token: ele não entra no contexto do modelo.
 */
const TOOL_SUMMARY_MAX_CHARS = 24 * 1024;
/** Nem todo valor de input cabe num cartão de UI. */
const TOOL_INPUT_MAX_CHARS = 200;
const MAX_OUTPUT_TOKENS = 8192;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `thinkingLevel` é o controle de raciocínio da família Gemini 3 (o `thinkingBudget` em tokens é o
 * equivalente da 2.5 e não vale para o modelo padrão daqui). `includeThoughts` fica desligado: o
 * contrato SSE não tem canal para resumo de raciocínio, e mandá-lo pelo evento `text` faria o
 * rascunho do modelo aparecer como se fosse a resposta.
 */
const NIVEIS_DE_RACIOCINIO = ["MINIMAL", "LOW", "MEDIUM", "HIGH"] as const;
type NivelDeRaciocinio = (typeof NIVEIS_DE_RACIOCINIO)[number];

/** `LOW` equilibra latência e acerto na escolha de tool; ajustável pelo secret `ORB_THINKING`. */
function resolverRaciocinio(): NivelDeRaciocinio {
  const bruto = (Deno.env.get("ORB_THINKING") || "").trim().toUpperCase() as NivelDeRaciocinio;
  return NIVEIS_DE_RACIOCINIO.includes(bruto) ? bruto : "LOW";
}

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function gateResponse(denial: OrbGateDenial, cors: Record<string, string>): Response {
  return jsonResponse(denial.body, denial.status, { ...cors, ...denial.headers });
}

const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** Só as chaves declaradas no schema da tool, e só escalar: o `input` vai para a tela do usuário. */
function entradaVisivel(name: string, input: Record<string, unknown>): Record<string, unknown> {
  const propriedades = findOrbTool(name)?.inputSchema.properties ?? {};
  const visivel: Record<string, unknown> = {};
  for (const chave of Object.keys(propriedades)) {
    const valor = input[chave];
    if (valor === null || valor === undefined) continue;
    if (typeof valor === "number" || typeof valor === "boolean") {
      visivel[chave] = valor;
    } else if (typeof valor === "string") {
      visivel[chave] =
        valor.length > TOOL_INPUT_MAX_CHARS ? `${valor.slice(0, TOOL_INPUT_MAX_CHARS)}…` : valor;
    }
  }
  return visivel;
}

function serializar(valor: unknown): string {
  try {
    return JSON.stringify(valor) ?? "null";
  } catch {
    return "";
  }
}

/**
 * Resumo do resultado para o evento `tool`. Nunca o resultado bruto: `query_transactions` devolve
 * centenas de linhas e um SSE desse tamanho trava a renderização do chat.
 */
function resumoDeTool(resultado: unknown): unknown {
  const serializado = serializar(resultado);
  if (!serializado) return { truncated: true, erro: "resultado não serializável" };
  if (serializado.length <= TOOL_SUMMARY_MAX_CHARS) return resultado;

  const resumo: Record<string, unknown> = { truncated: true };
  if (Array.isArray(resultado)) {
    resumo.itens = resultado.length;
    return resumo;
  }
  if (resultado && typeof resultado === "object") {
    for (const [chave, valor] of Object.entries(resultado)) {
      if (Array.isArray(valor)) resumo[chave] = valor.length;
      else if (typeof valor === "number" || typeof valor === "boolean") resumo[chave] = valor;
      else if (typeof valor === "string" && valor.length <= 120) resumo[chave] = valor;
    }
  }
  return serializar(resumo).length <= TOOL_SUMMARY_MAX_CHARS ? resumo : { truncated: true };
}

/**
 * Payload do `functionResponse` que volta para o modelo.
 *
 * O Gemini espera um objeto, e trata as chaves `output` e `error` como convenção — é o que separa
 * "a consulta deu isto" de "a consulta falhou", em vez de o modelo ter que adivinhar pelo formato.
 * Resultado grande demais desce como texto truncado, com a truncagem VISÍVEL para o modelo: sem o
 * aviso ele responderia em cima de meia lista achando que era a lista inteira.
 */
function respostaDeTool(bruto: unknown, ok: boolean): Record<string, unknown> {
  const chave = ok ? "output" : "error";
  // O modelo recebe o resultado SEM os campos `ui_*` (pôster, capa): eles existem para o cartão da
  // tela, e entrariam no contexto de todas as rodadas seguintes sem ajudar em nenhuma resposta.
  const resultado = stripUiFields(bruto);
  const serializado = serializar(resultado);
  if (serializado && serializado.length <= TOOL_RESULT_MAX_CHARS) {
    return { [chave]: resultado };
  }
  const texto = serializado || '{"error":"resultado não serializável"}';
  return {
    [chave]: `${texto.slice(0, TOOL_RESULT_MAX_CHARS)}\n\n[RESULTADO TRUNCADO em ${TOOL_RESULT_MAX_CHARS} caracteres. Refaça a consulta com um período menor ou um filtro mais estreito antes de responder.]`,
  };
}

/** Motivos de parada que são recusa do modelo, e não fim normal de turno. */
const RECUSAS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "RECITATION",
  "IMAGE_SAFETY",
  "IMAGE_PROHIBITED_CONTENT",
]);

/** O `usageMetadata` de uma rodada só; somar todas é o que impede subestimar o turno em 2-8x. */
// deno-lint-ignore no-explicit-any
function somarUso(alvo: Record<string, number>, usage: any): void {
  if (!usage) return;
  const mapa: Record<string, string> = {
    input_tokens: "promptTokenCount",
    output_tokens: "candidatesTokenCount",
    cache_read_input_tokens: "cachedContentTokenCount",
    thinking_tokens: "thoughtsTokenCount",
  };
  for (const [nosso, deles] of Object.entries(mapa)) {
    const valor = usage[deles];
    if (typeof valor === "number" && Number.isFinite(valor)) alvo[nosso] += valor;
  }
}

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return jsonResponse({ error: "Orb não configurada: falta GEMINI_API_KEY." }, 503, cors);
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

  const semAcesso = await checkOrbAccess(db);
  if (semAcesso) return gateResponse(semAcesso, cors);

  let corpoBruto: string;
  try {
    corpoBruto = await req.text();
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400, cors);
  }
  if (byteLength(corpoBruto) > MAX_BODY_BYTES) {
    return jsonResponse(
      { error: "Conversa comprida demais para um pedido só. Comece uma conversa nova com a Orb." },
      413,
      cors
    );
  }

  let messages: IncomingMessage[];
  let today: string;
  let timezone: string;
  try {
    const body = JSON.parse(corpoBruto);
    const brutas = body?.messages;
    if (Array.isArray(brutas)) {
      for (const item of brutas) {
        const content = (item as { content?: unknown })?.content;
        if (typeof content === "string" && byteLength(content) > MAX_MESSAGE_BYTES) {
          return jsonResponse(
            { error: "Mensagem comprida demais. Quebre o texto em partes menores." },
            413,
            cors
          );
        }
      }
    }
    messages = parseMessages(brutas);
    today = String(body?.today ?? "");
    timezone = String(body?.timezone ?? "America/Sao_Paulo");
    if (messages.length === 0 || !ISO_DATE.test(today)) throw new Error("invalid body");
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400, cors);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    return jsonResponse({ error: ORB_QUOTA_CHECK_FAILED_MESSAGE }, 503, cors);
  }
  const adminDb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const semCota = await consumeOrbQuota(
    adminDb,
    user.id,
    orbLimitsFromEnv({
      ORB_DAILY_LIMIT: Deno.env.get("ORB_DAILY_LIMIT"),
      ORB_MINUTE_LIMIT: Deno.env.get("ORB_MINUTE_LIMIT"),
    })
  );
  if (semCota) return gateResponse(semCota, cors);

  const requestId = crypto.randomUUID();
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const modelo = Deno.env.get("ORB_MODEL") || DEFAULT_MODEL;
  const toolContext = { db, userId: user.id, today, timezone };

  /**
   * CACHE DE PREFIXO. O Gemini faz cache **implícito**: não existe marcador tipo `cache_control`,
   * ele casa sozinho o começo repetido de requisições seguidas (a partir de um mínimo de tokens que
   * varia por modelo). Quem paga a conta disso são duas disciplinas, e as duas continuam valendo:
   *
   *   1. a ordem de `orbTools` (`registry.ts`) precisa ser determinística — reordenar o catálogo
   *      muda o prefixo e zera o cache de todo mundo;
   *   2. o volátil (data de hoje, fuso, nome) fica no FIM da instrução de sistema, depois da
   *      política estável, para o trecho comum entre duas perguntas ser o maior possível.
   *
   * Conferência: `cache_read_input_tokens > 0` no log do turno, a partir da 2ª pergunta.
   *
   * Uma tool sem parâmetro nenhum vai SEM `parametersJsonSchema` de propósito: o schema vazio é
   * aceito na documentação, mas declarar "objeto sem propriedades" leva o modelo a inventar campo.
   */
  const functionDeclarations = orbTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    ...(Object.keys(tool.inputSchema.properties ?? {}).length > 0
      ? { parametersJsonSchema: tool.inputSchema }
      : {}),
  }));
  const systemInstruction = `${orbSystemPolicy()}\n\n${orbSystemContext({
    today,
    timezone,
    userName: (user.user_metadata?.full_name as string | undefined) ?? null,
  })}`;

  const turnController = new AbortController();
  let motivoDoAbort: "cliente" | "prazo" | null = null;
  const abortar = (motivo: "cliente" | "prazo") => {
    if (turnController.signal.aborted) return;
    motivoDoAbort = motivo;
    turnController.abort();
  };
  // Cliente que fecha a aba (ou clica em "Parar") não pode deixar o turno rodando e sendo cobrado.
  // Sinal já abortado não dispara o listener, daí a checagem antes de registrar.
  if (req.signal.aborted) abortar("cliente");
  req.signal.addEventListener("abort", () => abortar("cliente"));

  let fechado = false;
  let pulso: number | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const enviarBruto = (texto: string) => {
        if (fechado) return;
        try {
          controller.enqueue(encoder.encode(texto));
        } catch {
          // Controller já fechado do outro lado: o turno acabou, não há para quem escrever.
          fechado = true;
        }
      };
      const send = (evento: Record<string, unknown>) =>
        enviarBruto(`data: ${JSON.stringify(evento)}\n\n`);
      const fechar = () => {
        if (fechado) return;
        fechado = true;
        try {
          controller.close();
        } catch {
          // Já fechado pelo `cancel`.
        }
      };

      pulso = setInterval(() => enviarBruto(": ping\n\n"), HEARTBEAT_MS);
      const prazo = setTimeout(() => abortar("prazo"), TURN_BUDGET_MS);

      // `assistant` no contrato do front, `model` no do Gemini — a tradução é aqui, num lugar só.
      // deno-lint-ignore no-explicit-any
      const conversation: any[] = messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

      const uso = {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        thinking_tokens: 0,
      };
      let rodadas = 0;
      let houveTexto = false;

      try {
        for (let rodada = 0; rodada < MAX_TOOL_ROUNDS; rodada += 1) {
          if (turnController.signal.aborted) return;
          rodadas = rodada + 1;

          const turn = await ai.models.generateContentStream({
            model: modelo,
            contents: conversation,
            config: {
              abortSignal: turnController.signal,
              systemInstruction,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              thinkingConfig: { thinkingLevel: resolverRaciocinio(), includeThoughts: false },
              tools: [{ functionDeclarations }],
            },
          });

          /**
           * As partes vão para o histórico EXATAMENTE como chegaram, sem fundir texto.
           *
           * Não é preciosismo: no Gemini 3 as partes do turno do modelo carregam `thoughtSignature`,
           * e o histórico da rodada seguinte precisa devolvê-la intacta para o raciocínio continuar
           * de onde parou numa sequência de function calls. Reconstruir a parte a partir do texto
           * perderia a assinatura, e o sintoma seria o modelo "esquecendo" o que já consultou.
           */
          // deno-lint-ignore no-explicit-any
          const partesDoModelo: any[] = [];
          // deno-lint-ignore no-explicit-any
          const chamadas: { id: string; name: string; args: Record<string, unknown>; bruta: any }[] =
            [];
          let motivoDeParada: string | undefined;
          let bloqueioDePrompt: string | undefined;

          for await (const chunk of turn) {
            if (turnController.signal.aborted) return;
            somarUso(uso, chunk.usageMetadata);

            const bloqueio = chunk.promptFeedback?.blockReason;
            if (bloqueio) bloqueioDePrompt = String(bloqueio);

            const candidato = chunk.candidates?.[0];
            if (candidato?.finishReason) motivoDeParada = String(candidato.finishReason);

            for (const parte of candidato?.content?.parts ?? []) {
              partesDoModelo.push(parte);
              if (parte.functionCall?.name) {
                chamadas.push({
                  // A API do Gemini normalmente não numera a chamada; o id é o que amarra o evento
                  // `start` ao `done` na UI, então quando não vem um, geramos um estável.
                  id: parte.functionCall.id ?? `${parte.functionCall.name}-${rodada}-${chamadas.length}`,
                  name: parte.functionCall.name,
                  args: (parte.functionCall.args ?? {}) as Record<string, unknown>,
                  bruta: parte.functionCall,
                });
              } else if (typeof parte.text === "string" && parte.text !== "" && !parte.thought) {
                if (parte.text.trim() !== "") houveTexto = true;
                send({ type: "text", text: parte.text });
              }
            }
          }

          if (bloqueioDePrompt) {
            send({
              type: "error",
              message: `A Orb não pôde responder a esse pedido (${bloqueioDePrompt}). Reformule a pergunta ou pergunte outra coisa.`,
            });
            return;
          }

          if (chamadas.length === 0) {
            if (motivoDeParada === "MAX_TOKENS") {
              send({
                type: "error",
                message:
                  "A resposta ficou longa demais e foi cortada no meio. Peça o restante ou refaça a pergunta em partes.",
              });
              return;
            }
            if (motivoDeParada && RECUSAS.has(motivoDeParada)) {
              send({
                type: "error",
                message: `A Orb não pôde responder a esse pedido (${motivoDeParada}). Reformule a pergunta ou pergunte outra coisa.`,
              });
              return;
            }
            if (motivoDeParada === "MALFORMED_FUNCTION_CALL") {
              send({
                type: "error",
                message: "A Orb montou uma consulta inválida. Tente perguntar de outro jeito.",
              });
              return;
            }
            if (houveTexto) {
              send({ type: "done", usage: { ...uso, rounds: rodadas } });
            } else {
              // Turno que fecha sem uma linha de texto é o que deixava a bolha vazia no client e
              // travava a conversa seguinte. Vira erro para a bolha nunca ficar em branco.
              send({
                type: "error",
                message: "A Orb terminou sem escrever nada. Tente perguntar de novo.",
              });
            }
            return;
          }

          conversation.push({ role: "model", parts: partesDoModelo });

          // deno-lint-ignore no-explicit-any
          const respostas: any[] = [];
          for (const call of chamadas) {
            if (turnController.signal.aborted) return;
            send({
              type: "tool",
              id: call.id,
              name: call.name,
              phase: "start",
              input: entradaVisivel(call.name, call.args),
            });

            const inicio = Date.now();
            const { ok, result } = await runOrbTool(call.name, call.args, toolContext);
            const durationMs = Date.now() - inicio;
            // Nunca `input` nem `result` aqui: é dado financeiro pessoal.
            console.log(
              JSON.stringify({ requestId, userId: user.id, tool: call.name, durationMs, ok })
            );

            send({
              type: "tool",
              id: call.id,
              name: call.name,
              phase: "done",
              ok,
              summary: resumoDeTool(result),
              duration_ms: durationMs,
            });
            respostas.push({
              functionResponse: {
                ...(call.bruta.id ? { id: call.bruta.id } : {}),
                name: call.name,
                response: respostaDeTool(result, ok),
              },
            });
          }
          // Todas as respostas de uma rodada vão numa mensagem só — separá-las ensina o modelo a
          // parar de chamar tools em paralelo.
          conversation.push({ role: "user", parts: respostas });
        }

        send({
          type: "error",
          message: `A Orb passou de ${MAX_TOOL_ROUNDS} rodadas de consulta sem concluir. Tente uma pergunta mais específica.`,
        });
      } catch (error) {
        if (turnController.signal.aborted) {
          if (motivoDoAbort === "prazo") {
            send({
              type: "error",
              message: `A Orb passou de ${Math.round(
                TURN_BUDGET_MS / 1000
              )}s nesta pergunta e foi interrompida. Tente um período menor ou uma pergunta mais específica.`,
            });
          }
          // Cancelamento do cliente: não há mais ninguém do outro lado para avisar.
        } else {
          console.error(
            JSON.stringify({
              requestId,
              userId: user.id,
              event: "erro",
              message: error instanceof Error ? error.message : String(error),
            })
          );
          send({ type: "error", message: "A Orb não conseguiu responder agora. Tente de novo." });
        }
      } finally {
        if (pulso !== undefined) clearInterval(pulso);
        clearTimeout(prazo);
        console.log(
          JSON.stringify({
            requestId,
            userId: user.id,
            event: "turno",
            modelo,
            rodadas,
            abort: motivoDoAbort,
            ...uso,
          })
        );
        fechar();
      }
    },
    cancel() {
      // O client desistiu (botão "Parar", aba fechada): derruba o turno em vez de pagar 8 rodadas.
      fechado = true;
      if (pulso !== undefined) clearInterval(pulso);
      abortar("cliente");
    },
  });

  return new Response(stream, {
    headers: {
      ...cors,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
