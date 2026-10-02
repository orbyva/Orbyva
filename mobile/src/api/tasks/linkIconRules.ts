import {
  DEFAULT_LINK_ICON_RULES,
  validateLinkIconPattern,
} from "@/domain/tasks/linkIconRules";
import { getCurrentUserId } from "@/lib/auth-user";
import { supabase } from "@/lib/supabase";
import type { LinkIconRule, LinkIconRuleDraft } from "@/types/tasks";

/** Regras do usuário na ordem de avaliação (`position` crescente). */
export async function fetchLinkIconRules(): Promise<LinkIconRule[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("link_icon_rule")
    .select("*")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LinkIconRule[];
}

export async function createLinkIconRule(
  draft: LinkIconRuleDraft
): Promise<LinkIconRule> {
  const userId = await getCurrentUserId();
  const row = normalizeDraft(draft);
  const { data, error } = await supabase
    .from("link_icon_rule")
    .insert([{ ...row, user_id: userId }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as LinkIconRule;
}

export async function updateLinkIconRule(
  id: string,
  patch: Partial<LinkIconRuleDraft>
): Promise<void> {
  const userId = await getCurrentUserId();
  const fields: Partial<LinkIconRuleDraft> = { ...patch };
  if (fields.name !== undefined) {
    fields.name = fields.name.trim();
    if (!fields.name) throw new Error("A regra precisa de um nome.");
  }
  if (fields.pattern !== undefined) {
    fields.pattern = fields.pattern.trim();
    assertPattern(fields.pattern);
  }
  if (fields.label_template !== undefined) {
    fields.label_template = fields.label_template?.trim() || null;
  }
  const { error } = await supabase
    .from("link_icon_rule")
    .update(fields)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteLinkIconRule(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("link_icon_rule")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Renumera `position` 0..n-1 na ordem dos ids, em sequência (falha no meio para ali e avisa). */
export async function reorderLinkIconRules(ids: readonly string[]): Promise<void> {
  const userId = await getCurrentUserId();
  for (const [position, id] of ids.entries()) {
    const { error } = await supabase
      .from("link_icon_rule")
      .update({ position })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  }
}

/** "Criar regras padrão": insere as sementes depois das regras que já existem. */
export async function createDefaultLinkIconRules(
  startPosition = 0
): Promise<LinkIconRule[]> {
  const created: LinkIconRule[] = [];
  for (const [index, seed] of DEFAULT_LINK_ICON_RULES.entries()) {
    created.push(
      await createLinkIconRule({
        name: seed.name,
        pattern: seed.pattern,
        label_template: seed.label_template,
        icon_key: seed.icon_key,
        icon_url: null,
        position: startPosition + index,
        enabled: true,
      })
    );
  }
  return created;
}

function normalizeDraft(draft: LinkIconRuleDraft): LinkIconRuleDraft {
  const name = draft.name.trim();
  const pattern = draft.pattern.trim();
  if (!name) throw new Error("A regra precisa de um nome.");
  assertPattern(pattern);
  const labelTemplate = draft.label_template?.trim();
  return {
    name,
    pattern,
    label_template: labelTemplate ? labelTemplate : null,
    icon_key: draft.icon_url ? null : (draft.icon_key ?? null),
    icon_url: draft.icon_url ?? null,
    position: draft.position,
    enabled: draft.enabled,
  };
}

function assertPattern(pattern: string): void {
  const problem = validateLinkIconPattern(pattern);
  if (problem) throw new Error(problem);
}
