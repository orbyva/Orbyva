import type { Dimension } from "@/types/dimensions";

export function filterDimensionTree(
  dimensions: Dimension[],
  search: string,
  natureId: number | "all"
): Dimension[] {
  const q = search.trim().toLowerCase();
  return dimensions
    .filter((nature) => natureId === "all" || nature.id === natureId)
    .map((nature) => {
      const types = nature.types
        .filter((type) => {
          if (!q) return true;
          if (type.name.toLowerCase().includes(q)) return true;
          if (nature.name.toLowerCase().includes(q)) return true;
          return type.classes.some((cls) => cls.name.toLowerCase().includes(q));
        })
        .map((type) => {
          if (!q) return type;
          const typeHit =
            type.name.toLowerCase().includes(q) ||
            nature.name.toLowerCase().includes(q);
          return {
            ...type,
            classes: typeHit
              ? type.classes
              : type.classes.filter((cls) =>
                  cls.name.toLowerCase().includes(q)
                ),
          };
        });
      return { ...nature, types };
    })
    .filter((nature) => !q || nature.types.length > 0);
}

type DimClass = Dimension["types"][number]["classes"][number];

export function typeIdForClass(
  dimensions: Dimension[],
  classId: number
): number | null {
  for (const nature of dimensions) {
    for (const type of nature.types) {
      if (type.classes.some((cls) => cls.id === classId)) return type.id;
    }
  }
  return null;
}

/** Reassocia a subcategoria a outra categoria, como o board do web. */
export function moveClassToType(
  dimensions: Dimension[],
  classId: number,
  targetTypeId: number
): Dimension[] {
  let moved: DimClass | null = null;
  const stripped = dimensions.map((nature) => ({
    ...nature,
    types: nature.types.map((type) => {
      const hit = type.classes.find((cls) => cls.id === classId);
      if (!hit) return type;
      moved = hit;
      return {
        ...type,
        classes: type.classes.filter((cls) => cls.id !== classId),
      };
    }),
  }));
  if (!moved) return dimensions;
  const item = moved;
  let foundTarget = false;
  const next = stripped.map((nature) => ({
    ...nature,
    types: nature.types.map((type) => {
      if (type.id !== targetTypeId) return type;
      foundTarget = true;
      const classes = [...type.classes, item].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
      );
      return { ...type, classes };
    }),
  }));
  return foundTarget ? next : dimensions;
}

export function typeIdAtPoint(
  rects: Map<number, { x: number; y: number; w: number; h: number }>,
  x: number,
  y: number
): number | null {
  for (const [id, rect] of rects) {
    if (
      x >= rect.x &&
      x <= rect.x + rect.w &&
      y >= rect.y &&
      y <= rect.y + rect.h
    ) {
      return id;
    }
  }
  return null;
}

// token-livre-início: paleta de cor escolhida pelo usuário e gravada no banco
export const CATEGORY_COLORS = [
  "#0EA5E9",
  "#22A37A",
  "#A855F7",
  "#E11D48",
  "#D97706",
  "#64748b",
  "#D46BE8",
  "#6B7CFA",
  "#14B8A6",
  "#F59E0B",
] as const;

/** Cor inicial de uma etiqueta nova no formulário de tarefa (gravada no dado). */
export const DEFAULT_TAG_COLOR = "#A855F7";
/** Cor inicial na tela de etiquetas (gravada no dado). */
export const NEUTRAL_TAG_COLOR = "#94a3b8";
// token-livre-fim

export function normalizeHexColor(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let hex = t.startsWith("#") ? t : `#${t}`;
  if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex.toLowerCase();
  return null;
}
