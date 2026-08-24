/**
 * Orb — chat com IA (POC P0: Entretenimento). Loop de tool-calling (Anthropic
 * Claude) que consulta catálogos externos e só PROPÕE mudanças (`orb_proposal`
 * pending) — a escrita real acontece no client via `src/api/*` após confirmação.
 * Body: { thread_id: string | null, message: string, locale?, timezone? }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1?target=deno";
import { corsHeadersForRequest } from "../_shared/cors.ts";
import { buildBootstrapContext } from "./context/bootstrap.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { persistProposals } from "./proposals.ts";
import { buildToolRegistry, type ToolContext } from "./tools/registry.ts";
import {
  proposeMarkMovieTool,
  searchMovieCatalogTool,
} from "./tools/entertainment/movies.ts";
import {
  proposeMarkBookTool,
  searchBookCatalogTool,
} from "./tools/entertainment/books.ts";
import {
  proposeMarkAlbumTool,
  searchAlbumCatalogTool,
} from "./tools/entertainment/albums.ts";
import { queryRecentEntertainmentTool } from "./tools/query.ts";
import { askUserTool } from "./tools/clarify.ts";
import { suggestNextActionsTool } from "./tools/suggestions.ts";
import type { OrbAgentRequest, OrbAgentResponse } from "./types.ts";

const MODEL = (Deno.env.get("ORB_MODEL") ?? "claude-sonnet-5").trim();
const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 20;

const { tools: TOOLS, byName: TOOL_BY_NAME } = buildToolRegistry([
  searchMovieCatalogTool,
  proposeMarkMovieTool,
  searchBookCatalogTool,
  proposeMarkBookTool,
  searchAlbumCatalogTool,
  proposeMarkAlbumTool,
  queryRecentEntertainmentTool,
  askUserTool,
  suggestNextActionsTool,
]);

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersForRequest(req), "Content-Type": "application/json" },
  });
}

function todayIsoInTimezone(timezone?: string): string {
  const tz = (timezone ?? "").trim() || "America/Sao_Paulo";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

Deno.serve(async (req) => {
  const cors = corsHeadersForRequest(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const anthropicKey = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (!anthropicKey) {
    return json(req, { error: "Orb não configurado", code: "ORB_NOT_CONFIGURED" }, 503);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(req, { error: "Não autenticado" }, 401);

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();
  if (userError || !user) return json(req, { error: "Não autenticado" }, 401);

  let body: OrbAgentRequest;
  try {
    const raw = await req.json();
    const message = String(raw?.message ?? "").trim();
    if (!message) throw new Error("message vazio");
    body = {
      thread_id: raw?.thread_id ? String(raw.thread_id) : null,
      message,
      locale: raw?.locale ? String(raw.locale) : "pt-BR",
      timezone: raw?.timezone ? String(raw.timezone) : undefined,
    };
  } catch {
    return json(req, { error: "Corpo inválido" }, 400);
  }

  try {
    // 1. Thread (cria se necessário) + histórico curto.
    let threadId = body.thread_id;
    if (threadId) {
      const { data: existing } = await client
        .from("orb_thread")
        .select("id")
        .eq("id", threadId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!existing) threadId = null;
    }
    if (!threadId) {
      const { data: created, error: createError } = await client
        .from("orb_thread")
        .insert([{ user_id: user.id }])
        .select("id")
        .single();
      if (createError) throw new Error(createError.message);
      threadId = created.id as string;
    }

    const { data: historyRows } = await client
      .from("orb_message")
      .select("role, content, created_at")
      .eq("thread_id", threadId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    const history = (historyRows ?? []).slice().reverse();

    // 2. Persiste a mensagem do usuário.
    const { error: userMsgError } = await client.from("orb_message").insert([
      { thread_id: threadId, user_id: user.id, role: "user", content: body.message },
    ]);
    if (userMsgError) throw new Error(userMsgError.message);

    // 3. Bootstrap context + system prompt.
    const bootstrap = await buildBootstrapContext(client, user.id);
    const todayIso = todayIsoInTimezone(body.timezone);
    const systemPrompt = buildSystemPrompt(bootstrap, todayIso);

    // 4. Loop de tool-calling.
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const anthropicTools = TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    }));

    const ctx: ToolContext = {
      client,
      userId: user.id,
      supabaseUrl,
      authHeader,
      todayIso,
      proposals: [],
      suggestedActions: [],
      clarify: null,
    };

    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({
        role: h.role as "user" | "assistant",
        content: String(h.content ?? ""),
      })),
      { role: "user", content: body.message },
    ];

    let finalText = "";
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: anthropicTools,
        messages,
      });

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      finalText = textBlocks.map((b) => b.text).join("\n").trim() || finalText;

      if (toolUseBlocks.length === 0) break;

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUseBlocks) {
        const tool = TOOL_BY_NAME.get(toolUse.name);
        let result: unknown;
        if (!tool) {
          result = { error: `Tool desconhecida: ${toolUse.name}` };
        } else {
          try {
            result = await tool.handler(
              (toolUse.input ?? {}) as Record<string, unknown>,
              ctx
            );
          } catch (err) {
            result = { error: err instanceof Error ? err.message : String(err) };
          }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });

      if (response.stop_reason === "end_turn") break;
    }

    if (!finalText) {
      finalText = ctx.clarify
        ? ctx.clarify.question
        : "Feito. Quer que eu faça mais alguma coisa?";
    }

    // 5. Persiste a mensagem do assistant + propostas.
    const { data: assistantMsg, error: assistantMsgError } = await client
      .from("orb_message")
      .insert([
        {
          thread_id: threadId,
          user_id: user.id,
          role: "assistant",
          content: finalText,
          meta: {
            suggested_actions: ctx.suggestedActions,
            clarify: ctx.clarify,
          },
        },
      ])
      .select("id")
      .single();
    if (assistantMsgError) throw new Error(assistantMsgError.message);
    const messageId = assistantMsg.id as string;

    const persisted = await persistProposals(
      client,
      user.id,
      threadId,
      messageId,
      ctx.proposals
    );

    await client
      .from("orb_thread")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);

    const payload: OrbAgentResponse = {
      thread_id: threadId,
      message_id: messageId,
      text: finalText,
      proposals: persisted.map((p) => ({
        id: p.id,
        tool_name: p.tool_name,
        module: p.module,
        payload: p.payload,
        summary: p.summary,
      })),
      clarify: ctx.clarify,
      suggested_actions: ctx.suggestedActions,
    };

    return json(req, payload, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(req, { error: message }, 500);
  }
});
