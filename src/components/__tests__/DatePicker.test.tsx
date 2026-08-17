import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InlineCalendarPicker } from "@/components/DatePicker";

/**
 * Cobre a feature 041 — `InlineCalendarPicker` ganhou uma prop `size?: "default" | "compact"`
 * pra reduzir o calendário especificamente no popover de quick-edit de prazo (`TaskDueQuickEdit`),
 * sem afetar o `DatePicker`/form completo. A prova é comparar as classes de tamanho aplicadas
 * (célula de dia, navegação de mês, rodapé) entre os dois modos — não inspeção visual.
 */
describe("InlineCalendarPicker", () => {
  const date = new Date(2026, 7, 14); // 14/08/2026

  function dayButton(container: HTMLElement) {
    const cell = container.querySelector('[data-day="2026-08-14"]');
    expect(cell).not.toBeNull();
    const button = cell!.querySelector("button");
    expect(button).not.toBeNull();
    return button as HTMLButtonElement;
  }

  it("modo default (omitido) preserva as classes atuais de tamanho", () => {
    const { container } = render(
      <InlineCalendarPicker date={date} onSelect={vi.fn()} />
    );

    const day = dayButton(container);
    expect(day.className).toMatch(/(^|\s)size-9(\s|$)/);
    expect(day.className).not.toMatch(/(^|\s)size-7(\s|$)/);

    const prevNav = screen.getByRole("button", { name: "Mês anterior" });
    expect(prevNav.className).toMatch(/(^|\s)size-8(\s|$)/);
    expect(prevNav.className).not.toMatch(/(^|\s)size-7(\s|$)/);

    const today = screen.getByRole("button", { name: "Hoje" });
    expect(today.className).not.toMatch(/(^|\s)h-7(\s|$)/);
  });

  it("modo compact aplica classes de tamanho reduzidas", () => {
    const { container } = render(
      <InlineCalendarPicker date={date} onSelect={vi.fn()} size="compact" />
    );

    const day = dayButton(container);
    expect(day.className).toMatch(/(^|\s)size-7(\s|$)/);
    expect(day.className).not.toMatch(/(^|\s)size-9(\s|$)/);

    const prevNav = screen.getByRole("button", { name: "Mês anterior" });
    expect(prevNav.className).toMatch(/(^|\s)size-7(\s|$)/);
    expect(prevNav.className).not.toMatch(/(^|\s)size-8(\s|$)/);

    const today = screen.getByRole("button", { name: "Hoje" });
    expect(today.className).toMatch(/(^|\s)h-7(\s|$)/);
  });

  it("modo compact não muda o modo default de instâncias irmãs (sem estado global vazado)", () => {
    const { container: defaultContainer } = render(
      <InlineCalendarPicker date={date} onSelect={vi.fn()} />
    );
    const { container: compactContainer } = render(
      <InlineCalendarPicker date={date} onSelect={vi.fn()} size="compact" />
    );

    expect(dayButton(defaultContainer).className).toMatch(/(^|\s)size-9(\s|$)/);
    expect(dayButton(compactContainer).className).toMatch(/(^|\s)size-7(\s|$)/);
  });
});
