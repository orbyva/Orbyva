import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import { normalizeWikiTitle } from "@/domain/notes/wikiLinks";

/** Teto de sugestões — lista longa em popup é ruído, não ajuda. */
export const WIKI_LINK_COMPLETION_LIMIT = 20;

/** `[[` seguido do que já foi digitado, sem fechar o colchete e sem sair da linha. */
const WIKI_LINK_PREFIX_RE = /\[\[[^\]\n]*$/;

/**
 * Autocomplete de `[[` com os títulos das notas do usuário (feature 056).
 *
 * `titles` é uma função, não uma lista: o editor é montado uma vez e a lista de notas muda embaixo
 * dele (nota criada por um link quebrado, por exemplo). Chamando na hora da sugestão, o popup
 * sempre vê o estado atual sem remontar o CodeMirror.
 *
 * O filtro compara pelo título normalizado (`normalizeWikiTitle`) — a mesma chave que resolve o
 * link depois, então o que o popup oferece é exatamente o que vai resolver.
 */
export function wikiLinkCompletionSource(
  titles: () => readonly string[]
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(WIKI_LINK_PREFIX_RE);
    if (!before) return null;

    const query = normalizeWikiTitle(before.text.slice(2));
    const options: Completion[] = [];
    for (const title of titles()) {
      if (!title.trim()) continue;
      if (query && !normalizeWikiTitle(title).includes(query)) continue;
      options.push({
        label: title,
        type: "text",
        // Fecha o colchete junto: quem escolheu no popup não deveria ter que digitar `]]` na mão.
        // O `[[` já está no documento — a substituição começa depois dele (ver `from`).
        apply: `${title}]]`,
      });
      if (options.length >= WIKI_LINK_COMPLETION_LIMIT) break;
    }

    if (options.length === 0) return null;
    return {
      // Depois do `[[`, e não no `[[`: é este trecho que o CodeMirror casa contra o `label` para
      // filtrar e destacar. Apontando para o `[[`, o texto comparado seria "[[mate" e nenhum
      // título casaria — o popup abria vazio (bug real, pego pelo teste de ponta a ponta).
      from: before.from + 2,
      options,
      // Enquanto o texto depois do `[[` não fechar nem trocar de linha, o CodeMirror refiltra a
      // lista sozinho em vez de chamar esta função a cada tecla.
      validFor: /^[^\]\n]*$/,
    };
  };
}

/** A extensão pronta para o `MarkdownCodeEditor`, pendurada na linguagem markdown. */
export function wikiLinkAutocomplete(titles: () => readonly string[]): Extension {
  return markdownSupport.language.data.of({
    autocomplete: wikiLinkCompletionSource(titles),
  });
}
