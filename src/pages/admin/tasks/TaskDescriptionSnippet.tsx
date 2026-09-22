import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { stripMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import {
  normalizeWikiTitle,
  wikiLinkPlainSegments,
} from "@/domain/notes/wikiLinks";
import { taskRefIds, taskRefPlainSegments } from "@/domain/tasks/taskRefs";
import { useNotesTitleIndex } from "@/hooks/useNotesTitleIndex";
import { lookupTaskRef, useTaskRefIndex } from "@/hooks/useTaskRefIndex";
import { TaskRefChip } from "@/components/tasks/TaskRefChip";

/**
 * Prévia curta da descrição da tarefa: markdown vira texto, mas `[[Título]]` vira link para a nota
 * e `[Rótulo](orbyva-task:<id>)` vira o chip da tarefa referenciada (feature 105).
 * Sem isso o card mostrava `[[Atividades Finatec]]` cinza e o clique abria o formulário da tarefa.
 *
 * ## A ordem aqui não é arbitrária
 *
 * A referência de tarefa é segmentada **antes** do `stripMarkdown`, e é o bug que esta prévia
 * existe para evitar: `stripMarkdown` tem um `.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")` que engole
 * o link e deixa só o rótulo — rodando primeiro, o id vai embora para sempre e uma descrição que
 * fosse **só** a marca viraria a palavra do rótulo, sem chip nenhum.
 *
 * O `[[…]]` continua depois do strip, aninhado nos pedaços de prosa já limpos: ele sobrevive ao
 * strip (não é link markdown), e mexer nisso seria mexer no que já funciona.
 */

/**
 * `stripMarkdown` aplicado a um pedaço de prosa, preservando se havia espaço nas bordas.
 *
 * O strip termina com `.trim()`, e sem esta preservação "**Contexto** e " + chip sairia colado
 * ("Contexto e[chip]") toda vez que a marca estivesse no meio da frase.
 */
function stripSegment(raw: string): string {
  const stripped = stripMarkdown(raw);
  if (!stripped) return "";
  const lead = /^\s/.test(raw) ? " " : "";
  const trail = /\s$/.test(raw) ? " " : "";
  return `${lead}${stripped}${trail}`;
}

export function TaskDescriptionSnippet({
  description,
  className,
}: {
  description: string;
  className?: string;
}) {
  const index = useNotesTitleIndex();
  const navigate = useNavigate();
  const refIds = useMemo(() => taskRefIds(description), [description]);
  const taskRefs = useTaskRefIndex(refIds);

  const segments = useMemo(
    () =>
      taskRefPlainSegments(description)
        .map((segment) =>
          segment.type === "ref" ? segment : { ...segment, value: stripSegment(segment.value) }
        )
        .filter((segment) => segment.type === "ref" || segment.value !== ""),
    [description]
  );

  if (segments.length === 0) return null;

  return (
    <p className={cn("line-clamp-2 text-xs text-muted-foreground", className)}>
      {segments.map((segment, i) => {
        if (segment.type === "ref") {
          return (
            // `compact`: aqui o espaço é de duas linhas, e o prazo empurraria o texto para fora.
            <TaskRefChip
              key={`ref-${i}`}
              id={segment.id}
              label={segment.label}
              task={lookupTaskRef(taskRefs, segment.id)}
              compact
            />
          );
        }
        return (
          <span key={`text-${i}`}>
            {wikiLinkPlainSegments(segment.value).map((inner, j) => {
              if (inner.type === "text") {
                return <span key={j}>{inner.value}</span>;
              }
              const id = index.get(normalizeWikiTitle(inner.title));
              if (!id) {
                return <span key={j}>{`[[${inner.title}]]`}</span>;
              }
              return (
                <a
                  key={j}
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
                  {inner.title}
                </a>
              );
            })}
          </span>
        );
      })}
    </p>
  );
}
