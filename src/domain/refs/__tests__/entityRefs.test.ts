import { describe, expect, it } from "vitest";
import { createEntityRefParser } from "@/domain/refs/entityRefs";

const ID = "6f1c2a90-3b44-4d21-9e77-08ab12cd34ef";

/**
 * A fábrica é o que faz `PROJECT`, `NOTE` e `GOAL` caberem depois sem reabrir o parser (decisão da
 * 103). Testar aqui com um tipo que **não** é `task` é o que prova que o tipo é de fato parâmetro,
 * e não `task` disfarçado de genérico.
 */
describe("createEntityRefParser", () => {
  it("monta o esquema a partir do tipo e casa a marca desse tipo", () => {
    const project = createEntityRefParser("project");
    expect(project.scheme).toBe("orbyva-project:");
    expect(project.href(ID)).toBe(`orbyva-project:${ID}`);
    expect(project.parseHref(`orbyva-project:${ID}`)).toBe(ID);

    const content = `ver [Obra](orbyva-project:${ID}) hoje`;
    expect(project.parse(content)).toEqual([
      { id: ID, label: "Obra", start: 4, end: 63 },
    ]);
    expect(content.slice(4, 63)).toBe(`[Obra](orbyva-project:${ID})`);
  });

  it("duas instâncias não enxergam a marca uma da outra", () => {
    const task = createEntityRefParser("task");
    const project = createEntityRefParser("project");
    const content = `[T](orbyva-task:${ID}) e [P](orbyva-project:${ID})`;

    expect(task.parse(content).map((m) => m.label)).toEqual(["T"]);
    expect(project.parse(content).map((m) => m.label)).toEqual(["P"]);
    expect(task.parseHref(`orbyva-project:${ID}`)).toBeNull();
    expect(project.parseHref(`orbyva-task:${ID}`)).toBeNull();
    expect(task.mentions(`[P](orbyva-project:${ID})`, ID)).toBe(false);
  });

  it("um tipo com hífen também vale", () => {
    const parser = createEntityRefParser("shopping-list");
    expect(parser.scheme).toBe("orbyva-shopping-list:");
    expect(parser.ids(`[Feira](orbyva-shopping-list:${ID})`)).toEqual([ID]);
  });

  it("recusa nome de entidade que não pode virar regex", () => {
    expect(() => createEntityRefParser("Task")).toThrow(/Tipo de entidade inválido/);
    expect(() => createEntityRefParser("")).toThrow(/Tipo de entidade inválido/);
    expect(() => createEntityRefParser("ta(sk|.)*")).toThrow(/Tipo de entidade inválido/);
    expect(() => createEntityRefParser("2fast")).toThrow(/Tipo de entidade inválido/);
  });

  it("ignora código também nas instâncias que não são de tarefa", () => {
    const project = createEntityRefParser("project");
    expect(project.parse(`\`\`\`\n[Obra](orbyva-project:${ID})\n\`\`\``)).toEqual([]);
    expect(project.parse(`use \`[Obra](orbyva-project:${ID})\` assim`)).toEqual([]);
  });
});
