/**
 * Redutor puro do turno da Orb — sem React, sem fetch. O hook só aplica estes patches.
 */

import { mapOrbWebPathToMobile } from "@/domain/orb/navigationMap";
import type { OrbMessage, OrbStreamEvent, OrbToolCall } from "@/types/orb";

export const ORB_NAVIGATION_TOOL_NAME = "open_screen";
export const NAV_UNAVAILABLE_HINT = "Abrir tela ainda não disponível no app.";

export type OrbNavTargetLite = {
  path: string;
  label: string;
  screen: string;
  applied: string[];
};

type ToolStart = Extract<OrbStreamEvent, { type: "tool"; phase: "start" }>;
type ToolDone = Extract<OrbStreamEvent, { type: "tool"; phase: "done" }>;

export function isOrbNavTargetLite(valor: unknown): valor is OrbNavTargetLite {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return false;
  const alvo = valor as Record<string, unknown>;
  if (typeof alvo.path !== "string" || !alvo.path.startsWith("/")) return false;
  if (typeof alvo.label !== "string" || typeof alvo.screen !== "string") return false;
  return Array.isArray(alvo.applied) && alvo.applied.every((item) => typeof item === "string");
}

/** Summary amigável no cartão: rótulo, ou aviso se o mobile não tem a rota. */
export function summaryForNavigationDone(evento: ToolDone): unknown {
  if (evento.name !== ORB_NAVIGATION_TOOL_NAME || evento.ok === false) {
    return evento.summary;
  }
  if (!isOrbNavTargetLite(evento.summary)) return NAV_UNAVAILABLE_HINT;
  if (!mapOrbWebPathToMobile(evento.summary.path)) return NAV_UNAVAILABLE_HINT;
  const extra =
    evento.summary.applied.length > 0
      ? ` · ${evento.summary.applied.join(", ")}`
      : "";
  return `Abrindo ${evento.summary.label}${extra}`;
}

export function applyToolStart(mensagem: OrbMessage, evento: ToolStart): OrbMessage {
  const tools = mensagem.tools ?? [];
  const id = evento.id ?? `${evento.name}-${tools.length}`;
  if (tools.some((tool) => tool.id === id)) return mensagem;

  const nova: OrbToolCall = {
    id,
    name: evento.name,
    input: evento.input,
    status: "running",
  };
  return { ...mensagem, tools: [...tools, nova] };
}

export function applyToolDone(mensagem: OrbMessage, evento: ToolDone): OrbMessage {
  const tools = mensagem.tools ?? [];
  const status: OrbToolCall["status"] = evento.ok === false ? "error" : "ok";
  const durationMs = typeof evento.duration_ms === "number" ? evento.duration_ms : undefined;
  const summary =
    evento.name === ORB_NAVIGATION_TOOL_NAME
      ? summaryForNavigationDone(evento)
      : evento.summary;

  let alvo = -1;
  if (evento.id) {
    alvo = tools.findIndex((tool) => tool.id === evento.id);
  } else {
    for (let i = tools.length - 1; i >= 0; i -= 1) {
      if (tools[i].name === evento.name && tools[i].status === "running") {
        alvo = i;
        break;
      }
    }
  }

  if (alvo === -1) {
    const orfa: OrbToolCall = {
      id: evento.id ?? `${evento.name}-${tools.length}`,
      name: evento.name,
      status,
      summary,
      durationMs,
    };
    return { ...mensagem, tools: [...tools, orfa] };
  }

  return {
    ...mensagem,
    tools: tools.map((tool, indice) =>
      indice === alvo
        ? { ...tool, status, summary, durationMs: durationMs ?? tool.durationMs }
        : tool
    ),
  };
}

export function closeRunningTools(mensagem: OrbMessage): OrbMessage {
  if (!mensagem.tools?.some((tool) => tool.status === "running")) return mensagem;
  return {
    ...mensagem,
    tools: mensagem.tools.map((tool) =>
      tool.status === "running" ? { ...tool, status: "error" } : tool
    ),
  };
}
