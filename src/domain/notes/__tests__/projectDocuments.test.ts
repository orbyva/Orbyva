import { describe, expect, it } from "vitest";
import {
  indexProjectDocumentLinks,
  mergeProjectDocuments,
  type ProjectDocumentLinkRow,
} from "@/domain/notes/projectDocuments";
import type { Note } from "@/types/notes";

/**
 * Feature 105 — a regra da aba "Documentos": a união das três origens (projeto, tarefa do projeto,
 * vínculo com o projeto), sem banco. É aqui que se prova que a mesma nota não aparece duas vezes,
 * que vínculo órfão não entra e que o item sabe dizer de qual tarefa veio.
 */

const PROJECT = "p1";

function note(overrides: Partial<Note> & Pick<Note, "id">): Note {
  return {
    title: `Nota ${overrides.id}`,
    content: "",
    project_id: null,
    kind: "markdown",
    canvas_data: null,
    updated_at: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

function link(
  overrides: Partial<ProjectDocumentLinkRow> & Pick<ProjectDocumentLinkRow, "note_id">
): ProjectDocumentLinkRow {
  return { entity_type: "task", entity_id: "t1", label: null, ...overrides };
}

describe("mergeProjectDocuments", () => {
  it("entrada vazia devolve []", () => {
    expect(
      mergeProjectDocuments({
        projectNotes: [],
        linkedNotes: [],
        links: [],
        projectTaskIds: [],
        projectId: PROJECT,
      })
    ).toEqual([]);
  });

  it("nota das três origens ao mesmo tempo aparece uma vez, com as três em sources", () => {
    const nota = note({ id: "n1", project_id: PROJECT });

    const documents = mergeProjectDocuments({
      projectNotes: [nota],
      // A mesma nota volta da busca por id (a API não sabe, de antemão, que ela já veio).
      linkedNotes: [nota],
      links: [
        link({ note_id: "n1", entity_type: "task", entity_id: "t1", label: "Trocar a fiação" }),
        link({ note_id: "n1", entity_type: "project", entity_id: PROJECT }),
      ],
      projectTaskIds: ["t1"],
      projectId: PROJECT,
    });

    expect(documents).toHaveLength(1);
    expect(documents[0].id).toBe("n1");
    expect([...documents[0].sources].sort()).toEqual(["link", "project", "task"]);
    expect(documents[0].taskLabel).toBe("Trocar a fiação");
  });

  it("vínculo órfão não entra: tarefa de outro projeto, tarefa apagada, projeto alheio", () => {
    const documents = mergeProjectDocuments({
      projectNotes: [],
      linkedNotes: [
        note({ id: "n1" }),
        note({ id: "n2" }),
        note({ id: "n3" }),
      ],
      links: [
        // tarefa que não é deste projeto
        link({ note_id: "n1", entity_id: "t-outro" }),
        // tarefa apagada: o vínculo continua lá, o id não é mais tarefa de projeto nenhum
        link({ note_id: "n2", entity_id: "t-morta" }),
        // vínculo com outro projeto
        link({ note_id: "n3", entity_type: "project", entity_id: "p2" }),
      ],
      projectTaskIds: ["t1"],
      projectId: PROJECT,
    });

    expect(documents).toEqual([]);
  });

  it("nota de outro projeto vinculada a uma tarefa deste entra, com o taskLabel", () => {
    const documents = mergeProjectDocuments({
      projectNotes: [],
      linkedNotes: [note({ id: "n9", project_id: "p2", title: "Orçamento" })],
      links: [
        link({ note_id: "n9", entity_id: "t1", label: "Pedir 3 orçamentos" }),
      ],
      projectTaskIds: ["t1"],
      projectId: PROJECT,
    });

    expect(documents).toHaveLength(1);
    // O `project_id` de outro projeto não vira origem daqui — quem a põe nesta lista é a tarefa.
    expect(documents[0].sources).toEqual(["task"]);
    expect(documents[0].taskLabel).toBe("Pedir 3 orçamentos");
    expect(documents[0].project_id).toBe("p2");
  });

  it("canvas entra pelas mesmas portas que a nota — canvas é nota com kind", () => {
    const documents = mergeProjectDocuments({
      projectNotes: [],
      linkedNotes: [
        note({ id: "c1", kind: "canvas", canvas_data: { elements: [{}, {}] } }),
      ],
      links: [link({ note_id: "c1", entity_id: "t1", label: "Planta baixa" })],
      projectTaskIds: ["t1"],
      projectId: PROJECT,
    });

    expect(documents[0].kind).toBe("canvas");
    expect(documents[0].canvas_data).toEqual({ elements: [{}, {}] });
  });

  it("ordena por updated_at desc, com desempate estável por título", () => {
    const documents = mergeProjectDocuments({
      projectNotes: [
        note({ id: "n1", project_id: PROJECT, title: "Zebra", updated_at: "2026-08-10T10:00:00.000Z" }),
        note({ id: "n2", project_id: PROJECT, title: "Abacaxi", updated_at: "2026-08-10T10:00:00.000Z" }),
        note({ id: "n3", project_id: PROJECT, title: "Recente", updated_at: "2026-08-31T09:00:00.000Z" }),
      ],
      linkedNotes: [],
      links: [],
      projectTaskIds: [],
      projectId: PROJECT,
    });

    expect(documents.map((d) => d.title)).toEqual(["Recente", "Abacaxi", "Zebra"]);

    // O desempate não pode depender da ordem de entrada: a mesma lista embaralhada dá o mesmo fim.
    const invertido = mergeProjectDocuments({
      projectNotes: [
        note({ id: "n2", project_id: PROJECT, title: "Abacaxi", updated_at: "2026-08-10T10:00:00.000Z" }),
        note({ id: "n3", project_id: PROJECT, title: "Recente", updated_at: "2026-08-31T09:00:00.000Z" }),
        note({ id: "n1", project_id: PROJECT, title: "Zebra", updated_at: "2026-08-10T10:00:00.000Z" }),
      ],
      linkedNotes: [],
      links: [],
      projectTaskIds: [],
      projectId: PROJECT,
    });
    expect(invertido.map((d) => d.title)).toEqual(["Recente", "Abacaxi", "Zebra"]);
  });

  it("nota sem updated_at vai para o fim, sem quebrar a ordenação", () => {
    const documents = mergeProjectDocuments({
      projectNotes: [
        note({ id: "n1", project_id: PROJECT, title: "Sem data", updated_at: undefined }),
        note({ id: "n2", project_id: PROJECT, title: "Com data" }),
      ],
      linkedNotes: [],
      links: [],
      projectTaskIds: [],
      projectId: PROJECT,
    });
    expect(documents.map((d) => d.title)).toEqual(["Com data", "Sem data"]);
  });

  it("vínculo com a tarefa sem rótulo deixa taskLabel nulo, mas a origem continua 'task'", () => {
    const documents = mergeProjectDocuments({
      projectNotes: [],
      linkedNotes: [note({ id: "n1" })],
      links: [link({ note_id: "n1", entity_id: "t1", label: "   " })],
      projectTaskIds: ["t1"],
      projectId: PROJECT,
    });

    expect(documents[0].sources).toEqual(["task"]);
    expect(documents[0].taskLabel).toBeNull();
  });

  it("vínculo cuja nota não veio (apagada ou escondida pela RLS) não vira linha fantasma", () => {
    const documents = mergeProjectDocuments({
      projectNotes: [],
      linkedNotes: [],
      links: [link({ note_id: "n-sumida", entity_id: "t1", label: "Tarefa" })],
      projectTaskIds: ["t1"],
      projectId: PROJECT,
    });
    expect(documents).toEqual([]);
  });

  it("duas tarefas do projeto na mesma nota: vale o rótulo do primeiro vínculo", () => {
    const documents = mergeProjectDocuments({
      projectNotes: [],
      linkedNotes: [note({ id: "n1" })],
      links: [
        link({ note_id: "n1", entity_id: "t1", label: "Mais antiga" }),
        link({ note_id: "n1", entity_id: "t2", label: "Mais nova" }),
      ],
      projectTaskIds: ["t1", "t2"],
      projectId: PROJECT,
    });

    expect(documents[0].sources).toEqual(["task"]);
    expect(documents[0].taskLabel).toBe("Mais antiga");
  });
});

describe("indexProjectDocumentLinks", () => {
  it("devolve só os note_id que os vínculos relevantes trazem — é o que a API vai buscar", () => {
    const index = indexProjectDocumentLinks(
      [
        link({ note_id: "n1", entity_id: "t1" }),
        link({ note_id: "n2", entity_type: "project", entity_id: PROJECT }),
        link({ note_id: "n3", entity_id: "t-outro" }),
        link({ note_id: "n4", entity_type: "project", entity_id: "p2" }),
      ],
      ["t1"],
      PROJECT
    );

    expect([...index.keys()]).toEqual(["n1", "n2"]);
    expect(index.get("n1")?.sources).toEqual(["task"]);
    expect(index.get("n2")?.sources).toEqual(["link"]);
  });
});
