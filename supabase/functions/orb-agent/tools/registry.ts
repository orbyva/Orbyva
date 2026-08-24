import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { OrbClarify, OrbProposalDraft, OrbSuggestedAction } from "../types.ts";

export interface ToolContext {
  client: SupabaseClient;
  userId: string;
  supabaseUrl: string;
  authHeader: string;
  todayIso: string;
  proposals: OrbProposalDraft[];
  suggestedActions: OrbSuggestedAction[];
  clarify: OrbClarify | null;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  handler: (input: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export function buildToolRegistry(
  tools: ToolDefinition[]
): { tools: ToolDefinition[]; byName: Map<string, ToolDefinition> } {
  const byName = new Map(tools.map((t) => [t.name, t]));
  return { tools, byName };
}
