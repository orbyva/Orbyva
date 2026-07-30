import {
  createClassApi,
  createTypeApi,
  fetchClasses,
  fetchNatures,
  fetchTypes,
  updateTypeApi,
} from "@/api/finance";
import {
  META_TYPE_NAME,
  NATURE_INVESTIMENTO,
} from "@/domain/finance/spendFlags";
import { goalClassName } from "@/domain/goals/finance";

/**
 * Garante tipo Meta (natureza Investimento) + classe = título da meta.
 * Ex.: natureza Investimento → tipo Meta → classe Viajar.
 */
export async function ensureGoalMetaClass(goalTitle: string): Promise<number> {
  const className = goalClassName(goalTitle);
  if (!className) {
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
      "Categoria de investimento indisponível no momento. Tente mais tarde."
    );
  }

  let type = types.find(
    (t) => t.name.trim().toLowerCase() === META_TYPE_NAME.toLowerCase()
  );

  if (!type) {
    await createTypeApi({
      name: META_TYPE_NAME,
      nature_id: nature.id,
      hex_color: "#0d9488",
      lucide_icon: "flag",
      exclude_from_spend: true,
    });
    const refreshed = await fetchTypes();
    type = refreshed.find(
      (t) => t.name.trim().toLowerCase() === META_TYPE_NAME.toLowerCase()
    );
  } else {
    const needsNature = (type.nature_id ?? type.nature?.id) !== nature.id;
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
    throw new Error("Não foi possível criar o tipo Meta.");
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

/** @deprecated use ensureGoalMetaClass */
export async function ensureGoalInvestimentoClass(
  goalTitle: string
): Promise<number> {
  return ensureGoalMetaClass(goalTitle);
}

/** @deprecated use ensureGoalMetaClass */
export async function ensurePoupançaAporteClass(
  goalTitle = "Meta"
): Promise<number> {
  return ensureGoalMetaClass(goalTitle);
}
