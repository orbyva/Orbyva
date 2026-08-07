import type { Class, Type } from "@/types/finance";

function matchesQuery(text: string | null | undefined, query: string): boolean {
  if (!query) return true;
  return (text ?? "").toLowerCase().includes(query);
}

/**
 * Filtra categorias (types) pela busca: nome da categoria, natureza ou
 * qualquer subcategoria vinculada.
 */
export function filterTypesBySearch(
  types: Type[],
  classes: Class[],
  search: string
): Type[] {
  const q = search.trim().toLowerCase();
  if (!q) return types;

  const classesByType = new Map<number, Class[]>();
  for (const cls of classes) {
    const tid = cls.type_id ?? cls.type?.id;
    if (tid == null) continue;
    const list = classesByType.get(tid) ?? [];
    list.push(cls);
    classesByType.set(tid, list);
  }

  return types.filter((type) => {
    if (matchesQuery(type.name, q)) return true;
    if (matchesQuery(type.nature?.name, q)) return true;
    const linked = classesByType.get(type.id) ?? [];
    return linked.some((cls) => matchesQuery(cls.name, q));
  });
}

/** Filtra subcategorias visíveis sob uma categoria (quando há busca). */
export function filterClassesBySearch(classes: Class[], search: string): Class[] {
  const q = search.trim().toLowerCase();
  if (!q) return classes;
  return classes.filter(
    (cls) =>
      matchesQuery(cls.name, q) ||
      matchesQuery(cls.type?.name, q) ||
      matchesQuery(cls.type?.nature?.name, q)
  );
}

/**
 * Subcategorias a exibir sob uma categoria já incluída no resultado da busca.
 * Se a categoria/natureza bateu, mostra todas; senão só as subcategorias que batem.
 */
export function visibleClassesForTypeSearch(
  type: Type,
  classes: Class[],
  search: string
): Class[] {
  const q = search.trim().toLowerCase();
  if (!q) return classes;
  if (matchesQuery(type.name, q) || matchesQuery(type.nature?.name, q)) {
    return classes;
  }
  return classes.filter((cls) => matchesQuery(cls.name, q));
}
