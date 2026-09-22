/**
 * Escapa os curingas do `LIKE`/`ILIKE` do Postgres num valor que vai **dentro** do padrão.
 *
 * `%`, `_` e `\` são metacaracteres: um título com `%` viraria "qualquer coisa" e traria a tabela
 * inteira. Mora em `src/lib` porque mais de um módulo de API monta prefiltro de texto
 * (`fetchNotesMentioning`, e as menções de tarefa da feature 106) — duas cópias de um escape
 * divergem na primeira correção, e escape é exatamente o tipo de função que não pode divergir.
 *
 * A ordem importa: a contrabarra é escapada **primeiro**, senão as que a própria função insere
 * seriam escapadas de novo.
 */
export function escapeLikeValue(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
