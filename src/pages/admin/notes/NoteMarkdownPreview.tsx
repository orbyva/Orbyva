import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
  onToggleTaskItem,
  className,
}: {
  content: string;
  /** Notas do usuário — a fonte para resolver título → id. */
  notes: readonly Note[];
  /** Chamado pelo chip de link quebrado, com o título que falta. */
  onCreateNote?: (title: string) => void;
  /**
   * Torna a checklist clicável (feature 067). É repassado direto ao `MarkdownPreview`: só a nota
   * passa esse handler, porque só ela tem um Markdown que o preview pode reescrever.
   */
  onToggleTaskItem?: (index: number) => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const resolved = useMemo(() => {
    const index = indexNotesByTitle(notes);
    return replaceWikiLinks(content, (title) => {
      const id = index.get(normalizeWikiTitle(title));
      return id ? `/notes/${id}` : null;
    });
  }, [content, notes]);

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        const missingTitle = href ? parseMissingWikiLinkHref(href) : null;

        if (missingTitle !== null) {
          return (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onCreateNote?.(missingTitle);
              }}
              disabled={!onCreateNote}
              aria-label={`Criar nota ${missingTitle}`}
              className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/50 px-1.5 py-0.5 align-baseline text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:pointer-events-none disabled:opacity-70"
            >
              <FilePlus2 className="h-3 w-3" aria-hidden="true" />
              {children}
            </button>
          );
        }

        // Rota interna (wiki-link resolvido). `navigate` em vez de `<Link>`: o preview da
        // descrição da tarefa vive dentro de um Dialog do Radix, e o clique no `<Link>` era
        // engolido pelo trap de foco — a URL não mudava. Cmd/Ctrl+clique segue o href nativo.
        if (href?.startsWith("/")) {
          return (
            <a
              href={href}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                navigate(href);
              }}
            >
              {children}
            </a>
          );
        }

        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      },
    }),
    [onCreateNote, navigate]
  );

  return (
    <MarkdownPreview
      content={resolved}
      className={className}
      components={components}
      onToggleTaskItem={onToggleTaskItem}
      urlTransform={(url) =>
        url.startsWith(WIKI_LINK_MISSING_SCHEME) ? url : defaultUrlTransform(url)
      }
    />
  );
}
