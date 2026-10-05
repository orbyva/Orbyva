import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecurringTable } from "@/pages/admin/finance/components/RecurringTable";
import type { Recurring } from "@/types/recurring";

/**
 * Âncora do link na lista de recorrências (feature 206), com assert na saída real do DOM. Chrome
 * está fora do fluxo, então é este teste que prova o "eu consigo abrir o link sem entrar na
 * edição": href exato, nova aba, e **nada** renderizado quando não há link.
 *
 * `isMobile` é o que separa as duas versões — `RecurringTable` delega para `RecurringTableMobile`.
 */

// A tabela importa `@/api/recurring` por causa dos botões de ação (excluir, arquivar, pagar);
// nenhum deles é clicado aqui, mas o import carregaria o client Supabase.
vi.mock("@/api/recurring", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/api/recurring")>();
  return {
    ...real,
    deleteRecurringApi: vi.fn(),
    softDeleteRecurring: vi.fn(),
    restoreRecurring: vi.fn(),
    updateRecurringParcelPayment: vi.fn(),
  };
});

function recurring(overrides: Partial<Recurring> = {}): Recurring {
  return {
    id: "rec-1",
    class: {
      id: 7,
      name: "Luz",
      type: {
        id: 20,
        name: "Casa",
        hex_color: "#888888",
        lucide_icon: "home",
        nature: { id: 2, name: "Despesa" },
      },
    },
    value: 189.9,
    description: "Luz",
    frequency: "Mensal",
    validity: "2026-12-10",
    due_day: 10,
    installment_count: 3,
    payment_start_date: "2026-10-05",
    status: true,
    created_at: "2026-10-05T12:00:00Z",
    paid_parcels: [],
    ...overrides,
  } as Recurring;
}

function renderTable(item: Recurring, isMobile: boolean) {
  return render(
    <RecurringTable
      recurring={[item]}
      lastPaidAtById={{}}
      isMobile={isMobile}
      sort={{ key: "value", dir: "desc" }}
      onSortChange={vi.fn()}
      confirmOpen={false}
      setConfirmOpen={vi.fn()}
      confirmOpenSoft={false}
      setConfirmOpenSoft={vi.fn()}
      confirmPaymentOpen={false}
      setConfirmPaymentOpen={vi.fn()}
      selectedRecurring={null}
      setSelectedRecurring={vi.fn()}
      selectedParcel={null}
      setSelectedParcel={vi.fn()}
      reloadRecurring={vi.fn(async () => undefined)}
      handleEditRecurring={vi.fn()}
    />
  );
}

describe.each([
  ["desktop", false],
  ["mobile", true],
] as const)("RecurringTable (%s) — âncora do link", (_label, isMobile) => {
  it("com link: âncora com href exato, nova aba e rótulo citando a descrição", () => {
    renderTable(
      recurring({ link_url: "https://www.enel.com.br/pagar" }),
      isMobile
    );

    const anchor = screen.getByRole("link", { name: /Abrir link de Luz/ });
    expect(anchor).toHaveAttribute("href", "https://www.enel.com.br/pagar");
    expect(anchor.getAttribute("target")).toBe("_blank");
    expect(anchor.getAttribute("rel")).toBe("noreferrer");
    expect(anchor).toHaveAttribute("title", "Abrir link");
  });

  it("sem link (null): nenhuma âncora, nenhum ícone órfão", () => {
    renderTable(recurring({ link_url: null }), isMobile);

    expect(screen.queryByRole("link", { name: /Abrir link/ })).toBeNull();
    // E a linha continua renderizando normalmente. `getAllByText`: "Luz" é a descrição **e** o
    // nome da subcategoria na fixture, então aparece mais de uma vez por linha.
    expect(screen.getAllByText("Luz").length).toBeGreaterThan(0);
  });

  it("só espaços: nenhuma âncora (prova o ?.trim() da condição)", () => {
    renderTable(recurring({ link_url: "   " }), isMobile);

    expect(screen.queryByRole("link", { name: /Abrir link/ })).toBeNull();
  });

  it("arquivada com link: a âncora aparece e a legenda segue abaixo do nome", () => {
    renderTable(
      recurring({ status: false, link_url: "https://www.enel.com.br/pagar" }),
      isMobile
    );

    expect(
      screen.getByRole("link", { name: /Abrir link de Luz/ })
    ).toHaveAttribute("href", "https://www.enel.com.br/pagar");
    expect(screen.getByText("Arquivada")).toBeTruthy();
  });
});
