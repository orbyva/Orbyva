import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FilePlus2 } from "lucide-react";
import { defaultUrlTransform } from "react-markdown";
import type { Components } from "react-markdown";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import {
  WIKI_LINK_MISSING_SCHEME,
  indexNotesByTitle,
  normalizeWikiTitle,
  parseMissingWikiLinkHref,
  replaceWikiLinks,
} from "@/domain/notes/wikiLinks";
import type { Note } from "@/types/notes";

/**
 * Preview do Markdown de uma nota **com wiki-link resolvido** (feature 056).
 *
 * `[[Título]]` que casa com uma nota vira link para `/notes/<id>`; o que não casa vira um chip
 * "criar nota" — o comportamento do Obsidian para link quebrado, e a consequência assumida de
 * resolver por título em vez de por id (ver Decisões da 056).
 *
 * A conversão acontece no texto do markdown (`replaceWikiLinks`), não em HTML: o preview continua
 * sem `rehype-raw`, e o `urlTransform` só abre exceção para o esquema sintético dos links
 * quebrados — todo o resto continua passando pelo saneamento padrão do `react-markdown`, que é o
 * que barra `javascript:` num link escrito pelo usuário.
 */
export function NoteMarkdownPreview({
  content,
  notes,
  onCreateNote,
  className,
}: {
  content: string;
  /** Notas do usuário — a fonte para resolver título → id. */
  notes: readonly Note[];
  /** Chamado pelo chip de link quebrado, com o título que falta. */
  onCreateNote?: (title: string) => void;
  className?: string;
}) {
  const resolved = useMemo(() => {
    const index = indexNotesByTitle(notes);
    return replaceWikiLinks(content, (title) => {
      const id = index.get(normalizeWikiTitle(title));
      return id ? `/notes/${id}` : null;
    });
  }, [content, notes]);

  const components = useMemo<Components>(
    () => ({
      /**
       * Este override vê **todos** os links do markdown, não só os wiki-links — inclusive os que a
       * própria nota gera: marcador de footnote, `↩` de volta e âncora de seção (feature 069). Por
       * isso ele repassa o resto das props (`node` fora, que é do hast): sem isso o
       * `data-footnote-ref` e a classe `data-footnote-backref` se perdem, e com eles o estilo e a
       * navegação da footnote dentro de uma nota.
       */
      a({ href, children, ...rest }) {
        // `node` é o nó do hast, não atributo de DOM — repassá-lo vira warning do React.
        delete rest.node;
        const missingTitle = href ? parseMissingWikiLinkHref(href) : null;

        if (missingTitle !== null) {
          return (
            <button
              type="button"
              onClick={() => onCreateNote?.(missingTitle)}
              disabled={!onCreateNote}
              aria-label={`Criar nota ${missingTitle}`}
              className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/50 px-1.5 py-0.5 align-baseline text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-70"
            >
              <FilePlus2 className="h-3 w-3" aria-hidden="true" />
              {children}
            </button>
          );
        }

        // Rota interna (o wiki-link resolvido, `/notes/<id>`) navega sem recarregar o app.
        if (href?.startsWith("/")) {
          return (
            <Link to={href} {...rest}>
              {children}
            </Link>
          );
        }

        /**
         * Fragmento: é navegação **dentro da própria nota** (footnote, âncora de seção). Sem este
         * ramo ele cairia no de link externo e abriria outra aba para rolar a mesma página.
         */
        if (href?.startsWith("#")) {
          return (
            <a href={href} {...rest}>
              {children}
            </a>
          );
        }

        return (
          <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
            {children}
          </a>
        );
      },
    }),
    [onCreateNote]
  );

  return (
    <MarkdownPreview
      content={resolved}
      className={className}
      components={components}
      urlTransform={(url) =>
        url.startsWith(WIKI_LINK_MISSING_SCHEME) ? url : defaultUrlTransform(url)
      }
    />
  );
}
