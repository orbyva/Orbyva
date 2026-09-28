import { Children, useMemo } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilePlus2 } from "lucide-react";
import { defaultUrlTransform } from "react-markdown";
import type { Components } from "react-markdown";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { TaskRefChip } from "@/components/tasks/TaskRefChip";
import {
  WIKI_LINK_MISSING_SCHEME,
  indexNotesByTitle,
  normalizeWikiTitle,
  parseMissingWikiLinkHref,
  replaceWikiLinks,
} from "@/domain/notes/wikiLinks";
import { TASK_REF_SCHEME, parseTaskRefHref, taskRefIds } from "@/domain/tasks/taskRefs";
import { lookupTaskRef, useTaskRefIndex } from "@/hooks/useTaskRefIndex";
import type { Note } from "@/types/notes";

/**
 * O texto de dentro de um `<a>` do `react-markdown` — o rótulo como foi escrito no markdown. Só
 * serve de fallback quando a tarefa referenciada não existe mais; havendo tarefa, o chip mostra o
 * título atual dela.
 */
function linkText(children: ReactNode): string {
  return Children.toArray(children)
    .filter((child): child is string | number => typeof child === "string" || typeof child === "number")
    .join("");
}

/**
 * Preview do Markdown de uma nota **com wiki-link resolvido** (feature 056).
 *
 * `[[Título]]` que casa com uma nota vira link para `/notes/<id>`; o que não casa vira um chip
 * "criar nota" — o comportamento do Obsidian para link quebrado, e a consequência assumida de
 * resolver por título em vez de por id (ver Decisões da 056).
 *
 * A conversão acontece no texto do markdown (`replaceWikiLinks`), não em HTML: o preview continua
 * sem `rehype-raw`, e o `urlTransform` só abre exceção para os dois esquemas internos (o sintético
 * dos links quebrados e o `orbyva-task:` das referências de tarefa) — todo o resto continua
 * passando pelo saneamento padrão do `react-markdown`, que é o que barra `javascript:` num link
 * escrito pelo usuário.
 *
 * **Referência de tarefa (feature 105)**: `[Rótulo](orbyva-task:<id>)` vira `TaskRefChip` com o
 * estado atual da tarefa. Diferente do `[[…]]`, ela **não** precisa de reescrita prévia do texto —
 * já é link markdown válido, então chega pronta no componente `a` daqui. O que ela precisa é da
 * exceção no `urlTransform`: sem ela o `defaultUrlTransform` poda o esquema desconhecido, o `href`
 * chega vazio e o chip nunca renderiza — sem erro nenhum no console.
 */
export function NoteMarkdownPreview({
  content,
  notes,
  onCreateNote,
  onToggleTaskItem,
  onToggleTask,
  className,
}: {
  content: string;
  /** Notas do usuário — a fonte para resolver título → id. */
  notes: readonly Note[];
  /** Chamado pelo chip de link quebrado, com o título que falta. */
  onCreateNote?: (title: string) => void;
  /**
   * Torna a checklist clicável. É repassado direto ao `MarkdownPreview`: só a nota
   * passa esse handler, porque só ela tem um Markdown que o preview pode reescrever.
   * `onToggleTask` é o mesmo contrato sob o nome da feature 070.
   */
  onToggleTaskItem?: (index: number) => void;
  onToggleTask?: (index: number) => void;
  className?: string;
}) {
  const navigate = useNavigate();
  /** Os ids citados resolvem **em lote**: uma consulta por chip na tela seria o defeito. */
  const refIds = useMemo(() => taskRefIds(content), [content]);
  const taskRefs = useTaskRefIndex(refIds);
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
       * própria nota gera: marcador de footnote, `↩` de volta e âncora de seção. Por
       * isso ele repassa o resto das props (`node` fora, que é do hast): sem isso o
       * `data-footnote-ref` e a classe `data-footnote-backref` se perdem, e com eles o estilo e a
       * navegação da footnote dentro de uma nota.
       */
      a({ href, children, ...rest }) {
        // `node` é o nó do hast, não atributo de DOM — repassá-lo vira warning do React.
        delete rest.node;

        // Referência de tarefa (105) antes de tudo: é a única cujo href não é uma rota nem um
        // esquema sintético de wiki-link, e ela vira chip em vez de link.
        const taskId = href ? parseTaskRefHref(href) : null;
        if (taskId) {
          return (
            <TaskRefChip
              id={taskId}
              label={linkText(children)}
              task={lookupTaskRef(taskRefs, taskId)}
            />
          );
        }

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

        // Rota interna (wiki-link resolvido). `navigate` em vez de só `<Link>`: o preview da
        // descrição da tarefa vive dentro de um Dialog do Radix, e o clique no `<Link>` era
        // engolido pelo trap de foco — a URL não mudava. Cmd/Ctrl+clique segue o href nativo.
        if (href?.startsWith("/")) {
          return (
            <Link
              to={href}
              {...rest}
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
    [onCreateNote, navigate, taskRefs]
  );

  return (
    <MarkdownPreview
      content={resolved}
      className={className}
      components={components}
      onToggleTaskItem={onToggleTaskItem}
      onToggleTask={onToggleTask}
      // Os dois esquemas internos passam inteiros; o resto segue no saneamento padrão. Tirar
      // `orbyva-task:` daqui não quebra nada visivelmente — só faz o chip sumir em silêncio, que é
      // a falha mais provável (e mais muda) desta feature.
      urlTransform={(url) =>
        url.startsWith(WIKI_LINK_MISSING_SCHEME) || url.startsWith(TASK_REF_SCHEME)
          ? url
          : defaultUrlTransform(url)
      }
    />
  );
}
