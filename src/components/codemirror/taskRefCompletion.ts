import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import {
  cancelPendingTaskRef,
  insertPendingTaskRef,
  resolvePendingTaskRef,
  taskRefPending,
} from "@/components/codemirror/taskRefPending";
import { foldForSearch } from "@/domain/notes/filters";
import { taskRefHref } from "@/domain/tasks/taskRefs";
import type { TaskStatus } from "@/types/tasks";

/**
 * # `TASK->` no editor (feature 104)
 *
 * Digitar `TASK->` abre o popup do `@codemirror/autocomplete` para **vincular uma tarefa que já
 * existe** (pelo título) ou **criar uma na hora**. O que fica gravado no texto é a marca da 103:
 * `[Rótulo](orbyva-task:<id>)`.
 *
 * **É o mesmo maquinário do `[[` (056) e do `/` (068)**, e não um popup próprio — mesma razão
 * registrada em `slashMenu.ts:20-24`: um portal próprio teria que posicionar sobre o cursor à mão
 * e refazer scroll, teclado e redimensionamento, tudo isso que a fonte de autocomplete já resolve.
 *
 * **O gatilho é estreito de propósito**: `TASK->` só abre o menu quando o que vem antes é espaço
 * ou início de linha. Mesma regra do `/` — gatilho que dispara no meio de uma palavra
 * (`fooTASK->`) atrapalha mais do que ajuda.
 */

/** A marca literal que abre o menu. Fica aqui para o regex e o recorte da consulta não divergirem. */
export const TASK_REF_TRIGGER = "TASK->";

/**
 * `TASK->` mais o que já foi digitado, sem sair da linha.
 *
 * Três detalhes que a forma carrega:
 *
 * - `(?:^|\s)` é o gatilho estreito — só início de linha ou espaço antes da marca. É ele que faz
 *   `fooTASK->` não abrir menu nenhum (espelha o cuidado de `SLASH_QUERY_RE`, `slashMenu.ts:32`,
 *   que o `slashMenuSource` resolve olhando o prefixo da linha).
 * - a consulta é `[^\n]*` e **não** `[^\s]*`: título de tarefa tem espaço ("painel de controle"),
 *   ao contrário do `[[` (`WIKI_LINK_PREFIX_RE`, `wikiLinkCompletion.ts:15`), que para no `]`.
 * - o `(?!TASK->)` dentro da repetição faz a **última** marca da linha vencer: `CompletionContext
 *   .matchBefore` usa `String.search`, que devolve a ocorrência mais à esquerda, e sem essa recusa
 *   um segundo `TASK->` na mesma linha seria lido como parte da consulta do primeiro.
 */
export const TASK_REF_QUERY_RE = /(?:^|\s)TASK->(?:(?!TASK->)[^\n])*$/;

/** Onde a marca começa dentro do trecho casado (0 ou 1, conforme haja espaço antes). */
export function taskRefTriggerOffset(matched: string): number {
  return matched.indexOf(TASK_REF_TRIGGER);
}

/** O que foi digitado depois da marca — a consulta que o popup filtra e que vira título. */
export function taskRefQuery(matched: string): string {
  const at = taskRefTriggerOffset(matched);
  if (at < 0) return "";
  return matched.slice(at + TASK_REF_TRIGGER.length);
}

/** Teto de tarefas sugeridas — lista longa em popup é ruído (mesmo teto do `[[`). */
export const TASK_REF_COMPLETION_LIMIT = 20;

/** Acima disso o rótulo é cortado no popup: título de tarefa pode ser uma frase inteira. */
export const TASK_REF_LABEL_MAX = 60;

/** O mínimo que o popup precisa saber de uma tarefa. `Task` satisfaz este formato. */
export interface TaskRefCandidate {
  id: string;
  title: string;
  status: TaskStatus;
}

/** O que a escolha de "Criar tarefa: X" dispara — a criação em si é assíncrona e mora fora daqui. */
export type TaskRefCreateHandler = (
  view: EditorView,
  title: string,
  from: number,
  to: number
) => void;

/**
 * Rótulo seguro para dentro de `[…]`.
 *
 * O parser da 103 recusa colchete e quebra de linha dentro do rótulo (`entityRefs.ts`), então um
 * título como `Revisar [urgente] contrato` produziria uma marca que **nenhum** consumidor
 * reconhece — referência morta e silenciosa. Trocar por parênteses preserva a leitura e mantém a
 * marca válida; o vínculo continua sendo o id, não o texto.
 */
export function safeTaskRefLabel(title: string): string {
  return title
    .replace(/\r?\n/g, " ")
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .trim();
}

/** A marca gravada no texto ao vincular uma tarefa existente. */
export function taskRefInsertion(task: { id: string; title: string }): string {
  return `[${safeTaskRefLabel(task.title)}](${taskRefHref(task.id)})`;
}

/** Corta o rótulo exibido no popup — o texto inserido continua sendo o título inteiro. */
function truncateLabel(title: string): string {
  if (title.length <= TASK_REF_LABEL_MAX) return title;
  return `${title.slice(0, TASK_REF_LABEL_MAX - 1).trimEnd()}…`;
}

/**
 * As tarefas que casam com a consulta, **abertas antes das concluídas**.
 *
 * A comparação passa por `foldForSearch` (a mesma do menu `/` e da busca de notas) e o resultado
 * vai com `filter: false`: o filtro embutido do CodeMirror casa **com acento**, então "revisao"
 * não acharia "Revisão" — razão escrita em `slashMenu.ts:37-40`.
 */
export function rankTaskRefCandidates(
  tasks: readonly TaskRefCandidate[],
  query: string
): TaskRefCandidate[] {
  const needle = foldForSearch(query);
  const matched = tasks.filter((task) => {
    if (!task.title.trim()) return false;
    return !needle || foldForSearch(task.title).includes(needle);
  });
  const open = matched.filter((task) => task.status !== "done");
  const done = matched.filter((task) => task.status === "done");
  return [...open, ...done].slice(0, TASK_REF_COMPLETION_LIMIT);
}

/**
 * A fonte de autocomplete do `TASK->`, no molde de `wikiLinkCompletionSource`.
 *
 * `tasks` é **função**, não lista, pela mesma razão dos títulos do `[[`: o editor é montado uma vez
 * e a lista muda embaixo dele (uma tarefa criada pelo próprio popup, por exemplo).
 *
 * A primeira opção é **sempre** "Criar tarefa: `<texto digitado>`", em posição fixa, para que criar
 * seja um `Enter` previsível em vez de depender de quantas tarefas casaram. Com a consulta vazia
 * ela é a única — e, aí, escolher não cria nada: tarefa sem título não pode nascer.
 */
export function taskRefCompletionSource(
  tasks: () => readonly TaskRefCandidate[],
  onCreate: TaskRefCreateHandler
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(TASK_REF_QUERY_RE);
    if (!before) return null;
    const offset = taskRefTriggerOffset(before.text);
    if (offset < 0) return null;

    const title = taskRefQuery(before.text).trim();
    const options: Completion[] = [
      {
        label: `Criar tarefa: ${title}`,
        type: "keyword",
        apply: (view, _completion, from, to) => {
          // Consulta vazia: a opção aparece (é a âncora do menu), mas não nasce tarefa sem título.
          if (!title) return;
          onCreate(view, title, from, to);
        },
      },
    ];

    if (title) {
      for (const task of rankTaskRefCandidates(tasks(), title)) {
        options.push({
          label: truncateLabel(task.title),
          detail: task.status === "done" ? "concluída" : undefined,
          type: "text",
          apply: taskRefInsertion(task),
        });
      }
    }

    return {
      // O `TASK->` inteiro é substituído pela marca — diferente do `[[` e do `/`, onde o gatilho
      // fica no documento. Aqui não sobra sintaxe nenhuma: o que resta é o link markdown.
      from: before.from + offset,
      options,
      // Sem `validFor`: a fonte roda a cada tecla porque o filtro é nosso (ver `rankTaskRefCandidates`).
      filter: false,
    };
  };
}

/**
 * Quem sabe gravar a tarefa. Devolve a tarefa criada, ou `null` quando a gravação falhou — o aviso
 * ao usuário é responsabilidade de quem implementa (mesmo contrato de `handleCreateLinkedNote`,
 * `TaskDescriptionField.tsx:54-70`).
 */
export type TaskRefCreator = (title: string) => Promise<{ id: string } | null>;

/**
 * A ponte entre o `apply` síncrono do popup e o `createTask` assíncrono.
 *
 * Três passos, nesta ordem, e é a ordem que importa:
 * 1. o rótulo entra **na hora** no lugar do `TASK->consulta`, como texto simples — a pessoa vê o
 *    resultado da escolha sem esperar a rede;
 * 2. o intervalo do rótulo fica guardado no `pendingTaskRefs`, que o remapeia a cada tecla;
 * 3. chegando o id, o intervalo (já remapeado) vira `[Rótulo](orbyva-task:<id>)`.
 *
 * Falhando a criação, o passo 3 não acontece: o rótulo **fica** como texto simples e o pedido é
 * descartado. Nada do que a pessoa escreveu some — o custo de falhar é uma marca a menos, nunca um
 * texto perdido.
 */
export function taskRefCreateHandler(create: TaskRefCreator): TaskRefCreateHandler {
  return (view, title, from, to) => {
    const pendingId = insertPendingTaskRef(view, from, to, safeTaskRefLabel(title));
    void create(title)
      .then((created) => {
        if (created) resolvePendingTaskRef(view, pendingId, created.id);
        else cancelPendingTaskRef(view, pendingId);
      })
      .catch(() => cancelPendingTaskRef(view, pendingId));
  };
}

/**
 * A extensão pronta para o `MarkdownCodeEditor`, pendurada na linguagem markdown (como o `[[`).
 *
 * O `StateField` de pendentes vem junto de propósito: registrar o autocomplete sem ele produziria
 * um rótulo que nunca vira marca, e o defeito só apareceria em produção.
 */
export function taskRefAutocomplete(
  tasks: () => readonly TaskRefCandidate[],
  create: TaskRefCreator
): Extension {
  return [
    markdownSupport.language.data.of({
      autocomplete: taskRefCompletionSource(tasks, taskRefCreateHandler(create)),
    }),
    taskRefPending,
  ];
}
