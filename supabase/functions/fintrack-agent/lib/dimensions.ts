export interface DimensionInfo {
  nature: string;
  typeName: string;
  className: string;
  label: string;
}

type ClassRelation = {
  name?: string;
  type?: {
    name?: string;
    nature?: { name?: string };
  };
} | null;

export function extractDimension(cls: ClassRelation): DimensionInfo {
  const nature = cls?.type?.nature?.name ?? "Desconhecido";
  const typeName = cls?.type?.name ?? "Sem tipo";
  const className = cls?.name ?? "Sem classe";

  return {
    nature,
    typeName,
    className,
    label: `Natureza ${nature} · Tipo ${typeName} · Classe ${className}`,
  };
}

export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
