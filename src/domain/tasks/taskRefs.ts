/**
 * Referência a uma **tarefa** escrita dentro do Markdown: `[Rótulo](orbyva-task:<id>)`.
 *
 * É a única instância da fábrica de `domain/refs/entityRefs.ts` exposta hoje (feature 103). A
 * fábrica é genérica por dentro — `PROJECT`, `NOTE` e `GOAL` cabem depois —, mas ela **não** é
 * reexportada daqui: quem quiser outro tipo cria o módulo do seu domínio, em vez de chamar a
 * fábrica solta e acabar com dois parsers de tarefa discordando.
 *
 * Não confundir com o que já existe e não é isto: `note_link` (feature 056) é vínculo explícito
 * feito fora do texto, e a checklist do Markdown (`- [ ] fazer x`, `domain/notes/taskList.ts`) é
 * marcação solta no corpo da nota, que não é linha de `public.task` nenhuma. Esta aqui é texto que
 * aponta para uma tarefa de verdade, por id.
 *
 * Módulo puro, sem I/O e sem dependência do domínio de notas — a referência resolve por id, e o
 * backlink é derivado do texto, sem tabela nova.
 */

import {
  createEntityRefParser,
  type EntityRefMatch,
  type EntityRefPlainSegment,
} from "@/domain/refs/entityRefs";

/** Uma ocorrência de `[Rótulo](orbyva-task:<id>)`. Espelha `WikiLinkMatch` das notas. */
export type TaskRefMatch = EntityRefMatch;

/** Pedaço de texto plano: prosa ou uma referência de tarefa já separada. */
export type TaskRefPlainSegment = EntityRefPlainSegment;

const parser = createEntityRefParser("task");

/** `orbyva-task:` — o esquema gravado no href da marca. */
export const TASK_REF_SCHEME = parser.scheme;

/** Href da marca para o id de uma tarefa. */
export function taskRefHref(id: string): string {
  return parser.href(id);
}

/** Id da tarefa de volta a partir do href; `null` quando o href é um link comum. */
export function parseTaskRefHref(href: string): string | null {
  return parser.parseHref(href);
}

/**
 * Todas as referências de tarefa do conteúdo, na ordem em que aparecem — várias por linha
 * inclusive. Ocorrência dentro de código (bloco cercado ou inline) fica de fora.
 */
export function parseTaskRefs(content: string): TaskRefMatch[] {
  return parser.parse(content);
}

/** A referência sob o índice `pos` (o offset do cursor), se houver. */
export function taskRefAt(content: string, pos: number): TaskRefMatch | null {
  return parser.at(content, pos);
}

/**
 * Parte um texto (já sem markdown) em prosa + referências de tarefa. É o que deixa a marca
 * clicável num card de 2 linhas, sem renderizar o Markdown inteiro.
 */
export function taskRefPlainSegments(plain: string): TaskRefPlainSegment[] {
  return parser.plainSegments(plain);
}

/**
 * Ids de tarefa referenciados, sem repetição e preservando a ordem de aparição — é o que permite
 * resolver as tarefas de uma vez só, em vez de uma consulta por ocorrência.
 */
export function taskRefIds(content: string): string[] {
  return parser.ids(content);
}

/** O conteúdo referencia essa tarefa? É o teste do backlink ("quem aponta para cá"). */
export function mentionsTaskId(content: string, id: string): boolean {
  return parser.mentions(content, id);
}
