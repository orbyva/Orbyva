/** Fatia de @/api/finance — Fase G. */
import {
  Class, ClassCreateRequest,
  ClassUpdateRequest,
  Nature,
  Type,
  TypeCreateRequest,
  TypeUpdateRequest,
} from "@/types/finance";
import type { Dimension } from "@/types/dimensions";
import { toAppError } from "@/lib/errors";
import { asOne, getCurrentUserId, supabase } from "./_shared";

export async function fetchNatures(): Promise<Nature[]> {
  const { data, error } = await supabase
    .from("nature")
    .select("id, name");
  if (error) throw new Error(error.message);
  return data || [];
}

// Type

export async function fetchTypes(): Promise<Type[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("type")
    .select(`
      *,
      nature:nature_id(id, name)
    `)
    .eq("user_id", userId)
    .order("order", { ascending: true });

  if (error) throw new Error(error.message);

  return data || [];
}

export async function createTypeApi(newType: TypeCreateRequest): Promise<void> {
  const userId = await getCurrentUserId();

  if (!newType.order) {
    const { data, error: fetchError } = await supabase
      .from("type")
      .select("order")
      .eq("user_id", userId)
      .order("order", { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    const lastOrder = data && data.length > 0 ? data[0].order : 0;
    newType.order = lastOrder + 1;
  }

  const { error } = await supabase
    .from("type")
    .insert([{ ...newType, user_id: userId }]);

  if (error) throw error;
}

export async function updateTypeApi(updateData: TypeUpdateRequest): Promise<void> {
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
  if (classCountError) throw toAppError(classCountError);
  if ((classCount ?? 0) > 0) {
    throw new Error(
      "Este tipo tem classes vinculadas. Remova ou reassocie as classes antes de excluir o tipo."
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
        "Não é possível excluir: ainda há classes ou lançamentos vinculados a este tipo."
      );
    }
    throw toAppError(error);
  }
}

// Class

export async function fetchClasses(): Promise<Class[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("class")
    .select(`
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
    `)
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const typeRow = asOne(
      row.type as
        | {
            id: number;
            name: string;
            hex_color: string | null;
            lucide_icon: string | null;
            nature: Nature | Nature[] | null;
          }
        | {
            id: number;
            name: string;
            hex_color: string | null;
            lucide_icon: string | null;
            nature: Nature | Nature[] | null;
          }[]
        | null
    );
    const nature = typeRow ? asOne(typeRow.nature) : null;

    return {
      id: row.id,
      name: row.name,
      type_id: row.type_id,
      user_id: row.user_id,
      type: typeRow
        ? {
            id: typeRow.id,
            name: typeRow.name,
            hex_color: typeRow.hex_color,
            lucide_icon: typeRow.lucide_icon,
            nature: nature ?? { id: 0, name: "" },
          }
        : null,
    } satisfies Class;
  });
}

export async function createClassApi(newClass: ClassCreateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("class")
    .insert([{ ...newClass, user_id: userId }]);

  if (error) throw error;
}

export async function updateClassApi(updateData: ClassUpdateRequest): Promise<void> {
  const userId = await getCurrentUserId();
  const { id, ...updateFields } = updateData;

  const { error } = await supabase
    .from("class")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
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
    throw new Error(
      "Esta classe está em uso em transações. Altere ou exclua essas transações antes."
    );
  }

  const { count: recurringCount, error: recurringError } = await supabase
    .from("recurring_transaction")
    .select("id", { count: "exact", head: true })
    .eq("class_id", classId)
    .eq("user_id", userId);
  if (recurringError) throw recurringError;
  if ((recurringCount ?? 0) > 0) {
    throw new Error(
      "Esta classe está em uso em recorrentes/parcelas. Altere ou exclua esses lançamentos antes."
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
      "Esta classe está em uso no orçamento. Remova ou altere esses orçamentos antes."
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
        "Não é possível excluir: ainda há registros vinculados a esta classe."
      );
    }
    throw error;
  }
}

// Nature

export async function deleteNatureApi(natureId: number): Promise<void> {
  const { error } = await supabase
    .from("nature")
    .delete()
    .match({ id: natureId });
  if (error) throw error;
}



export async function fetchDimensions(): Promise<Dimension[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("nature")
    .select(`
      id,
      name,
      types: type!nature_id (
        id,
        name,
        user_id,
        classes: class!type_id (
          id,
          name,
          user_id
        )
      )
    `);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((nature) => ({
    id: nature.id,
    name: nature.name,
    types: ((nature.types as Array<{
      id: number;
      name: string;
      user_id?: string | null;
      classes?: Array<{ id: number; name: string; user_id?: string | null }>;
    }> | null) ?? [])
      .filter((t) => t.user_id === userId)
      .map((t) => ({
        id: t.id,
        name: t.name,
        classes: (t.classes ?? []).filter((c) => c.user_id === userId),
      })),
  }));
}


