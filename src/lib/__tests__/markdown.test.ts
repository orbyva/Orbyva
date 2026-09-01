import { describe, expect, it } from "vitest";
import { stripMarkdown } from "@/lib/markdown";

describe("stripMarkdown", () => {
  it("remove ênfase, títulos e links", () => {
    expect(stripMarkdown("# Título\n**negrito** e _itálico_")).toBe("Título negrito e itálico");
    expect(stripMarkdown("veja [o link](https://example.com)")).toBe("veja o link");
  });

  it("remove marcadores de lista e checklist", () => {
    expect(stripMarkdown("- item um\n- [ ] tarefa\n- [x] feita")).toBe("item um tarefa feita");
    expect(stripMarkdown("1. primeiro\n2. segundo")).toBe("primeiro segundo");
  });

  it("remove código inline e blocos de código", () => {
    expect(stripMarkdown("use `npm install` pra instalar")).toBe("use npm install pra instalar");
    expect(stripMarkdown("```js\nconst x = 1;\n```\ntexto depois")).toBe("texto depois");
  });

  it("mantém texto simples sem markdown intacto", () => {
    expect(stripMarkdown("texto simples sem nada")).toBe("texto simples sem nada");
  });

  it("mantém [[wiki-link]] — o card da tarefa precisa deles pra virar clique", () => {
    expect(stripMarkdown("Ata reunião 01/09/2026 em: [[Atividades Finatec]]")).toBe(
      "Ata reunião 01/09/2026 em: [[Atividades Finatec]]"
    );
  });
});
