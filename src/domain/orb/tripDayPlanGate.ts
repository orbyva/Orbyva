import {
  isOrbProposal,
  ORB_CREATE_TOOL_NAME,
  type OrbProposal,
} from "../../../supabase/functions/_shared/orb/actions.ts";

export function tripDayPlanAguardandoViagem(proposal: OrbProposal): string | null {
  if (proposal.kind !== "trip_day_plan") return null;
  const pending = proposal.payload?.pending_trip_title;
  const tripId = proposal.payload?.trip_id;
  if (typeof pending === "string" && pending.trim() && !tripId) {
    return pending.trim();
  }
  return null;
}

function tituloNormalizado(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().toLowerCase() : "";
}

/**
 * A viagem correspondente já foi confirmada (cartão "Nova viagem" → criado) nesta conversa.
 */
export function viagemConfirmadaNaConversa(params: {
  titulo: string;
  messages: { tools?: { id: string; name: string; status: string; summary?: unknown }[] }[];
  proposalStates: Record<string, { status: string }>;
}): boolean {
  const alvo = tituloNormalizado(params.titulo);
  if (!alvo) return false;
  for (const mensagem of params.messages) {
    for (const tool of mensagem.tools ?? []) {
      if (tool.name !== ORB_CREATE_TOOL_NAME || tool.status !== "ok") continue;
      if (!isOrbProposal(tool.summary)) continue;
      if (tool.summary.kind !== "trip") continue;
      if (tituloNormalizado(tool.summary.payload?.title) !== alvo) continue;
      if (params.proposalStates[tool.id]?.status === "done") return true;
    }
  }
  return false;
}
