import { describe, expect, it } from "vitest";
import { parseAgentMessage } from "@/lib/agent-message-parser";

describe("parseAgentMessage", () => {
  it("parses four-section structured response", () => {
    const content = `**Resumo:**
Despesas de R$ 8.420,00 em julho.

**Detalhamento:**
Concentração na Natureza Despesa · Tipo Operacional · Classe Internet.

**Ponto de atenção:**
Custos fixos altos.

**Recomendação:**
Acompanhe mês a mês.`;

    const sections = parseAgentMessage(content);
    expect(sections).toHaveLength(4);
    expect(sections[0].id).toBe("resumo");
    expect(sections[1].id).toBe("detalhamento");
    expect(sections[2].id).toBe("atencao");
    expect(sections[3].id).toBe("recomendacao");
    expect(sections[0].content).toContain("R$ 8.420,00");
  });

  it("returns plain section for unstructured text", () => {
    const sections = parseAgentMessage("Resposta simples sem seções.");
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe("plain");
  });
});
