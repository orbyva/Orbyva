/** Escapa os curingas do LIKE (`%`, `_`, `\`) para buscar o texto literal. */
export function escapeLikeValue(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
