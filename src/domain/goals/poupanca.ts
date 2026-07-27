import {
  createClassApi,
  createTypeApi,
  fetchClasses,
  fetchNatures,
  fetchTypes,
  updateTypeApi,
} from "@/api/finance";
import {
  INVESTIMENTO_TYPE_NAME,
  NATURE_INVESTIMENTO,
} from "@/domain/finance/spendFlags";
import { goalMetaClassName } from "@/domain/goals/finance";

/** Garante tipo Investimento + classe `Meta - {título}` sob natureza Investimento. */
export async function ensureGoalInvestimentoClass(
  goalTitle: string
): Promise<number> {
  const className = goalMetaClassName(goalTitle);
  if (!className.replace(/^Meta\s*-\s*/i, "").trim()) {
    throw new Error("Informe o título da meta para criar a classe.");
  }

  const [natures, types, classes] = await Promise.all([
    fetchNatures(),
    fetchTypes(),
    fetchClasses(),
  ]);

  const nature = natures.find(
    (n) => n.name.trim().toLowerCase() === NATURE_INVESTIMENTO.toLowerCase()
  );
  if (!nature) {
    throw new Error(
      "Natureza Investimento não encontrada. Aplique a migration de seed Investimento no Supabase."
    );
  }

  let type = types.find(
    (t) => t.name.trim().toLowerCase() === INVESTIMENTO_TYPE_NAME.toLowerCase()
  );

  if (!type) {
    await createTypeApi({
      name: INVESTIMENTO_TYPE_NAME,
      nature_id: nature.id,
      hex_color: "#0d9488",
      lucide_icon: "trending-up",
      exclude_from_spend: true,
    });
    const refreshed = await fetchTypes();
    type = refreshed.find(
      (t) =>
        t.name.trim().toLowerCase() === INVESTIMENTO_TYPE_NAME.toLowerCase()
    );
  } else {
    const needsNature =
      (type.nature_id ?? type.nature?.id) !== nature.id;
    const needsFlag = !type.exclude_from_spend;
    if (needsNature || needsFlag) {
      await updateTypeApi({
        id: type.id,
        name: type.name,
        nature_id: nature.id,
        exclude_from_spend: true,
      });
    }
  }

  if (!type) {
    throw new Error("Não foi possível criar o tipo Investimento.");
  }

  const needle = className.toLowerCase();
  let metaClass = classes.find(
    (c) =>
      (c.type_id ?? c.type?.id) === type!.id &&
      c.name.trim().toLowerCase() === needle
  );

  if (!metaClass) {
    await createClassApi({
      name: className,
      type_id: type.id,
    });
    const refreshedClasses = await fetchClasses();
    metaClass = refreshedClasses.find(
      (c) =>
        (c.type_id ?? c.type?.id) === type!.id &&
        c.name.trim().toLowerCase() === needle
    );
  }

  if (!metaClass) {
    throw new Error(`Não foi possível criar a classe ${className}.`);
  }

  return metaClass.id;
}

/** @deprecated use ensureGoalInvestimentoClass */
export async function ensurePoupançaAporteClass(
  goalTitle = "Meta"
): Promise<number> {
  return ensureGoalInvestimentoClass(goalTitle);
}
