import { StateEffect, StateField } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { taskRefHref } from "@/domain/tasks/taskRefs";

/**
 * # O intervalo que espera um id (feature 104)
 *
 * O `apply` do `@codemirror/autocomplete` é **síncrono**; criar a tarefa é assíncrono. Escolher
 * "Criar tarefa: X" no popup, então, não pode esperar o `createTask` voltar para escrever a marca
 * — a pessoa continua digitando no meio do caminho.
 *
 * A saída, decidida na feature: inserir o rótulo **na hora**, como texto simples, e guardar aquele
 * intervalo aqui. Este `StateField` remapeia o intervalo por toda mudança do documento, então,
 * quando o id chega, a substituição por `[X](orbyva-task:<id>)` cai no lugar certo mesmo que a
 * pessoa tenha escrito dez linhas acima nesse meio tempo.
 *
 * Duas alternativas foram descartadas e estão registradas no arquivo da feature: travar o editor
 * até o `createTask` voltar (trava a digitação num fluxo cujo ponto é fluidez) e guardar o offset
 * cru (o texto anda e a marca cairia deslocada — o defeito que este campo existe para impedir).
 */

/** Um rótulo já escrito no documento, esperando o id da tarefa que está sendo criada. */
export interface PendingTaskRef {
  /** Identidade do pedido, não do documento — é por ela que o resolvedor acha o intervalo. */
  readonly id: number;
  readonly from: number;
  readonly to: number;
}

/**
 * Registra um intervalo. O valor vai em coordenadas do documento **depois** da transação: o campo
 * remapeia o que já existia antes de aplicar os efeitos (ver `update`), e o intervalo novo nasce
 * já do outro lado da mudança.
 */
export const registerPendingTaskRef = StateEffect.define<PendingTaskRef>();

/** Tira um intervalo da lista — resolvido com sucesso, ou desistido porque a criação falhou. */
export const clearPendingTaskRef = StateEffect.define<number>();

export const pendingTaskRefs = StateField.define<readonly PendingTaskRef[]>({
  create: () => [],
  update(value, tr) {
    let next = value;
    if (tr.docChanged && next.length > 0) {
      next = next
        .map((pending) => ({
          id: pending.id,
          // `from` com associação positiva e `to` com negativa: texto digitado **encostado** nas
          // bordas fica de fora do intervalo. O rótulo escolhido no popup é o que foi escolhido;
          // o que a pessoa continuar escrevendo depois dele não entra na marca.
          from: tr.changes.mapPos(pending.from, 1),
          to: tr.changes.mapPos(pending.to, -1),
        }))
        // Rótulo apagado no meio do caminho: o intervalo virou um ponto e não tem mais o que
        // marcar. Descartar é melhor do que resolver em cima do vazio.
        .filter((pending) => pending.to > pending.from);
    }
    for (const effect of tr.effects) {
      if (effect.is(registerPendingTaskRef)) {
        next = [...next, effect.value];
      } else if (effect.is(clearPendingTaskRef)) {
        next = next.filter((pending) => pending.id !== effect.value);
      }
    }
    return next;
  },
});

/** A extensão para o editor. Vai junto do autocomplete — sem o campo, nada é remapeado. */
export const taskRefPending: Extension = pendingTaskRefs;

/** Sequência só de processo: identifica o pedido, nunca é gravada em lugar nenhum. */
let nextPendingId = 0;

/**
 * Escreve o rótulo no lugar do `TASK->consulta` e devolve o identificador do pedido.
 *
 * O texto fica **simples** até o id chegar: é o que a pessoa vê imediatamente, e é o que sobra se
 * a criação falhar (nada do que ela escreveu some).
 */
export function insertPendingTaskRef(
  view: EditorView,
  from: number,
  to: number,
  label: string
): number {
  const id = ++nextPendingId;
  const end = from + label.length;
  view.dispatch({
    changes: { from, to, insert: label },
    selection: { anchor: end },
    effects: registerPendingTaskRef.of({ id, from, to: end }),
    scrollIntoView: true,
    userEvent: "input.complete",
  });
  return id;
}

/** O intervalo ainda vivo desse pedido, se houver. */
export function findPendingTaskRef(
  view: EditorView,
  pendingId: number
): PendingTaskRef | null {
  return view.state.field(pendingTaskRefs).find((p) => p.id === pendingId) ?? null;
}

/**
 * O id chegou: o intervalo (já remapeado) vira `[Rótulo](orbyva-task:<id>)`.
 *
 * Devolve `false` quando o intervalo já não existe — a pessoa apagou o rótulo enquanto a criação
 * corria. Aí não há o que marcar, e reinserir texto que ela apagou seria pior do que não marcar.
 */
export function resolvePendingTaskRef(
  view: EditorView,
  pendingId: number,
  taskId: string
): boolean {
  const pending = findPendingTaskRef(view, pendingId);
  if (!pending) return false;
  const label = view.state.sliceDoc(pending.from, pending.to);
  view.dispatch({
    changes: {
      from: pending.from,
      to: pending.to,
      insert: `[${label}](${taskRefHref(taskId)})`,
    },
    effects: clearPendingTaskRef.of(pendingId),
  });
  return true;
}

/** Desiste do pedido sem tocar no documento: o rótulo fica como texto simples. */
export function cancelPendingTaskRef(view: EditorView, pendingId: number): void {
  if (!findPendingTaskRef(view, pendingId)) return;
  view.dispatch({ effects: clearPendingTaskRef.of(pendingId) });
}
