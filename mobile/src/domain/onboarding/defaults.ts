import { createClassApi, createTypeApi, fetchDimensions } from "@/api/finance/dimensions";

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

export async function ensureDefaultDimensions(): Promise<{
  createdTypes: number;
  createdClasses: number;
  missingNatures: string[];
}> {
  const dimensions = await fetchDimensions();
  const natureByName = new Map(
    dimensions.map((n) => [n.name.trim().toLowerCase(), n])
  );
  const typeNames = new Set(
    dimensions.flatMap((n) => n.types.map((t) => t.name.trim().toLowerCase()))
  );
  const classKey = new Set(
    dimensions.flatMap((n) =>
      n.types.flatMap((t) =>
        t.classes.map((c) => `${t.id}:${c.name.trim().toLowerCase()}`)
      )
    )
  );

  let createdTypes = 0;
  let createdClasses = 0;
  const missingNatures: string[] = [];

  for (const seed of DEFAULT_SEED) {
    const nature = natureByName.get(seed.natureName.toLowerCase());
    if (!nature) {
      if (!missingNatures.includes(seed.natureName)) missingNatures.push(seed.natureName);
      continue;
    }

    let type = nature.types.find(
      (t) => t.name.trim().toLowerCase() === seed.name.toLowerCase()
    );

    if (!type && !typeNames.has(seed.name.toLowerCase())) {
      const created = await createTypeApi({
        name: seed.name,
        nature_id: nature.id,
        hex_color: seed.hex_color,
        lucide_icon: seed.lucide_icon,
        exclude_from_spend: seed.exclude_from_spend ?? false,
      });
      createdTypes += 1;
      typeNames.add(seed.name.toLowerCase());
      type = { id: created.id, name: created.name, classes: [] };
      nature.types.push(type);
    }

    if (!type) continue;
    for (const className of seed.classes) {
      const key = `${type.id}:${className.toLowerCase()}`;
      if (classKey.has(key)) continue;
      await createClassApi({ name: className, type_id: type.id });
      createdClasses += 1;
      classKey.add(key);
    }
  }

  return { createdTypes, createdClasses, missingNatures };
}
