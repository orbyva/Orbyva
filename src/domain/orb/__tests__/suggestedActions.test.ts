import { describe, expect, it } from "vitest";
import { buildSuggestedActionMessage } from "@/domain/orb/suggestedActions";

describe("buildSuggestedActionMessage", () => {
  it("usa o título quando presente nos args", () => {
    expect(
      buildSuggestedActionMessage({
        action: "similar_movies",
        args: { title: "Gente Grande 2" },
      })
    ).toBe("Sugira filmes parecidos com Gente Grande 2");
  });

  it("cai num texto genérico sem o título", () => {
    expect(
      buildSuggestedActionMessage({ action: "recommend_friend" })
    ).toBe("Quero recomendar isso pra um amigo");
  });

  it("rate_more ignora args", () => {
    expect(buildSuggestedActionMessage({ action: "rate_more" })).toBe(
      "Quero avaliar mais itens da minha lista"
    );
  });

  it("ação desconhecida retorna null em vez de quebrar", () => {
    expect(
      buildSuggestedActionMessage({
        // @ts-expect-error - simula action fora do enum vindo de fonte não confiável
        action: "delete_everything",
      })
    ).toBeNull();
  });
});
