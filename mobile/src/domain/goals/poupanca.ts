import { createClassApi, createTypeApi, fetchDimensions } from "@/api/finance/dimensions";
import { META_TYPE_NAME, NATURE_INVESTIMENTO } from "@/domain/finance/spendFlags";
import { goalClassName } from "@/domain/goals/finance";

/** Garante categoria Meta (natureza Investimento) + subcategoria = título da meta. */
export async function ensureGoalMetaClass(goalTitle: string): Promise<number> {
  const className = goalClassName(goalTitle);
  if (!className) {
    throw new Error("Informe o título da meta para criar a subcategoria.");
  }

  const dimensions = await fetchDimensions();
  const nature = dimensions.find(
    (row) => row.name.trim().toLowerCase() === NATURE_INVESTIMENTO.toLowerCase()
  );
  if (!nature) {
    throw new Error(
      "Categoria de investimento indisponível no momento. Tente mais tarde."
    );
  }

  let type = nature.types.find(
    (row) => row.name.trim().toLowerCase() === META_TYPE_NAME.toLowerCase()
  );

  if (!type) {
    const created = await createTypeApi({
      name: META_TYPE_NAME,
      nature_id: nature.id,
      hex_color: "#0d9488", // token-livre: cor do tipo gravada no banco
      lucide_icon: "flag",
      exclude_from_spend: true,
    });
    type = {
      id: created.id,
      name: created.name,
      hex_color: created.hex_color,
      lucide_icon: created.lucide_icon,
      classes: [],
    };
  }

  const needle = className.toLowerCase();
  const existing = type.classes.find(
    (cls) => cls.name.trim().toLowerCase() === needle
  );
  if (existing) return existing.id;

  const createdClass = await createClassApi({
    name: className,
    type_id: type.id,
  });
  return createdClass.id;
}
