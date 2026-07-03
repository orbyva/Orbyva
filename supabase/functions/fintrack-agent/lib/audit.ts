import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAgentAction(
  supabase: SupabaseClient,
  userId: string,
  input: {
    actionType: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    success?: boolean;
  }
) {
  const { error } = await supabase.from("agent_audit_log").insert([
    {
      user_id: userId,
      action_type: input.actionType,
      tool_name: input.toolName ?? null,
      input: input.input ?? null,
      output: input.output ?? null,
      success: input.success ?? true,
    },
  ]);

  if (error) {
    console.error("Failed to write audit log:", error.message);
  }
}
