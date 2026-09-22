import { describe, expect, it } from "vitest";
import {
  TASK_REF_SCHEME,
  mentionsTaskId,
  parseTaskRefHref,
  parseTaskRefs,
  taskRefAt,
  taskRefHref,
  taskRefIds,
  taskRefPlainSegments,
} from "@/domain/tasks/taskRefs";
import { missingWikiLinkHref, parseWikiLinks } from "@/domain/notes/wikiLinks";
import * as taskRefsModule from "@/domain/tasks/taskRefs";

const ID = "6f1c2a90-3b44-4d21-9e77-08ab12cd34ef";
const OUTRO = "11111111-2222-4333-8444-555555555555";

/** A marca como ela fica gravada no Markdown. */
function mark(label: string, id = ID): string {
  return `[${label}](${TASK_REF_SCHEME}${id})`;
}

describe("taskRefHref / parseTaskRefHref", () => {
  it("escreve e lê de volta o href da marca", () => {
    expect(TASK_REF_SCHEME).toBe("orbyva-task:");
    expect(taskRefHref(ID)).toBe(`orbyva-task:${ID}`);
    expect(parseTaskRefHref(taskRefHref(ID))).toBe(ID);
  });

  it("devolve null para href que não é marca de tarefa", () => {
    expect(parseTaskRefHref("https://exemplo.com")).toBeNull();
    expect(parseTaskRefHref(`orbyva-projeto:${ID}`)).toBeNull();
    expect(parseTaskRefHref("orbyva-task:123")).toBeNull();
    expect(parseTaskRefHref(`orbyva-wikilink-missing:${ID}`)).toBeNull();
  });
});

describe("parseTaskRefs", () => {
  it("devolve id, rótulo e os índices do trecho", () => {
    const content = `ver ${mark("Painel")} hoje`;
    expect(parseTaskRefs(content)).toEqual([
      { id: ID, label: "Painel", start: 4, end: 62 },
    ]);
    expect(content.slice(4, 62)).toBe(mark("Painel"));
  });

  it("acha duas marcas na mesma linha, na ordem em que aparecem", () => {
    const content = `${mark("primeira")} e ${mark("segunda", OUTRO)} fim`;
    expect(parseTaskRefs(content).map((m) => [m.label, m.id])).toEqual([
      ["primeira", ID],
      ["segunda", OUTRO],
    ]);
    const [um, dois] = parseTaskRefs(content);
    expect(content.slice(um.start, um.end)).toBe(mark("primeira"));
    expect(content.slice(dois.start, dois.end)).toBe(mark("segunda", OUTRO));
    expect(um.end).toBeLessThan(dois.start);
  });

  it("acha marcas em linhas diferentes, com o offset deslocado pela linha", () => {
    const content = `linha um\n${mark("na segunda")}`;
    const [match] = parseTaskRefs(content);
    expect(match.start).toBe(9);
    expect(content.slice(match.start, match.end)).toBe(mark("na segunda"));
  });

  it("devolve lista vazia para conteúdo sem marca nenhuma", () => {
    expect(parseTaskRefs("")).toEqual([]);
    expect(parseTaskRefs("   ")).toEqual([]);
    expect(parseTaskRefs("texto comprido ".repeat(500))).toEqual([]);
  });
});

describe("taskRefAt", () => {
  it("devolve a marca sob o índice, ou null fora dela", () => {
    const content = `ver ${mark("Painel")} hoje`;
    expect(taskRefAt(content, 4)?.id).toBe(ID); // no "[" que abre
    expect(taskRefAt(content, 10)?.label).toBe("Painel");
    expect(taskRefAt(content, 61)?.id).toBe(ID); // no ")" que fecha
    expect(taskRefAt(content, 3)).toBeNull();
    expect(taskRefAt(content, 62)).toBeNull();
  });
});

describe("taskRefPlainSegments", () => {
  it("intercala prosa e referência preservando o texto entre elas", () => {
    expect(taskRefPlainSegments(`antes ${mark("Painel")} meio ${mark("Outra", OUTRO)} depois`)).toEqual([
      { type: "text", value: "antes " },
      { type: "ref", id: ID, label: "Painel" },
      { type: "text", value: " meio " },
      { type: "ref", id: OUTRO, label: "Outra" },
      { type: "text", value: " depois" },
    ]);
  });

  it("devolve a prosa inteira quando não há marca, e nada quando o texto é vazio", () => {
    expect(taskRefPlainSegments("só texto")).toEqual([{ type: "text", value: "só texto" }]);
    expect(taskRefPlainSegments("")).toEqual([]);
  });

  it("não inventa prosa vazia quando a marca abre ou fecha o texto", () => {
    expect(taskRefPlainSegments(mark("Sozinha"))).toEqual([
      { type: "ref", id: ID, label: "Sozinha" },
    ]);
  });
});

describe("taskRefIds", () => {
  it("remove repetição mantendo a ordem de aparição", () => {
    const content = `${mark("a", OUTRO)} ${mark("b")} ${mark("c", OUTRO)} ${mark("d")}`;
    expect(taskRefIds(content)).toEqual([OUTRO, ID]);
  });

  it("devolve lista vazia quando não há marca", () => {
    expect(taskRefIds("nada aqui")).toEqual([]);
  });
});

describe("mentionsTaskId", () => {
  it("acha o id referenciado e recusa o que não está lá", () => {
    const content = `pendura em ${mark("Painel")} e pronto`;
    expect(mentionsTaskId(content, ID)).toBe(true);
    expect(mentionsTaskId(content, OUTRO)).toBe(false);
    expect(mentionsTaskId(content, "")).toBe(false);
    expect(mentionsTaskId("texto sem marca", ID)).toBe(false);
  });
});

/**
 * Os caminhos negativos são o que impede falso positivo. Se o parser aceitar link markdown comum,
 * a UI que consome isto (feature 105) transforma link externo em chip de tarefa — o sintoma
 * aparece lá, então o teste tem que estar aqui.
 */
describe("parseTaskRefs — o que não pode casar", () => {
  it("não casa link markdown comum", () => {
    expect(parseTaskRefs("veja [docs](https://exemplo.com) depois")).toEqual([]);
    expect(parseTaskRefs("[relativo](/tasks/123)")).toEqual([]);
    expect(parseTaskRefs("[vazio]()")).toEqual([]);
  });

  it("não casa esquema de outra entidade", () => {
    expect(parseTaskRefs(`[x](orbyva-projeto:${ID})`)).toEqual([]);
    expect(parseTaskRefs(`[x](orbyva-wikilink-missing:${ID})`)).toEqual([]);
    expect(parseTaskRefs(`[x](nao-orbyva-task:${ID})`)).toEqual([]);
  });

  it("não casa id que não é uuid", () => {
    expect(parseTaskRefs("[x](orbyva-task:123)")).toEqual([]);
    expect(parseTaskRefs("[x](orbyva-task:)")).toEqual([]);
    expect(parseTaskRefs("[x](orbyva-task:6f1c2a903b444d219e7708ab12cd34ef)")).toEqual([]);
    expect(parseTaskRefs(`[x](orbyva-task:${ID}extra)`)).toEqual([]);
    expect(parseTaskRefs(`[x](orbyva-task:${ID.slice(0, -1)})`)).toEqual([]);
  });

  it("ignora marca dentro de bloco de código cercado", () => {
    const content = `\`\`\`\n${mark("Painel")}\n\`\`\``;
    expect(parseTaskRefs(content)).toEqual([]);
    expect(taskRefIds(content)).toEqual([]);
    expect(mentionsTaskId(content, ID)).toBe(false);
  });

  it("ignora marca dentro de código inline", () => {
    expect(parseTaskRefs(`escreva \`${mark("Painel")}\` para linkar`)).toEqual([]);
  });

  it("enxerga só a marca de fora quando há uma em código e outra em prosa", () => {
    const content = `\`\`\`\n${mark("exemplo")}\n\`\`\`\nde verdade: ${mark("Painel")}`;
    const matches = parseTaskRefs(content);
    expect(matches).toHaveLength(1);
    expect(matches[0].label).toBe("Painel");
    expect(content.slice(matches[0].start, matches[0].end)).toBe(mark("Painel"));
  });

  it("casa rótulo vazio e devolve label vazio — quem renderiza decide o fallback", () => {
    const content = `[](${TASK_REF_SCHEME}${ID})`;
    expect(parseTaskRefs(content)).toEqual([{ id: ID, label: "", start: 0, end: 52 }]);
    expect(content.slice(0, 52)).toBe(content);
  });

  it("não casa colchete interno no rótulo", () => {
    expect(parseTaskRefs(`[a[b]](${TASK_REF_SCHEME}${ID})`)).toEqual([]);
    expect(parseTaskRefs(`[a]b](${TASK_REF_SCHEME}${ID})`)).toEqual([]);
  });

  it("não casa marca partida em duas linhas", () => {
    expect(parseTaskRefs(`[quebra\nde linha](${TASK_REF_SCHEME}${ID})`)).toEqual([]);
  });
});

/**
 * Os dois parsers de marca convivem no mesmo texto: é por isso que a referência de tarefa é link
 * markdown com esquema próprio e **não** `[[task:id]]` — nesse formato o `WIKI_LINK_RE` a leria
 * como referência de nota.
 */
describe("wiki-link e referência de tarefa na mesma linha", () => {
  const content = `veja [[Nota]] e ${mark("Tarefa")} hoje`;

  it("parseWikiLinks enxerga só o wiki-link", () => {
    expect(parseWikiLinks(content)).toEqual([{ title: "Nota", start: 5, end: 13 }]);
    expect(content.slice(5, 13)).toBe("[[Nota]]");
  });

  it("parseTaskRefs enxerga só a marca de tarefa", () => {
    expect(parseTaskRefs(content)).toEqual([
      { id: ID, label: "Tarefa", start: 16, end: 74 },
    ]);
    expect(content.slice(16, 74)).toBe(mark("Tarefa"));
  });

  it("nenhum dos dois é confundido com o href do outro", () => {
    expect(parseTaskRefs(`[x](${missingWikiLinkHref("Nota")})`)).toEqual([]);
    expect(parseWikiLinks(mark("Tarefa"))).toEqual([]);
  });
});

/**
 * A decisão da 103 é "genérico por dentro, só tarefa exposta". Sem asserção isso fica sendo
 * promessa de comentário — e a fábrica vazando daqui abriria caminho para um segundo parser de
 * tarefa, criado solto, discordando deste.
 */
describe("superfície de taskRefs", () => {
  it("não reexporta a fábrica genérica", () => {
    expect(Object.keys(taskRefsModule)).not.toContain("createEntityRefParser");
  });

  it("expõe exatamente o combinado", () => {
    expect(Object.keys(taskRefsModule).sort()).toEqual([
      "TASK_REF_SCHEME",
      "mentionsTaskId",
      "parseTaskRefHref",
      "parseTaskRefs",
      "taskRefAt",
      "taskRefHref",
      "taskRefIds",
      "taskRefPlainSegments",
    ]);
  });
});
