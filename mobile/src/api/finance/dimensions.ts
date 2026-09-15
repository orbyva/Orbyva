import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type {
  Class,
  ClassCreateRequest,
  ClassUpdateRequest,
  Dimension,
  Nature,
  Type,
  TypeCreateRequest,
  TypeUpdateRequest,
} from "@/types/dimensions";

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function fetchDimensions(): Promise<Dimension[]> {
  const userId = await getCurrentUserId();
  const [natures, types, classes] = await Promise.all([
    supabase.from("nature").select("id, name").order("id", { ascending: true }),
    supabase
      .from("type")
      .select("id, name, hex_color, lucide_icon, nature_id, user_id")
      .eq("user_id", userId)
      .order("order", { ascending: true }),
    supabase
      .from("class")
      .select("id, name, type_id, user_id")
      .eq("user_id", userId)
      .order("name", { ascending: true }),
  ]);

  if (natures.error) throw new Error(natures.error.message);
  if (types.error) throw new Error(types.error.message);
  if (classes.error) throw new Error(classes.error.message);

  const classesByType = new Map<number, { id: number; name: string }[]>();
  for (const cls of classes.data ?? []) {
    const list = classesByType.get(cls.type_id) ?? [];
    list.push({ id: cls.id, name: cls.name });
    classesByType.set(cls.type_id, list);
  }

  const typesByNature = new Map<number, Dimension["types"]>();
  for (const t of types.data ?? []) {
    const list = typesByNature.get(t.nature_id) ?? [];
    list.push({
      id: t.id,
      name: t.name,
      hex_color: t.hex_color ?? null,
      lucide_icon: t.lucide_icon ?? null,
      classes: classesByType.get(t.id) ?? [],
    });
    typesByNature.set(t.nature_id, list);
  }

  return (natures.data ?? []).map((nature) => ({
    id: nature.id,
    name: nature.name,
    types: typesByNature.get(nature.id) ?? [],
  }));
}

export function locateClass(dimensions: Dimension[], classId: number) {
  for (const nature of dimensions) {
    for (const type of nature.types) {
      const cls = type.classes.find((c) => c.id === classId);
      if (cls) return { nature, type, cls };
    }
  }
  return null;
}

export function classIdsForNature(
  dimensions: Dimension[],
  natureName: string
): number[] {
  const nature = dimensions.find((d) => d.name === natureName);
  if (!nature) return [];
  return nature.types.flatMap((t) => t.classes.map((c) => c.id));
}

export async function createTypeApi(
  newType: TypeCreateRequest
): Promise<Type> {
  const userId = await getCurrentUserId();
  const payload = { ...newType };

  if (payload.order == null) {
    const { data, error: fetchError } = await supabase
      .from("type")
      .select("order")
      .eq("user_id", userId)
      .order("order", { ascending: false })
      .limit(1);
    if (fetchError) throw fetchError;
    const lastOrder = data && data.length > 0 ? data[0].order : 0;
    payload.order = (lastOrder ?? 0) + 1;
  }

  const { data, error } = await supabase
    .from("type")
    .insert([{ ...payload, user_id: userId }])
    .select(
      `
      id, name, nature_id, hex_color, lucide_icon, order, exclude_from_spend, user_id,
      nature:nature_id(id, name)
    `
    )
    .single();

  if (error) throw error;
  const nature = asOne(data.nature as Nature | Nature[] | null) ?? {
    id: 0,
    name: "",
  };
  return {
    id: data.id,
    name: data.name,
    nature_id: data.nature_id,
    hex_color: data.hex_color,
    lucide_icon: data.lucide_icon,
    order: data.order,
    exclude_from_spend: data.exclude_from_spend,
    user_id: data.user_id,
    nature,
  };
}

export async function createClassApi(
  newClass: ClassCreateRequest
): Promise<Class> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("class")
    .insert([{ ...newClass, user_id: userId }])
    .select(
      `
      id,
      name,
      type_id,
      user_id,
      type:type_id(
        id,
        name,
        hex_color,
        lucide_icon,
        nature:nature_id(id, name)
      )
    `
    )
    .single();

  if (error) throw error;

  const typeRow = asOne(
    data.type as unknown as {
      id: number;
      name: string;
      hex_color: string | null;
      lucide_icon: string | null;
      nature: Nature | Nature[] | null;
    } | null
  );
  const nature = typeRow ? asOne(typeRow.nature) : null;

  return {
    id: data.id,
    name: data.name,
    type_id: data.type_id,
    user_id: data.user_id,
    type: typeRow
      ? {
          id: typeRow.id,
          name: typeRow.name,
          hex_color: typeRow.hex_color,
          lucide_icon: typeRow.lucide_icon,
          nature: nature ?? { id: 0, name: "" },
        }
      : null,
  };
}

export function classIdsForSearch(
  dimensions: Dimension[],
  term: string
): number[] {
  const lower = term.toLowerCase();
  const ids: number[] = [];
  for (const nature of dimensions) {
    for (const type of nature.types) {
      const typeMatch = type.name.toLowerCase().includes(lower);
      for (const cls of type.classes) {
        if (typeMatch || cls.name.toLowerCase().includes(lower)) {
          ids.push(cls.id);
        }
      }
    }
  }
  return ids;
}

export async function updateTypeApi(
  updateData: TypeUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...updateFields } = updateData;
  const { error } = await supabase
    .from("type")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function deleteTypeApi(typeId: number): Promise<void> {
  const userId = await getCurrentUserId();
  const { count: classCount, error: classCountError } = await supabase
    .from("class")
    .select("id", { count: "exact", head: true })
    .eq("type_id", typeId)
    .eq("user_id", userId);
  if (classCountError) throw classCountError;
  if ((classCount ?? 0) > 0) {
    const n = classCount ?? 0;
    throw new Error(
      n === 1
        ? "Esta categoria ainda tem 1 subcategoria. Exclua ou mova essa subcategoria antes de apagar a categoria."
        : `Esta categoria ainda tem ${n} subcategorias. Exclua ou mova as subcategorias antes de apagar a categoria.`
    );
  }

  const { error } = await supabase
    .from("type")
    .delete()
    .eq("id", typeId)
    .eq("user_id", userId);
  if (error) {
    if (String(error.code) === "23503") {
      throw new Error(
        "Não é possível excluir esta categoria: ainda há subcategorias ou lançamentos ligados a ela. Remova esses vínculos primeiro."
      );
    }
    throw error;
  }
}

export async function deleteClassApi(classId: number): Promise<void> {
  const userId = await getCurrentUserId();

  const { count: txCount, error: txCountError } = await supabase
    .from("transaction")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("user_id", userId);
  if (txCountError) throw txCountError;
  if ((txCount ?? 0) > 0) {
    const n = txCount ?? 0;
    throw new Error(
      n === 1
        ? "Esta subcategoria está em 1 lançamento. Altere ou exclua esse lançamento antes."
        : `Esta subcategoria está em ${n} lançamentos. Altere ou exclua esses lançamentos antes.`
    );
  }

  const { count: recurringCount, error: recurringError } = await supabase
    .from("recurring_transaction")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("user_id", userId);
  if (recurringError) throw recurringError;
  if ((recurringCount ?? 0) > 0) {
    const n = recurringCount ?? 0;
    throw new Error(
      n === 1
        ? "Esta subcategoria está em 1 recorrência. Altere ou exclua essa recorrência antes."
        : `Esta subcategoria está em ${n} recorrências. Altere ou exclua essas recorrências antes.`
    );
  }

  const { count: budgetCount, error: budgetError } = await supabase
    .from("monthly_budget")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("user_id", userId);
  if (budgetError) throw budgetError;
  if ((budgetCount ?? 0) > 0) {
    throw new Error(
      "Esta subcategoria está em uso no orçamento. Remova ou altere esses orçamentos antes."
    );
  }

  const { error } = await supabase
    .from("class")
    .delete()
    .eq("id", classId)
    .eq("user_id", userId);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "Não é possível excluir: ainda há registros vinculados a esta subcategoria."
      );
    }
    throw error;
  }
}

export async function updateClassApi(
  updateData: ClassUpdateRequest
): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...updateFields } = updateData;
  const { error } = await supabase
    .from("class")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}
