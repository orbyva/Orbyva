import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import type { CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { markdownSupport } from "@/components/codemirror/markdownLanguage";
import {
  WIKI_LINK_COMPLETION_LIMIT,
  wikiLinkCompletionSource,
} from "@/components/codemirror/wikiLinkCompletion";

/**
 * Autocomplete de `[[` (feature 056), testado no nível do `CompletionContext` — é o próprio
 * contrato que o CodeMirror chama, então a assertiva vale sem montar editor nem abrir navegador.
 */

const TITLES = ["Obra da casa", "Reunião de segunda", "Receitas"];

/** Roda a fonte com o cursor no fim de `doc`, como se o usuário tivesse acabado de digitar. */
function complete(
  doc: string,
  titles: readonly string[] = TITLES,
  explicit = false
): CompletionResult | null {
  const state = EditorState.create({ doc, extensions: [markdownSupport] });
  const context = new CompletionContext(state, doc.length, explicit);
  const source = wikiLinkCompletionSource(() => titles);
  return source(context) as CompletionResult | null;
}

describe("wikiLinkCompletionSource", () => {
  it("ao digitar `[[` sugere todos os títulos", () => {
    const result = complete("nota: [[");
    expect(result?.options.map((o) => o.label)).toEqual(TITLES);
    // O trecho substituído começa **depois** do `[[`: é ele que o CodeMirror compara com o título
    // para filtrar. Incluindo os colchetes, o popup abriria vazio.
    expect(result?.from).toBe("nota: [[".length);
  });

  it("filtra pelo que já foi digitado, ignorando caixa e acento na busca por trecho", () => {
    expect(complete("[[obra")?.options.map((o) => o.label)).toEqual([
      "Obra da casa",
    ]);
    expect(complete("[[RE")?.options.map((o) => o.label)).toEqual([
      "Reunião de segunda",
      "Receitas",
    ]);
  });

  it("aplicar a sugestão fecha os colchetes, completando o wiki-link", () => {
    const result = complete("[[obra");
    const option = result?.options[0];
    // O `[[` já está no documento e não é substituído; o que entra no lugar do que foi digitado é
    // o título com o `]]`. Junto dá `[[Obra da casa]]`.
    expect(option?.apply).toBe("Obra da casa]]");
    expect("[[obra".slice(0, result?.from) + String(option?.apply)).toBe(
      "[[Obra da casa]]"
    );
  });

  it("não sugere nada fora de um `[[` aberto", () => {
    expect(complete("texto comum")).toBeNull();
    expect(complete("um [ só")).toBeNull();
    // Link já fechado: não é mais um prefixo em aberto.
    expect(complete("[[Obra da casa]]")).toBeNull();
  });

  it("não atravessa quebra de linha", () => {
    expect(complete("[[\nobra")).toBeNull();
  });

  it("sem título que case, não abre popup vazio", () => {
    expect(complete("[[xyz")).toBeNull();
  });

  it("ignora título vazio e respeita o teto de sugestões", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Nota ${i}`);
    expect(complete("[[", ["   ", ...many])?.options).toHaveLength(
      WIKI_LINK_COMPLETION_LIMIT
    );
  });

  it("lê os títulos na hora da sugestão, não na montagem", () => {
    // É o que faz a nota recém-criada aparecer no popup sem remontar o editor.
    let titles: string[] = [];
    const source = wikiLinkCompletionSource(() => titles);
    const state = EditorState.create({ doc: "[[", extensions: [markdownSupport] });
    const context = () => new CompletionContext(state, 2, false);

    expect(source(context())).toBeNull();
    titles = ["Nota nova"];
    expect(
      (source(context()) as CompletionResult).options.map((o) => o.label)
    ).toEqual(["Nota nova"]);
  });
});
