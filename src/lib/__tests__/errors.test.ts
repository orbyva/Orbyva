import { describe, expect, it } from "vitest";
import { getErrorMessage } from "@/lib/errors";

describe("getErrorMessage", () => {
  it("traduz acesso expirado / 42501", () => {
    expect(getErrorMessage(new Error("Acesso expirado. Assine o Pro"))).toMatch(
      /teste acabou|Pro/i
    );
    expect(getErrorMessage({ message: "42501" })).toMatch(/teste acabou|Pro/i);
    expect(getErrorMessage({ code: "42501", message: "permission denied" })).toMatch(
      /teste acabou|Pro|permissão/i
    );
  });

  it("preserva mensagens amigáveis em português", () => {
    expect(getErrorMessage(new Error("Falhou ao salvar"))).toBe("Falhou ao salvar");
    expect(getErrorMessage(new Error("Convite inválido."))).toBe("Convite inválido.");
  });

  it("traduz rede e auth em inglês", () => {
    expect(getErrorMessage(new Error("Failed to fetch"))).toMatch(/conexão/i);
    expect(getErrorMessage(new Error("Invalid login credentials"))).toMatch(
      /e-mail ou senha/i
    );
    expect(getErrorMessage(new Error("Email not confirmed"))).toMatch(/confirme/i);
    expect(getErrorMessage(new Error("User already registered"))).toMatch(
      /já existe/i
    );
  });

  it("traduz postgres / postgrest técnicos", () => {
    expect(
      getErrorMessage({
        code: "23503",
        message: "update or delete on table violates foreign key constraint",
      })
    ).toMatch(/itens ligados|vinculados/i);
    expect(
      getErrorMessage({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      })
    ).toMatch(/já existe/i);
    expect(
      getErrorMessage(new Error("new row violates row-level security policy"))
    ).toMatch(/permissão/i);
    expect(
      getErrorMessage({
        code: "PGRST116",
        message: "JSON object requested, multiple (or no) rows returned",
      })
    ).toMatch(/não encontrado/i);
  });

  it("preserva mensagem de categoria com subcategorias", () => {
    expect(
      getErrorMessage(
        new Error(
          "Esta categoria ainda tem 2 subcategorias. Exclua ou mova as subcategorias antes de apagar a categoria."
        )
      )
    ).toMatch(/2 subcategorias/i);
  });

  it("esconde config e stack técnicos com fallback", () => {
    expect(
      getErrorMessage(
        new Error("TMDB não configurada. Defina VITE_TMDB_API_KEY no .env."),
        "Catálogo indisponível."
      )
    ).toMatch(/catálogo|indisponível/i);
    expect(
      getErrorMessage(new Error("TypeError: Cannot read properties of null"), "Ops.")
    ).toBe("Ops.");
  });

  it("usa fallback quando mensagem vazia", () => {
    expect(getErrorMessage({}, "Tente de novo.")).toBe("Tente de novo.");
  });
});
