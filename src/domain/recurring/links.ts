/**
 * Link único e opcional de uma recorrência (feature 206) — "onde se paga isso".
 *
 * Puro e sem React de propósito: é o que o Vitest testa direto e o que o `RecurringFormDialog`
 * chama no submit. A frase de erro mora aqui, ao lado da regra, e **não** é importada de
 * `src/pages/admin/tasks/TaskExternalLinksField.tsx` — aquele módulo arrasta
 * `resolveLinkAppearance`, `useLinkIconRules` e `TaskIconBadge` (regras de ícone da 087) para
 * Finanças por causa de uma string.
 */

/** Mesma frase do campo de link das tarefas: afirmativa, dizendo o que fazer. */
export const RECURRING_LINK_HINT = "Comece com https://";

/**
 * Valor que vai para o banco: `trim`, e `null` quando não sobrou nada.
 *
 * `""`, `"   "`, `null` e `undefined` viram todos `null` — é o que faz "apagou o link" chegar ao
 * payload de `updateRecurringApi` como `null` em vez de string vazia, e o que evita linha legada
 * com espaços virando ícone quebrado na lista.
 */
export function normalizeRecurringLink(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * `true` só para `http://` e `https://`. O projeto valida o protocolo com mensagem em vez de
 * corrigir a URL do usuário: sem auto-prefixo, sem máscara, sem `type="url"`.
 */
export function isHttpLink(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  return value.startsWith("http://") || value.startsWith("https://");
}
