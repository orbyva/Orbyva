import { externalLinkHostLabel } from "./externalLink";

/** Mesma mensagem de protocolo da 085 (`TaskExternalLinksField.EXTERNAL_URL_HINT`),
 *  definida aqui para o domínio não depender da camada de UI. */
export const EXTERNAL_URL_HINT = "Comece com https://";
import type { ProjectAssetDraft, ProjectAssetKind } from "@/types/tasks";

/**
 * Normaliza um rascunho de asset do projeto:
 * - `title` aparado; se vazio, cai para `externalLinkHostLabel(url)` e depois para a própria URL
 * - `comment` vazio ou só espaços vira `null`
 * - `url` aparada
 * - `kind` validado
 *
 * NÃO valida protocolo aqui (a UI faz no blur com a mesma mensagem da 085).
 * A validação estrita de URL (`isValidAssetUrl`) fica exposta para quem precisa.
 */
export function normalizeProjectAssetDraft(
  draft: ProjectAssetDraft
): ProjectAssetDraft {
  const url = draft.url ? draft.url.trim() : null;
  const title =
    draft.title.trim() || (url ? externalLinkHostLabel(url) || url : "");
  const comment = draft.comment?.trim() ? draft.comment.trim() : null;

  return {
    ...draft,
    url,
    title,
    comment,
    position: draft.position ?? 0,
  };
}

/**
 * Regras de validação de URL para asset do projeto (kind="link").
 * Reusa a regra de protocolo da 085 (`EXTERNAL_URL_HINT`), sem duplicar a mensagem.
 * Para kind="file", a URL é nula (a 107 usa `storage_path`), então sempre passa.
 */
export function isValidAssetUrl(url: string | null | undefined, kind: ProjectAssetKind): boolean {
  if (kind === "file") return true;
  if (!url) return false;
  return /^https?:\/\//i.test(url.trim());
}