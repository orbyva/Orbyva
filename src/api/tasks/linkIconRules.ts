import { supabase } from "@/lib/supabase";
import { getCurrentUserId } from "@/lib/auth-user";
import { validateLinkIconPattern } from "@/domain/tasks/linkIconRules";
import type { LinkIconRule, LinkIconRuleDraft } from "@/types/tasks";

/**
 * I/O das regras de aparência de link externo (feature 087) — `public.link_icon_rule`.
 *
 * Toda função filtra por `user_id` explicitamente, mesmo com RLS ligada: a RLS é a última linha de
 * defesa, não a primeira, e o filtro é o que faz a consulta usar o índice
 * `link_icon_rule_user_position_idx`, que começa por `user_id`.
 */

/** As regras do usuário na **ordem de avaliação** — `position` crescente, que é onde a precedência
 * mora (a primeira que casa vence). Ordenar aqui, e não em quem consome, evita que a lista de
 * tarefas e a tela de configuração discordem sobre quem vence. */
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

/**
 * Grava uma regra nova.
 *
 * A `pattern` é validada **aqui** e não só no formulário: ela é entrada do usuário que vira código
 * executável (`new RegExp`), e o botão de regras padrão também passa por este caminho. O banco tem
 * a mesma trava (`link_icon_rule_pattern_check`), mas o erro dele chega como texto de constraint —
 * este chega dizendo o que corrigir.
 */
export async function createLinkIconRule(draft: LinkIconRuleDraft): Promise<LinkIconRule> {
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

/** Atualiza uma regra existente. Aceita mudança parcial (o interruptor de `enabled` manda só ele),
 * e revalida a `pattern` quando ela é uma das coisas que mudaram. */
export async function updateLinkIconRule(
  id: string,
  patch: Partial<LinkIconRuleDraft>
): Promise<void> {
  const userId = await getCurrentUserId();
  const fields: Partial<LinkIconRuleDraft> = { ...patch };
  if (fields.name !== undefined) fields.name = fields.name.trim();
  if (fields.pattern !== undefined) {
    fields.pattern = fields.pattern.trim();
    assertPattern(fields.pattern);
  }
  const { error } = await supabase
    .from("link_icon_rule")
    .update(fields)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Exclui a regra. Nada mais é tocado: os links das tarefas continuam existindo, só voltam a cair
 * no fallback de host (`describeExternalLink`) — a aparência muda, o dado não. */
export async function deleteLinkIconRule(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase
    .from("link_icon_rule")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Reescreve as `position` na ordem em que os ids chegam (0..n-1) — é o que as setas ↑/↓ da tela
 * fazem, e é a única forma de mudar a precedência entre regras.
 *
 * Reescreve a lista **inteira**, e não só as duas linhas que trocaram, porque `position` pode ter
 * buracos ou empates vindos de exclusões anteriores; renumerar do zero é o que garante que a ordem
 * mostrada e a ordem avaliada sejam a mesma. Sequencial e não em paralelo: são poucas linhas, e um
 * `Promise.all` que falha no meio deixaria a ordem pela metade sem dizer onde parou.
 */
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
    // Mutuamente exclusivos, como em `task`: com um ícone da biblioteca escolhido, o preset não
    // vai junto para o banco.
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
