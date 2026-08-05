import type { Class, Nature, Type } from "@/types/finance";
import type { SortState } from "@/components/SortableTableHead";
import { toggleSort } from "@/components/SortableTableHead";

export type TypeSortKey = "name" | "nature";
export type ClassSortKey = "name" | "type";

export type TypeSortState = SortState<TypeSortKey>;
export type ClassSortState = SortState<ClassSortKey>;

export { toggleSort };

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
}

function natureName(type: Type, natures: Nature[]): string {
  const natureId = type.nature_id ?? type.nature?.id ?? null;
  const fromList =
    natureId != null ? natures.find((n) => n.id === natureId) : undefined;
  return fromList?.name ?? type.nature?.name ?? "Sem natureza";
}

function typeName(cls: Class, types: Type[]): string {
  const typeId = cls.type?.id ?? cls.type_id ?? null;
  const fromList =
    typeId != null ? types.find((t) => t.id === typeId) : undefined;
  return fromList?.name ?? cls.type?.name ?? "Sem categoria";
}

export function sortTypesList(
  types: Type[],
  natures: Nature[],
  sort: TypeSortState
): Type[] {
  const mult = sort.dir === "asc" ? 1 : -1;
  return [...types].sort((a, b) => {
    if (sort.key === "nature") {
      const byNature = compareText(
        natureName(a, natures),
        natureName(b, natures)
      );
      if (byNature !== 0) return byNature * mult;
      return compareText(a.name?.trim() || "", b.name?.trim() || "");
    }

    const byName = compareText(a.name?.trim() || "", b.name?.trim() || "");
    if (byName !== 0) return byName * mult;
    return compareText(natureName(a, natures), natureName(b, natures));
  });
}

export function sortClassesList(
  classes: Class[],
  types: Type[],
  sort: ClassSortState
): Class[] {
  const mult = sort.dir === "asc" ? 1 : -1;
  return [...classes].sort((a, b) => {
    if (sort.key === "type") {
      const byType = compareText(typeName(a, types), typeName(b, types));
      if (byType !== 0) return byType * mult;
      // Mesmo tipo → classe crescente
      return compareText(a.name?.trim() || "", b.name?.trim() || "");
    }

    const byName = compareText(a.name?.trim() || "", b.name?.trim() || "");
    if (byName !== 0) return byName * mult;
    return compareText(typeName(a, types), typeName(b, types));
  });
}
