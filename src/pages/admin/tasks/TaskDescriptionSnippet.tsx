import { useNavigate } from "react-router-dom";
import { stripMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import {
  normalizeWikiTitle,
  wikiLinkPlainSegments,
} from "@/domain/notes/wikiLinks";
import { useNotesTitleIndex } from "@/hooks/useNotesTitleIndex";

/**
 * Prévia curta da descrição da tarefa: markdown vira texto, mas `[[Título]]` vira link para a nota.
 * Sem isso o card mostrava `[[Atividades Finatec]]` cinza e o clique abria o formulário da tarefa.
 */
export function TaskDescriptionSnippet({
  description,
  className,
}: {
  description: string;
  className?: string;
}) {
  const index = useNotesTitleIndex();
  const navigate = useNavigate();
  const plain = stripMarkdown(description);
  if (!plain) return null;

  return (
    <p className={cn("line-clamp-2 text-xs text-muted-foreground", className)}>
      {wikiLinkPlainSegments(plain).map((segment, i) => {
        if (segment.type === "text") {
          return <span key={i}>{segment.value}</span>;
        }
        const id = index.get(normalizeWikiTitle(segment.title));
        if (!id) {
          return <span key={i}>{`[[${segment.title}]]`}</span>;
        }
        return (
          <a
            key={i}
            href={`/notes/${id}`}
            className="text-primary underline underline-offset-2"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              navigate(`/notes/${id}`);
            }}
          >
            {segment.title}
          </a>
        );
      })}
    </p>
  );
}
