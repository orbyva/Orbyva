import type { Dimension } from "@/types/dimensions";

export type TypePickOption = {
  id: number;
  name: string;
  natureId: number;
  natureName: string;
  hexColor: string | null;
  lucideIcon: string | null;
};

/** True when an option already has this class name (case-insensitive, trimmed). */
export function hasExactClassNameMatch(
  options: { name: string }[],
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return options.some((o) => o.name.trim().toLowerCase() === q);
}

/**
 * Offer GitHub-style "create X" when the query is non-empty and no exact
 * class-name match exists (partial matches still allow create).
 */
export function shouldOfferCreateClass(
  query: string,
  options: { name: string }[],
  allowCreate = true
): boolean {
  const q = query.trim();
  if (!allowCreate || !q) return false;
  return !hasExactClassNameMatch(options, q);
}

/** Categories (types) available to attach a new subcategory, optionally by nature. */
export function listTypesForCreate(
  dimensions: Dimension[],
  natureFilter?: string | null
): TypePickOption[] {
  const needle = natureFilter?.trim().toLowerCase() || null;
  const out: TypePickOption[] = [];
  for (const nature of dimensions) {
    if (needle && nature.name.toLowerCase() !== needle) continue;
    for (const type of nature.types) {
      out.push({
        id: type.id,
        name: type.name,
        natureId: nature.id,
        natureName: nature.name,
        hexColor: type.hex_color ?? null,
        lucideIcon: type.lucide_icon ?? null,
      });
    }
  }
  return out.sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
  );
}

export type NaturePickOption = {
  id: number;
  name: string;
};

export function listNaturesForCreate(
  dimensions: Dimension[]
): NaturePickOption[] {
  return dimensions.map((n) => ({ id: n.id, name: n.name }));
}

/**
 * Nature for quick create: preferred name → Despesa → first available.
 */
export function resolveNatureForCreate(
  dimensions: Dimension[],
  preferredNatureName?: string | null
): NaturePickOption | null {
  const natures = listNaturesForCreate(dimensions);
  if (natures.length === 0) return null;
  const preferred = preferredNatureName?.trim().toLowerCase();
  if (preferred) {
    const match = natures.find((n) => n.name.toLowerCase() === preferred);
    if (match) return match;
  }
  return (
    natures.find((n) => n.name.toLowerCase() === "despesa") ?? natures[0]
  );
}

/** Defaults for type created inline from the transaction picker. */
export const QUICK_CREATE_TYPE_COLOR = "#64748b"; // token-livre: cor gravada no banco
export const QUICK_CREATE_TYPE_ICON = "tag";

/** Show "Não achou…? Crie agora" when searching and nothing exact matched. */
export function shouldOfferCreateCta(
  query: string,
  options: { name: string }[],
  allowCreate = true,
  hasNatures = true
): boolean {
  if (!allowCreate || !hasNatures) return false;
  const q = query.trim();
  if (!q) return false;
  return !hasExactClassNameMatch(options, q);
}
