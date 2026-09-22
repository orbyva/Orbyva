/**
 * Referência a uma entidade do Orbyva escrita dentro do Markdown: `[Rótulo](orbyva-<tipo>:<id>)`.
 *
 * É link markdown comum com esquema próprio — mesma família do `orbyva-wikilink-missing:` que as
 * notas já usam (`domain/notes/wikiLinks.ts`). Três consequências, e são o motivo do formato:
 * resolve por **id**, então renomear a entidade não quebra a referência; não encosta no
 * `WIKI_LINK_RE` (`[[…]]`), então os dois parsers convivem no mesmo texto; e qualquer renderizador
 * de Markdown já sabe o que fazer com ela, inclusive num export do conteúdo cru.
 *
 * O módulo é a **fábrica**, parametrizada pelo tipo de entidade. Quem expõe cada instância é o
 * domínio dono dela (`domain/tasks/taskRefs.ts` para `task`); `PROJECT`, `NOTE` e `GOAL` entram
 * depois sem reabrir o parser. Módulo puro, sem I/O e sem dependência de domínio nenhum.
 */

import { codeRanges } from "@/lib/markdownCode";

/** Uma ocorrência de `[Rótulo](orbyva-<tipo>:<id>)`. `start`/`end` são índices no conteúdo (`end` exclusivo). */
export interface EntityRefMatch {
  /** Id da entidade referenciada, como escrito no texto. */
  id: string;
  /** Texto entre colchetes. Pode ser `""` — quem renderiza decide o fallback. */
  label: string;
  start: number;
  end: number;
}

/** Pedaço de texto plano: prosa ou uma referência já separada. */
export type EntityRefPlainSegment =
  | { type: "text"; value: string }
  | { type: "ref"; id: string; label: string };

export interface EntityRefParser {
  /** `orbyva-<tipo>:` — o prefixo do href. */
  readonly scheme: string;
  /** Href da marca para um id. */
  href(id: string): string;
  /** Id de volta a partir do href; `null` quando o href é outra coisa. */
  parseHref(href: string): string | null;
  /** Todas as referências do conteúdo, na ordem em que aparecem. */
  parse(content: string): EntityRefMatch[];
  /** A referência que cobre o índice `pos`, se houver. */
  at(content: string, pos: number): EntityRefMatch | null;
  /** Parte um texto em prosa + referências, preservando o que está entre elas. */
  plainSegments(plain: string): EntityRefPlainSegment[];
  /** Ids referenciados, sem repetição e na ordem de aparição. */
  ids(content: string): string[];
  /** O conteúdo referencia esse id? É o teste do backlink ("quem aponta para cá"). */
  mentions(content: string, id: string): boolean;
}

/**
 * Formato do id aceito no texto: uuid 8-4-4-4-12 em hexadecimal. Exigir o formato é o que mantém
 * link markdown comum (`[docs](https://exemplo.com)`) e esquema desconhecido fora do parser — sem
 * isso, a UI transformaria link externo em chip de entidade.
 *
 * A checagem é de **forma**, não de versão/variante RFC 4122 (ao contrário de `looksLikeId` em
 * `lib/ids.ts`, que serve para esconder id de breadcrumb): um id que o banco aceite como `uuid` e
 * que não seja v4 continua sendo uma referência legítima, e recusá-lo quebraria a marca em silêncio.
 */
const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** Nome de tipo aceito na fábrica — minúsculas, dígitos e hífen. Barra o tipo virar regex. */
const ENTITY_NAME_RE = /^[a-z][a-z0-9-]*$/;

/**
 * Cria o parser da marca de uma entidade.
 *
 * O regex recusa `[` e `]` dentro do rótulo — mesma recusa do `WIKI_LINK_RE`, e é ela que mantém o
 * parser longe de link markdown aninhado (`[a[b]](…)` não casa). O rótulo **pode** ser vazio.
 */
export function createEntityRefParser(entity: string): EntityRefParser {
  if (!ENTITY_NAME_RE.test(entity)) {
    throw new Error(`Tipo de entidade inválido para referência: ${JSON.stringify(entity)}`);
  }

  const scheme = `orbyva-${entity}:`;
  const refRe = new RegExp(`\\[([^[\\]\\n]*)]\\(${scheme}(${UUID_PATTERN})\\)`, "g");
  const hrefRe = new RegExp(`^${scheme}(${UUID_PATTERN})$`);

  function href(id: string): string {
    return `${scheme}${id}`;
  }

  function parseHref(value: string): string | null {
    return hrefRe.exec(value)?.[1] ?? null;
  }

  /**
   * Ocorrência dentro de bloco cercado ou de código inline fica de fora: quem mostra a sintaxe
   * num exemplo não está linkando. Mesma regra, e mesma razão, do `parseWikiLinks`.
   */
  function parse(content: string): EntityRefMatch[] {
    if (!content.includes(scheme)) return [];
    const skip = codeRanges(content);
    const matches: EntityRefMatch[] = [];

    refRe.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = refRe.exec(content)) !== null) {
      const start = match.index;
      if (skip.some(([from, to]) => start >= from && start < to)) continue;
      matches.push({
        id: match[2],
        label: match[1],
        start,
        end: start + match[0].length,
      });
    }

    return matches;
  }

  function at(content: string, pos: number): EntityRefMatch | null {
    return parse(content).find((match) => pos >= match.start && pos < match.end) ?? null;
  }

  function plainSegments(plain: string): EntityRefPlainSegment[] {
    const matches = parse(plain);
    if (matches.length === 0) return plain ? [{ type: "text", value: plain }] : [];
    const segments: EntityRefPlainSegment[] = [];
    let cursor = 0;
    for (const match of matches) {
      if (match.start > cursor) {
        segments.push({ type: "text", value: plain.slice(cursor, match.start) });
      }
      segments.push({ type: "ref", id: match.id, label: match.label });
      cursor = match.end;
    }
    if (cursor < plain.length) {
      segments.push({ type: "text", value: plain.slice(cursor) });
    }
    return segments;
  }

  /**
   * A chave de comparação é o id em minúsculas — uuid é hexadecimal e a caixa não distingue duas
   * entidades —, mas o valor devolvido é a primeira grafia encontrada, como escrita no texto.
   */
  function ids(content: string): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const { id } of parse(content)) {
      const key = id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(id);
    }
    return result;
  }

  function mentions(content: string, id: string): boolean {
    const target = id.trim().toLowerCase();
    if (!target) return false;
    return parse(content).some((match) => match.id.toLowerCase() === target);
  }

  return { scheme, href, parseHref, parse, at, plainSegments, ids, mentions };
}
