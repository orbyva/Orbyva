import {
  createClassApi,
  createTypeApi,
  fetchClasses,
  fetchNatures,
  fetchTypes,
  updateClassApi,
} from "@/api/finance";
import type { Type } from "@/types/finance";

type SeedType = {
  natureName: "Receita" | "Despesa" | "Investimento";
  name: string;
  hex_color: string;
  lucide_icon: string;
  classes: string[];
  exclude_from_spend?: boolean;
};

const DEFAULT_SEED: SeedType[] = [
  {
    natureName: "Receita",
    name: "Salário",
    hex_color: "#16a34a",
    lucide_icon: "wallet",
    classes: ["Salário", "Freelance", "Outros"],
  },
  {
    natureName: "Despesa",
    name: "Moradia",
    hex_color: "#2563eb",
    lucide_icon: "home",
    classes: ["Aluguel", "Contas", "Internet"],
  },
  {
    natureName: "Despesa",
    name: "Alimentação",
    hex_color: "#ea580c",
    lucide_icon: "utensils",
    classes: ["Mercado", "Restaurante", "Delivery"],
  },
  {
    natureName: "Despesa",
    name: "Transporte",
    hex_color: "#0ea5e9",
    lucide_icon: "car",
    classes: ["Combustível", "App / Uber", "Manutenção"],
  },
  {
    natureName: "Despesa",
    name: "Lazer",
    hex_color: "#db2777",
    lucide_icon: "sparkles",
    classes: ["Cinema", "Viagem", "Outros"],
  },
  {
    natureName: "Investimento",
    name: "Investimento",
    hex_color: "#0d9488",
    lucide_icon: "trending-up",
    classes: ["Reserva"],
    exclude_from_spend: true,
  },
];

/** Mapa classe padrão → nome do tipo (ex.: Freelance → Salário). */
export function seedTypeNameForClass(className: string): string | null {
  const needle = className.trim().toLowerCase();
  for (const seed of DEFAULT_SEED) {
    if (seed.classes.some((c) => c.toLowerCase() === needle)) {
      return seed.name;
    }
  }
  return null;
}

/**
 * Reaponta classes cujo `type_id` não é legível/pertence ao usuário
 * (comum após tenancy: tipo antigo compartilhado some no embed).
 */
export async function repairOrphanClasses(types: Type[]): Promise<number> {
  const classes = await fetchClasses();
  const ownedTypeIds = new Set(types.map((t) => t.id));
  let repaired = 0;

  for (const cls of classes) {
    const currentTypeId = cls.type_id ?? cls.type?.id;
    if (currentTypeId && ownedTypeIds.has(currentTypeId) && cls.type?.name) {
      continue;
    }

    const byEmbedName = cls.type?.name
      ? types.find(
          (t) => t.name.trim().toLowerCase() === cls.type!.name.trim().toLowerCase()
        )
      : undefined;
    const seedTypeName = seedTypeNameForClass(cls.name);
    const bySeed = seedTypeName
      ? types.find(
          (t) => t.name.trim().toLowerCase() === seedTypeName.toLowerCase()
        )
      : undefined;
    const target = byEmbedName ?? bySeed;
    if (!target) continue;

    await updateClassApi({ id: cls.id, name: cls.name, type_id: target.id });
    repaired += 1;
  }

  return repaired;
}

/**
 * Semeia tipos/classes padrão **só para o usuário autenticado**.
 * Naturezas Receita/Despesa/Investimento precisam existir (scripts/seed_natures.sql).
 */
export async function ensureDefaultDimensions(): Promise<{
  createdTypes: number;
  createdClasses: number;
  missingNatures: string[];
}> {
  const [natures, types, classes] = await Promise.all([
    fetchNatures(),
    fetchTypes(),
    fetchClasses(),
  ]);

  const natureByName = new Map(
    natures.map((n) => [n.name.trim().toLowerCase(), n])
  );
  const typeNames = new Set(types.map((t) => t.name.trim().toLowerCase()));
  const classKey = new Set(
    classes.map((c) => {
      const typeId = c.type_id ?? c.type?.id ?? 0;
      return `${typeId}:${c.name.trim().toLowerCase()}`;
    })
  );

  let createdTypes = 0;
  let createdClasses = 0;
  const missingNatures: string[] = [];

  for (const seed of DEFAULT_SEED) {
    const nature = natureByName.get(seed.natureName.toLowerCase());
    if (!nature) {
      if (!missingNatures.includes(seed.natureName)) {
        missingNatures.push(seed.natureName);
      }
      continue;
    }

    let typeId = types.find(
      (t) => t.name.trim().toLowerCase() === seed.name.toLowerCase()
    )?.id;

    if (!typeId && !typeNames.has(seed.name.toLowerCase())) {
      await createTypeApi({
        name: seed.name,
        nature_id: nature.id,
        hex_color: seed.hex_color,
        lucide_icon: seed.lucide_icon,
        exclude_from_spend: seed.exclude_from_spend ?? false,
      });
      createdTypes += 1;
      typeNames.add(seed.name.toLowerCase());
      const refreshed = await fetchTypes();
      typeId = refreshed.find(
        (t) => t.name.trim().toLowerCase() === seed.name.toLowerCase()
      )?.id;
      if (typeId) types.push(...refreshed.filter((t) => t.id === typeId));
    } else if (typeId && (seed.exclude_from_spend || seed.natureName === "Investimento")) {
      const existing = types.find((t) => t.id === typeId);
      if (
        existing &&
        ((seed.exclude_from_spend && !existing.exclude_from_spend) ||
          (seed.natureName === "Investimento" &&
            existing.nature?.name !== "Investimento"))
      ) {
        const { updateTypeApi } = await import("@/api/finance");
        await updateTypeApi({
          id: typeId,
          name: existing.name,
          nature_id: nature.id,
          exclude_from_spend: seed.exclude_from_spend ?? existing.exclude_from_spend,
        });
      }
    }

    if (!typeId) continue;

    for (const className of seed.classes) {
      const key = `${typeId}:${className.toLowerCase()}`;
      if (classKey.has(key)) continue;
      await createClassApi({ name: className, type_id: typeId });
      createdClasses += 1;
      classKey.add(key);
    }
  }

  const owned = await fetchTypes();
  await repairOrphanClasses(owned);

  return { createdTypes, createdClasses, missingNatures };
}
