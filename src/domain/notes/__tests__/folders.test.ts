import { describe, expect, it } from "vitest";
import type { Note, NoteFolder } from "@/types/notes";
import {
  NOTE_FOLDER_MAX_DEPTH,
  buildFolderTree,
  canMoveFolder,
  canNestUnder,
  flattenFolderTree,
  folderDepth,
  notesInFolder,
  folderAncestorIds,
  folderIdFromDropZone,
  parseFolderParam,
  reparentChildren,
  subtreeHeight,
  wouldCreateCycle,
} from "@/domain/notes/folders";

function folder(over: Partial<NoteFolder> & Pick<NoteFolder, "id" | "name">): NoteFolder {
  return {
    parent_id: null,
    project_id: null,
    tag_id: null,
    ...over,
  };
}

function note(over: Partial<Note> & Pick<Note, "id" | "title">): Note {
  return {
    content: "",
    project_id: null,
    folder_id: null,
    kind: "markdown",
    canvas_data: null,
    ...over,
  };
}

const raiz = folder({ id: "a", name: "Casa" });
const filha = folder({ id: "b", name: "Obra", parent_id: "a" });
const neta = folder({ id: "c", name: "Banheiro", parent_id: "b" });
const outra = folder({ id: "d", name: "Saúde" });

const tree = [raiz, filha, neta, outra];

describe("buildFolderTree", () => {
  it("agrupa por pai e ordena pelo nome", () => {
    const nodes = buildFolderTree(tree);
    expect(nodes.map((n) => n.id)).toEqual(["a", "d"]);
    expect(nodes[0].children.map((n) => n.id)).toEqual(["b"]);
    expect(nodes[0].children[0].children.map((n) => n.id)).toEqual(["c"]);
    expect(nodes[1].children).toEqual([]);
  });

  it("pasta cujo pai não está na lista sobe para a raiz", () => {
    const nodes = buildFolderTree([filha]);
    expect(nodes.map((n) => n.id)).toEqual(["b"]);
  });
});

describe("flattenFolderTree / folderDepth", () => {
  it("achata com a profundidade da raiz = 1", () => {
    expect(
      flattenFolderTree(tree).map(({ folder: f, depth }) => [f.id, depth])
    ).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 1],
    ]);
  });

  it("null (acima da raiz) tem profundidade 0", () => {
    expect(folderDepth(tree, null)).toBe(0);
    expect(folderDepth(tree, "a")).toBe(1);
    expect(folderDepth(tree, "c")).toBe(3);
  });
});

describe("ciclo e teto de profundidade", () => {
  it("recusa virar pai de si mesma ou de um ancestral", () => {
    expect(wouldCreateCycle(tree, "a", "a")).toBe(true);
    expect(wouldCreateCycle(tree, "a", "c")).toBe(true);
    expect(wouldCreateCycle(tree, "c", "d")).toBe(false);
    expect(wouldCreateCycle(tree, "a", null)).toBe(false);
  });

  it("não deixa criar pasta abaixo do nível 3", () => {
    expect(NOTE_FOLDER_MAX_DEPTH).toBe(3);
    expect(canNestUnder(tree, null)).toBe(true);
    expect(canNestUnder(tree, "a")).toBe(true);
    expect(canNestUnder(tree, "b")).toBe(true);
    expect(canNestUnder(tree, "c")).toBe(false);
  });

  it("mover uma subárvore não pode estourar o teto", () => {
    expect(subtreeHeight(tree, "c")).toBe(1);
    expect(subtreeHeight(tree, "a")).toBe(3);
    // `a` tem altura 3: não cabe debaixo de `d` (que já é nível 1).
    expect(canMoveFolder(tree, "a", "d")).toBe(false);
    expect(canMoveFolder(tree, "c", "d")).toBe(true);
    expect(canMoveFolder(tree, "a", "c")).toBe(false);
  });
});

describe("notesInFolder", () => {
  const notes = [
    note({ id: "n1", title: "Na obra", folder_id: "b" }),
    note({ id: "n2", title: "Na neta", folder_id: "c" }),
    note({ id: "n3", title: "Solta" }),
  ];

  it("null devolve todas, na ordem recebida", () => {
    expect(notesInFolder(notes, null)).toBe(notes);
  });

  it("inbox devolve só as sem pasta", () => {
    expect(notesInFolder(notes, "inbox").map((n) => n.id)).toEqual(["n3"]);
  });

  it("uuid devolve só as daquela pasta, sem vazar a subpasta", () => {
    expect(notesInFolder(notes, "b").map((n) => n.id)).toEqual(["n1"]);
    expect(notesInFolder(notes, "c").map((n) => n.id)).toEqual(["n2"]);
  });
});

describe("reparentChildren", () => {
  it("filhos da pasta apagada sobem para o pai dela", () => {
    expect(reparentChildren(tree, "b")).toEqual({ c: "a" });
  });

  it("filhos de uma raiz sobem para a raiz", () => {
    expect(reparentChildren(tree, "a")).toEqual({ b: null });
  });

  it("pasta sem filhos devolve patch vazio", () => {
    expect(reparentChildren(tree, "d")).toEqual({});
  });
});

describe("parseFolderParam", () => {
  it("vazio/ausente é Todas; inbox é Sem pasta; o resto é o id", () => {
    expect(parseFolderParam(null)).toBeNull();
    expect(parseFolderParam("")).toBeNull();
    expect(parseFolderParam("inbox")).toBe("inbox");
    expect(parseFolderParam("f1")).toBe("f1");
  });
});

describe("folderIdFromDropZone", () => {
  it("inbox vira Sem pasta (null); uuid vira o folder_id; o resto ignora", () => {
    expect(folderIdFromDropZone("note-folder|inbox")).toBeNull();
    expect(folderIdFromDropZone("note-folder|f1")).toBe("f1");
    expect(folderIdFromDropZone("note-folder|")).toBeUndefined();
    expect(folderIdFromDropZone("type|1")).toBeUndefined();
    expect(folderIdFromDropZone(null)).toBeUndefined();
  });
});

describe("folderAncestorIds", () => {
  it("sobe até a raiz; pasta raiz não tem ancestral", () => {
    expect(folderAncestorIds(tree, "c")).toEqual(["b", "a"]);
    expect(folderAncestorIds(tree, "a")).toEqual([]);
  });
});
