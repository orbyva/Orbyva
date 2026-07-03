import { createUserClient, getAuthenticatedUser } from "./lib/supabase.ts";
import { logAgentAction } from "./lib/audit.ts";
import {
  cancelPendingAction,
  confirmPendingAction,
  executeAgentTool,
} from "./tools/executor.ts";
import { runAgentOrchestrator } from "./orchestrator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUGGESTED_QUESTIONS = [
  "Qual foi meu saldo no mês?",
  "Quais foram meus maiores gastos?",
  "Quais classes mais impactaram o resultado?",
  "Existe algum ponto de atenção nos meus dados?",
  "Me dê um resumo financeiro do período",
  "Cadastre uma nova despesa",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createUserClient(req.headers.get("Authorization"));
    const user = await getAuthenticatedUser(supabase);
    const body = await req.json();

    if (body.confirmActionId) {
      const result = await confirmPendingAction(
        supabase,
        user.id,
        String(body.confirmActionId)
      );

      await logAgentAction(supabase, user.id, {
        actionType: "confirm_action",
        toolName: result.actionType,
        input: { actionId: body.confirmActionId },
        output: result,
        success: true,
      });

      return jsonResponse({
        message: `Pronto! ${result.summary} foi registrado(a) com sucesso.`,
        suggestedQuestions: SUGGESTED_QUESTIONS,
      });
    }

    if (body.cancelActionId) {
      await cancelPendingAction(supabase, user.id, String(body.cancelActionId));

      await logAgentAction(supabase, user.id, {
        actionType: "cancel_action",
        input: { actionId: body.cancelActionId },
        success: true,
      });

      return jsonResponse({
        message: "Cadastro cancelado. Posso ajudar com mais alguma coisa?",
        suggestedQuestions: SUGGESTED_QUESTIONS,
      });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      return jsonResponse({
        message:
          "Olá! Sou seu consultor financeiro no FinTrack. Analiso seus dados reais com natureza, tipo e classe. Cada resposta inclui resumo, detalhamento, ponto de atenção e recomendação. Cadastros exigem sua confirmação.",
        suggestedQuestions: SUGGESTED_QUESTIONS,
      });
    }

    const result = await runAgentOrchestrator(messages, {
      executeTool: async (name, args) => {
        const toolResult = await executeAgentTool(supabase, user.id, name, args);

        await logAgentAction(supabase, user.id, {
          actionType: "tool_call",
          toolName: name,
          input: args,
          output: toolResult.result,
          success: true,
        });

        return toolResult;
      },
    });

    return jsonResponse({
      message: result.message,
      pendingAction: result.pendingAction,
      suggestedQuestions: SUGGESTED_QUESTIONS,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro interno do assistente.";

    return new Response(JSON.stringify({ error: message }), {
      status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
