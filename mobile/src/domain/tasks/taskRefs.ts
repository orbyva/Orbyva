import { codeRanges } from "@/lib/markdownCode";

/**
 * Marca de tarefa no Markdown: `[Rótulo](orbyva-task:<uuid>)`, a mesma da web
 * (`src/domain/tasks/taskRefs.ts`). Marca dentro de código (bloco ou inline) não conta.
 */
export const TASK_REF_SCHEME = "orbyva-task:";

const UUID_PATTERN =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const TASK_REF_RE = new RegExp(
  `\\[([^[\\]\\n]*)]\\(${TASK_REF_SCHEME}(${UUID_PATTERN})\\)`,
  "g"
);

export interface TaskRefMatch {
  id: string;
  label: string;
  start: number;
  end: number;
}

export function parseTaskRefs(content: string): TaskRefMatch[] {
  if (!content.includes(TASK_REF_SCHEME)) return [];
  const skip = codeRanges(content);
  const matches: TaskRefMatch[] = [];
  TASK_REF_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TASK_REF_RE.exec(content)) !== null) {
    const start = match.index;
    if (skip.some(([from, to]) => start >= from && start < to)) continue;
    matches.push({ id: match[2], label: match[1], start, end: start + match[0].length });
  }
  return matches;
}

export function mentionsTaskId(content: string, id: string): boolean {
  const target = id.trim().toLowerCase();
  if (!target) return false;
  return parseTaskRefs(content).some((match) => match.id.toLowerCase() === target);
}
