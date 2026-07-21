import { describe, expect, it } from "vitest";
import {
  parseFinanceDate,
  parseFinanceImportCsv,
  parseFinanceValue,
  resolveFinanceImportRows,
} from "@/lib/financeImport";
import type { Class } from "@/types/finance";

describe("financeImport", () => {
  it("parses BR and ISO values/dates", () => {
    expect(parseFinanceValue("1.234,56")).toBe(1234.56);
    expect(parseFinanceValue("150.90")).toBe(150.9);
    expect(parseFinanceDate("2026-01-15")).toBe("2026-01-15");
    expect(parseFinanceDate("15/01/2026")).toBe("2026-01-15");
  });

  it("parses FinTrack export headers", () => {
    const csv = [
      "id,data,descricao,valor,classe,tipo,natureza",
      ",2026-02-01,Café,12.5,Café,Alimentação,Despesa",
      ",01/03/2026,Salário,\"3500,00\",Salário,Renda,Receita",
    ].join("\n");

    const result = parseFinanceImportCsv(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].descricao).toBe("Café");
    expect(result.rows[0].valor).toBe(12.5);
    expect(result.rows[1].data).toBe("2026-03-01");
    expect(result.rows[1].valor).toBe(3500);
  });

  it("resolves class by name and type", () => {
    const classes = [
      {
        id: 1,
        name: "Mercado",
        type: { id: 10, name: "Alimentação", nature: { id: 1, name: "Despesa" } },
      },
      {
        id: 2,
        name: "Mercado",
        type: { id: 11, name: "Outros", nature: { id: 1, name: "Despesa" } },
      },
    ] as Class[];

    const { ready, errors } = resolveFinanceImportRows(
      [
        {
          data: "2026-01-01",
          descricao: "Compra",
          valor: 10,
          classe: "Mercado",
          tipo: "Alimentação",
          line: 2,
        },
      ],
      classes
    );

    expect(errors).toEqual([]);
    expect(ready[0].classId).toBe(1);
  });
});
