// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import type { CompletionResult } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import { EditorSelection, EditorState } from "@codemirror/state";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import {
  TASK_REF_COMPLETION_LIMIT,
  taskRefCreateHandler,
  TASK_REF_LABEL_MAX,
  TASK_REF_QUERY_RE,
  rankTaskRefCandidates,
  taskRefCompletionSource,
  taskRefQuery,
  taskRefTriggerOffset,
} from "@/components/codemirror/taskRefCompletion";
import type {
  TaskRefCandidate,
  TaskRefCreateHandler,
} from "@/components/codemirror/taskRefCompletion";
import type { TaskRefCreator } from "@/components/codemirror/taskRefCompletion";
import { pendingTaskRefs, taskRefPending } from "@/components/codemirror/taskRefPending";
import { parseTaskRefs } from "@/domain/tasks/taskRefs";

/**
 * O gatilho do `TASK->` (feature 104), testado antes de existir popup.
 *
 * É o teste que impede o menu de abrir onde não deve: dentro de uma palavra (`fooTASK->`) e
 * atravessando quebra de linha. Duas camadas — o regex sozinho e o mesmo regex passando pelo
 * `CompletionContext.matchBefore`, que é o contrato que o CodeMirror realmente chama.
 */

/** O trecho que `TASK_REF_QUERY_RE` casa em `text`, ou `null` quando não casa. */
function match(text: string): string | null {
  const found = TASK_REF_QUERY_RE.exec(text);
  return found ? found[0] : null;
}

/** O que `matchBefore` devolveria com o cursor no fim do documento. */
function matchBefore(doc: string, pos = doc.length) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(pos),
    extensions: [markdownSupport],
  });
  return new CompletionContext(state, pos, false).matchBefore(TASK_REF_QUERY_RE);
}

describe("TASK_REF_QUERY_RE — o gatilho", () => {
  it("casa a marca sozinha, no começo da linha", () => {
    expect(match("TASK->")).toBe("TASK->");
    expect(taskRefQuery("TASK->")).toBe("");
  });

  it("casa com o que já foi digitado depois da marca", () => {
    expect(match("TASK->revisao")).toBe("TASK->revisao");
    expect(taskRefQuery("TASK->revisao")).toBe("revisao");
  });

  it("casa depois de um espaço, no meio da linha", () => {
    const found = match("foo TASK->bar");
    expect(found).toBe(" TASK->bar");
    expect(taskRefTriggerOffset(found as string)).toBe(1);
    expect(taskRefQuery(found as string)).toBe("bar");
  });

  it("a consulta aceita espaço — título de tarefa tem mais de uma palavra", () => {
    expect(taskRefQuery(match("TASK-> painel de controle") as string)).toBe(
      " painel de controle"
    );
  });

  it("NÃO casa colado numa palavra — é o gatilho estreito", () => {
    expect(match("fooTASK->")).toBeNull();
    expect(match("fooTASK->bar")).toBeNull();
    // Hífen e barra também são "palavra" para este fim: nada além de espaço abre o menu.
    expect(match("a-TASK->")).toBeNull();
  });

  it("NÃO casa quando a consulta atravessa quebra de linha", () => {
    expect(match("TASK->foo\nbar")).toBeNull();
    // Mas a marca recomeçando na linha de baixo é um gatilho legítimo.
    expect(match("foo\nTASK->bar")).toBe("\nTASK->bar");
  });

  it("NÃO casa sem a marca, nem com a marca incompleta", () => {
    expect(match("texto comum")).toBeNull();
    expect(match("TASK-")).toBeNull();
    expect(match("task->minuscula")).toBeNull();
  });

  it("com duas marcas na mesma linha, a última vence", () => {
    // `matchBefore` usa `String.search`, que devolve a ocorrência mais à esquerda: sem a recusa de
    // um segundo `TASK->` dentro da consulta, o menu filtraria por "a TASK->b".
    expect(match("TASK->a TASK->b")).toBe(" TASK->b");
    expect(taskRefQuery(match("TASK->a TASK->b") as string)).toBe("b");
  });
});

describe("TASK_REF_QUERY_RE — pelo CompletionContext", () => {
  it("abre com o cursor logo depois da marca", () => {
    const found = matchBefore("TASK->");
    expect(found?.text).toBe("TASK->");
    expect(found?.from).toBe(0);
  });

  it("abre no meio da linha e aponta para o espaço antes da marca", () => {
    const found = matchBefore("nota: TASK->rev");
    expect(found?.text).toBe(" TASK->rev");
    expect(found?.from).toBe(5);
    expect(found?.to).toBe("nota: TASK->rev".length);
  });

  it("não abre colado numa palavra", () => {
    expect(matchBefore("fooTASK->")).toBeNull();
  });

  it("não abre na linha seguinte à marca", () => {
    // `matchBefore` só olha a linha do cursor — o `\n` já encerrou a consulta.
    expect(matchBefore("TASK->foo\nbar")).toBeNull();
  });

  it("não abre quando o cursor está antes da marca", () => {
    expect(matchBefore("TASK->rev", 2)).toBeNull();
  });
});

/* ------------------------------------------------------------------------------------------- *
 * A fonte de autocomplete
 * ------------------------------------------------------------------------------------------- */

const UUID = "11111111-1111-4111-8111-111111111111";

const TASKS: TaskRefCandidate[] = [
  { id: UUID, title: "Revisão do contrato", status: "todo" },
  { id: "22222222-2222-4222-8222-222222222222", title: "Revisar a planta", status: "done" },
  { id: "33333333-3333-4333-8333-333333333333", title: "Comprar cimento", status: "doing" },
];

/** Roda a fonte com o cursor no fim de `doc`, como se a pessoa tivesse acabado de digitar. */
function complete(
  doc: string,
  tasks: readonly TaskRefCandidate[] = TASKS,
  onCreate: TaskRefCreateHandler = () => {}
): CompletionResult | null {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.length),
    extensions: [markdownSupport],
  });
  const context = new CompletionContext(state, doc.length, false);
  return taskRefCompletionSource(() => tasks, onCreate)(context) as CompletionResult | null;
}

const labels = (result: CompletionResult | null) =>
  result?.options.map((option) => String(option.label)) ?? [];

/** Aciona a primeira opção ("Criar tarefa: …") como o CodeMirror acionaria. */
function chooseCreate(result: CompletionResult, view: EditorView, to: number): void {
  const apply = result.options[0].apply as (
    v: EditorView,
    completion: unknown,
    from: number,
    to: number
  ) => void;
  apply(view, result.options[0], result.from, to);
}

describe("taskRefCompletionSource", () => {
  it("com a consulta vazia oferece só a opção de criar", () => {
    const result = complete("TASK->");
    expect(labels(result)).toEqual(["Criar tarefa: "]);
    // O trecho substituído começa no `T` da marca: o `TASK->` some junto, não sobra sintaxe.
    expect(result?.from).toBe(0);
    expect(result?.filter).toBe(false);
  });

  it("fora de um `TASK->` não devolve nada", () => {
    expect(complete("texto comum")).toBeNull();
    expect(complete("fooTASK->rev")).toBeNull();
  });

  it("a opção de criar é sempre a primeira, com o texto digitado", () => {
    expect(labels(complete("TASK-> painel de controle"))[0]).toBe(
      "Criar tarefa: painel de controle"
    );
  });

  it("uma consulta que casa duas tarefas devolve as duas, a aberta primeiro", () => {
    // "Revisão do contrato" (todo) e "Revisar a planta" (done) casam com "revis".
    expect(labels(complete("TASK->revis"))).toEqual([
      "Criar tarefa: revis",
      "Revisão do contrato",
      "Revisar a planta",
    ]);
  });

  it("acha com acento e sem acento — é o `foldForSearch`, não o filtro do CodeMirror", () => {
    expect(labels(complete("TASK->revisao"))).toEqual([
      "Criar tarefa: revisao",
      "Revisão do contrato",
    ]);
    expect(labels(complete("TASK->REVISÃO"))).toEqual([
      "Criar tarefa: REVISÃO",
      "Revisão do contrato",
    ]);
  });

  it("escolher uma tarefa existente aplica exatamente a marca da 103", () => {
    const result = complete("TASK->cimento");
    expect(result?.options[1].apply).toBe(
      "[Comprar cimento](orbyva-task:33333333-3333-4333-8333-333333333333)"
    );
    // E o que fica no documento é só a marca — o `TASK->cimento` foi substituído inteiro.
    const doc = "nota: TASK->cimento";
    const applied = complete(doc);
    const text =
      doc.slice(0, applied?.from) + String(applied?.options[1].apply);
    expect(text).toBe(
      "nota: [Comprar cimento](orbyva-task:33333333-3333-4333-8333-333333333333)"
    );
    // E a marca resultante é lida de volta pelo parser da 103.
    expect(parseTaskRefs(text)).toHaveLength(1);
    expect(parseTaskRefs(text)[0].label).toBe("Comprar cimento");
  });

  it("respeita o teto de sugestões e ignora título vazio", () => {
    const many: TaskRefCandidate[] = Array.from({ length: 50 }, (_, i) => ({
      id: `id-${i}`,
      title: `Reunião ${i}`,
      status: "todo" as const,
    }));
    const result = complete("TASK->reuniao", [
      { id: "vazio", title: "   ", status: "todo" },
      ...many,
    ]);
    // O teto vale para as tarefas; a opção de criar fica sempre por cima dela.
    expect(result?.options).toHaveLength(TASK_REF_COMPLETION_LIMIT + 1);
    expect(labels(result)[1]).toBe("Reunião 0");
  });

  it("lê as tarefas na hora da sugestão, não na montagem", () => {
    let tasks: TaskRefCandidate[] = [];
    const source = taskRefCompletionSource(() => tasks, () => {});
    const state = EditorState.create({ doc: "TASK->nova", extensions: [markdownSupport] });
    const context = () => new CompletionContext(state, "TASK->nova".length, false);

    expect(labels(source(context()) as CompletionResult)).toEqual(["Criar tarefa: nova"]);
    tasks = [{ id: "n-1", title: "Tarefa nova", status: "todo" }];
    expect(labels(source(context()) as CompletionResult)).toEqual([
      "Criar tarefa: nova",
      "Tarefa nova",
    ]);
  });

  it("o rótulo longo é cortado no popup, mas a marca leva o título inteiro", () => {
    const longo = "Revisar " + "muito ".repeat(20) + "fim";
    const result = complete("TASK->revisar", [
      { id: "44444444-4444-4444-8444-444444444444", title: longo, status: "todo" },
    ]);
    const option = result?.options[1];
    expect(String(option?.label)).toHaveLength(TASK_REF_LABEL_MAX);
    expect(String(option?.label).endsWith("…")).toBe(true);
    expect(option?.apply).toBe(
      `[${longo}](orbyva-task:44444444-4444-4444-8444-444444444444)`
    );
  });

  it("título com colchete vira marca válida — sem isso a referência nasceria morta", () => {
    const result = complete("TASK->urgente", [
      { id: "55555555-5555-4555-8555-555555555555", title: "Revisar [urgente] contrato", status: "todo" },
    ]);
    const applied = String(result?.options[1].apply);
    expect(applied).toBe(
      "[Revisar (urgente) contrato](orbyva-task:55555555-5555-4555-8555-555555555555)"
    );
    expect(parseTaskRefs(applied)).toHaveLength(1);
  });

  it("escolher `Criar tarefa: X` chama o handler com o título e o trecho a substituir", () => {
    const onCreate = vi.fn();
    const doc = "nota: TASK-> painel de controle";
    const result = complete(doc, TASKS, onCreate) as CompletionResult;
    const view = {} as EditorView;
    chooseCreate(result, view, doc.length);
    // O título vai sem o espaço que separa a marca; `from` é o `T` do `TASK->`, não o espaço antes.
    expect(onCreate).toHaveBeenCalledWith(view, "painel de controle", 6, doc.length);
  });

  it("com a consulta vazia, escolher `Criar tarefa:` NÃO cria nada", () => {
    const onCreate = vi.fn();
    const result = complete("TASK->", TASKS, onCreate) as CompletionResult;
    chooseCreate(result, {} as EditorView, 6);
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe("rankTaskRefCandidates", () => {
  it("consulta vazia devolve todas, abertas primeiro", () => {
    expect(rankTaskRefCandidates(TASKS, "").map((t) => t.title)).toEqual([
      "Revisão do contrato",
      "Comprar cimento",
      "Revisar a planta",
    ]);
  });

  it("preserva a ordem de entrada dentro de cada grupo", () => {
    const ordered = rankTaskRefCandidates(
      [
        { id: "a", title: "Alfa", status: "done" },
        { id: "b", title: "Beta", status: "todo" },
        { id: "c", title: "Gama", status: "doing" },
      ],
      ""
    );
    expect(ordered.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });
});

// ---- a ponte entre o `apply` síncrono e o `createTask` assíncrono ------------------------------

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function mountEditor(doc: string): EditorView {
  const host = document.createElement("div");
  document.body.appendChild(host);
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(doc.length),
      extensions: [markdownSupport, taskRefPending],
    }),
    parent: host,
  });
  return view;
}

/** Dispara o handler como o popup dispararia, sobre `nota: TASK->painel`. */
function chooseCreateOn(editor: EditorView, create: TaskRefCreator) {
  taskRefCreateHandler(create)(editor, "painel", 6, editor.state.doc.length);
}

describe("taskRefCreateHandler", () => {
  const DOC = "nota: TASK->painel";

  it("insere o rótulo na hora, como texto simples, e chama a criação com o título", async () => {
    const editor = mountEditor(DOC);
    const create = vi.fn<TaskRefCreator>().mockResolvedValue({ id: UUID });
    chooseCreateOn(editor, create);

    // Antes de qualquer resposta: o `TASK->painel` já virou "painel", texto simples.
    expect(editor.state.doc.toString()).toBe("nota: painel");
    expect(parseTaskRefs(editor.state.doc.toString())).toEqual([]);
    expect(create).toHaveBeenCalledWith("painel");

    await vi.waitFor(() =>
      expect(editor.state.doc.toString()).toBe(`nota: [painel](orbyva-task:${UUID})`)
    );
    expect(parseTaskRefs(editor.state.doc.toString())[0].id).toBe(UUID);
  });

  it("a marca cai no lugar certo mesmo com a pessoa digitando ANTES do rótulo", async () => {
    // É o caso que o `StateField` existe para resolver: guardar o offset cru deslocaria a marca.
    const editor = mountEditor(DOC);
    let resolveCreate: (task: { id: string }) => void = () => {};
    chooseCreateOn(
      editor,
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    editor.dispatch({ changes: { from: 0, insert: "titulo longo\n" } });
    resolveCreate({ id: UUID });

    await vi.waitFor(() =>
      expect(editor.state.doc.toString()).toBe(
        `titulo longo\nnota: [painel](orbyva-task:${UUID})`
      )
    );
  });

  it("criação que falha deixa o rótulo como texto simples — o texto NÃO some", async () => {
    const editor = mountEditor(DOC);
    const create = vi.fn<TaskRefCreator>().mockResolvedValue(null);
    chooseCreateOn(editor, create);

    await vi.waitFor(() => expect(create).toHaveBeenCalled());
    expect(editor.state.doc.toString()).toBe("nota: painel");
    expect(editor.state.field(pendingTaskRefs)).toEqual([]);
  });

  it("criação que rejeita também deixa o rótulo, sem quebrar o editor", async () => {
    const editor = mountEditor(DOC);
    chooseCreateOn(editor, () => Promise.reject(new Error("offline")));

    await vi.waitFor(() => expect(editor.state.field(pendingTaskRefs)).toEqual([]));
    expect(editor.state.doc.toString()).toBe("nota: painel");
  });

  it("título com colchete entra no documento já saneado", async () => {
    const editor = mountEditor("nota: TASK->x");
    taskRefCreateHandler(async () => ({ id: UUID }))(
      editor,
      "Revisar [urgente]",
      6,
      editor.state.doc.length
    );
    expect(editor.state.doc.toString()).toBe("nota: Revisar (urgente)");
    await vi.waitFor(() =>
      expect(parseTaskRefs(editor.state.doc.toString())[0].label).toBe("Revisar (urgente)")
    );
  });
});
