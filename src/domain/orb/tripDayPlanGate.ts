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
  /**
   * Só `status` é lido aqui, mas o estado real (`OrbProposalState`) traz `message`/`link` quando
   * `status` é `"done"` ou `"error"`. Declará-los como opcionais mantém este módulo de domínio
   * independente de `hooks/useOrb` e ainda aceita o objeto real escrito inline — que, sem isto,
   * o TypeScript recusa por propriedade excedente.
   */
  proposalStates: Record<string, { status: string; message?: string; link?: string }>;
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
