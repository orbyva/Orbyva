import type { OrbSuggestedAction, OrbSuggestedActionKind } from "@/types/orb";

type ActionMessageBuilder = (args?: Record<string, unknown>) => string;

function stringArg(
  args: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = args?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

const ACTION_MESSAGE_BUILDERS: Record<OrbSuggestedActionKind, ActionMessageBuilder> =
  {
    similar_movies: (args) => {
      const title = stringArg(args, "title");
      return title
        ? `Sugira filmes parecidos com ${title}`
        : "Sugira filmes parecidos com o que acabei de marcar";
    },
    recommend_friend: (args) => {
      const title = stringArg(args, "title");
      return title
        ? `Quero recomendar "${title}" pra um amigo`
        : "Quero recomendar isso pra um amigo";
    },
    rate_more: () => "Quero avaliar mais itens da minha lista",
    search_more: (args) => {
      const query = stringArg(args, "query");
      return query
        ? `Busque mais sobre ${query}`
        : "Quero buscar mais opções parecidas";
    },
  };

/**
 * Mensagem a reenviar pro `orb-agent` quando o usuário clica num CTA sugerido.
 * `action` desconhecida (fora do enum validado na Edge) retorna `null` em vez
 * de quebrar — o chamador simplesmente ignora o chip.
 */
export function buildSuggestedActionMessage(
  action: Pick<OrbSuggestedAction, "action" | "args">
): string | null {
  const builder = ACTION_MESSAGE_BUILDERS[action.action];
  if (!builder) return null;
  return builder(action.args);
}
