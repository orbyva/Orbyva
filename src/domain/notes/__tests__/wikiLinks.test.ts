import { describe, expect, it } from "vitest";
import {
  indexNotesByTitle,
  missingWikiLinkHref,
  normalizeWikiTitle,
  parseMissingWikiLinkHref,
  parseWikiLinks,
  replaceWikiLinks,
  wikiLinkTitles,
} from "@/domain/notes/wikiLinks";

/** Só os títulos, que é o que quase todo caso quer afirmar. */
function titles(content: string): string[] {
  return parseWikiLinks(content).map((m) => m.title);
}

describe("parseWikiLinks", () => {
  it("acha vários links na mesma linha, na ordem em que aparecem", () => {
    expect(titles("ver [[Reunião]] e depois [[Obra da casa]] hoje")).toEqual([
      "Reunião",
      "Obra da casa",
    ]);
  });

  it("devolve os índices do trecho, colchetes inclusive", () => {
    const content = "abc [[Nota]] def";
    expect(parseWikiLinks(content)).toEqual([
      { title: "Nota", start: 4, end: 12 },
    ]);
    expect(content.slice(4, 12)).toBe("[[Nota]]");
  });

  it("ignora colchete não fechado", () => {
    expect(titles("[[sem fim e mais texto")).toEqual([]);
    expect(titles("[[quase]] mas [[isso não")).toEqual(["quase"]);
    expect(titles("[só um colchete]")).toEqual([]);
  });

  it("não confunde com link markdown comum", () => {
    expect(titles("[texto](https://exemplo.com)")).toEqual([]);
  });

  it("aceita título com acento, espaço e pontuação", () => {
    expect(titles("[[Reunião de segunda — pauta]]")).toEqual([
      "Reunião de segunda — pauta",
    ]);
  });

  it("tira o espaço das pontas e descarta título vazio", () => {
    expect(titles("[[  Nota  ]] e [[   ]]")).toEqual(["Nota"]);
  });

  it("não casa dentro de bloco de código cercado", () => {
    const content = [
      "antes [[Vale]]",
      "```",
      "[[Não vale]]",
      "```",
      "depois [[Também vale]]",
    ].join("\n");
    expect(titles(content)).toEqual(["Vale", "Também vale"]);
  });

  it("bloco cercado com til e com linguagem também conta como código", () => {
    const content = "~~~sql\nselect [[Nada]]\n~~~\n[[Sim]]";
    expect(titles(content)).toEqual(["Sim"]);
  });

  it("bloco de código aberto e nunca fechado engole o resto do arquivo", () => {
    expect(titles("```\n[[Nada]]\nnem [[isto]]")).toEqual([]);
  });

  it("não casa dentro de código inline", () => {
    expect(titles("escreva `[[Assim]]` para linkar [[De verdade]]")).toEqual([
      "De verdade",
    ]);
  });

  it("crase solta não engole o resto da linha", () => {
    expect(titles("preço ` de [[Materiais]]")).toEqual(["Materiais"]);
  });

  it("conteúdo sem nenhum link devolve lista vazia", () => {
    expect(parseWikiLinks("")).toEqual([]);
    expect(parseWikiLinks("nota comum, sem teia")).toEqual([]);
  });
});

describe("wikiLinkTitles", () => {
  it("remove repetição preservando a ordem e a primeira grafia", () => {
    expect(wikiLinkTitles("[[Obra]] e [[obra]] e [[Reunião]]")).toEqual([
      "Obra",
      "Reunião",
    ]);
  });
});

describe("indexNotesByTitle", () => {
  it("indexa por título normalizado", () => {
    const index = indexNotesByTitle([{ id: "n1", title: "Obra da Casa" }]);
    expect(index.get(normalizeWikiTitle("obra da casa"))).toBe("n1");
  });

  it("título repetido fica com a primeira nota da lista (a mais recente)", () => {
    const index = indexNotesByTitle([
      { id: "recente", title: "Sem título" },
      { id: "antiga", title: "Sem título" },
    ]);
    expect(index.get(normalizeWikiTitle("Sem título"))).toBe("recente");
  });
});

describe("replaceWikiLinks", () => {
  const resolve = (title: string) =>
    title === "Obra da casa" ? "/notes/n7" : null;

  it("troca o link resolvido por link markdown para a nota", () => {
    expect(replaceWikiLinks("ver [[Obra da casa]] hoje", resolve)).toBe(
      "ver [Obra da casa](/notes/n7) hoje"
    );
  });

  it("link sem nota vira o href sintético de 'criar nota'", () => {
    const out = replaceWikiLinks("falta [[Pauta]]", resolve);
    expect(out).toBe(`falta [Pauta](${missingWikiLinkHref("Pauta")})`);
    expect(parseMissingWikiLinkHref(missingWikiLinkHref("Pauta"))).toBe("Pauta");
  });

  it("href normal não é confundido com o sintético", () => {
    expect(parseMissingWikiLinkHref("/notes/n7")).toBeNull();
    expect(parseMissingWikiLinkHref("https://exemplo.com")).toBeNull();
  });

  it("troca vários na mesma linha sem embaralhar as posições", () => {
    expect(
      replaceWikiLinks("[[Obra da casa]] e [[Obra da casa]]", resolve)
    ).toBe("[Obra da casa](/notes/n7) e [Obra da casa](/notes/n7)");
  });

  it("não toca em ocorrência dentro de código", () => {
    const content = "`[[Obra da casa]]` e [[Obra da casa]]";
    expect(replaceWikiLinks(content, resolve)).toBe(
      "`[[Obra da casa]]` e [Obra da casa](/notes/n7)"
    );
  });

  it("escapa marcação no texto do link para o título não virar itálico", () => {
    expect(replaceWikiLinks("[[a_b_c]]", () => "/notes/x")).toBe(
      "[a\\_b\\_c](/notes/x)"
    );
  });

  it("conteúdo sem wiki-link sai idêntico", () => {
    const content = "# Título\n\ntexto [normal](https://exemplo.com)";
    expect(replaceWikiLinks(content, resolve)).toBe(content);
  });
});

describe("normalizeWikiTitle", () => {
  it("ignora caixa e espaço redundante", () => {
    expect(normalizeWikiTitle("  Obra   da Casa ")).toBe(
      normalizeWikiTitle("obra da casa")
    );
  });

  it("mantém o acento: nota com e sem acento são notas diferentes", () => {
    expect(normalizeWikiTitle("Reunião")).not.toBe(normalizeWikiTitle("Reuniao"));
  });
});
