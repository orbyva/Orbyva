import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskDueShortcuts } from "@/pages/admin/tasks/TaskDueShortcuts";

/**
 * Feature 083 — atalhos de prazo do formulário de tarefa. O componente é a **inversa** de
 * `bucketForDueDate`, então todos os casos usam um "hoje" fixo e conferem a ISO exata que cada
 * botão produz (a regra pura em si está coberta em `src/domain/tasks/__tests__/agenda.test.ts`).
 */

/** Quarta-feira. Semana termina no sábado 22/08; mês, em 31/08. */
const WEDNESDAY = "2026-08-19";
const SATURDAY = "2026-08-22";
const END_OF_MONTH = "2026-08-31";

function renderShortcuts(props: Partial<React.ComponentProps<typeof TaskDueShortcuts>> = {}) {
  const onSelect = vi.fn();
  render(
    <TooltipProvider>
      <TaskDueShortcuts value={null} onSelect={onSelect} todayIso={WEDNESDAY} {...props} />
    </TooltipProvider>
  );
  return { onSelect };
}

const hoje = () => screen.getByRole("button", { name: /^Hoje —/ });
const estaSemana = () => screen.getByRole("button", { name: /^Esta semana —/ });
const esteMes = () => screen.getByRole("button", { name: /^Este mês —/ });

describe("TaskDueShortcuts — os três botões", () => {
  it("mostra os três atalhos com os rótulos dos buckets da agenda, num group nomeado", () => {
    renderShortcuts();
    const group = screen.getByRole("group", { name: "Atalhos de prazo" });
    expect(group).toBeInTheDocument();
    expect(hoje()).toHaveTextContent("Hoje");
    expect(estaSemana()).toHaveTextContent("Esta semana");
    expect(esteMes()).toHaveTextContent("Este mês");
  });

  it("'Hoje' chama onSelect com a data de hoje", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts();
    await user.click(hoje());
    expect(onSelect).toHaveBeenCalledWith(WEDNESDAY);
  });

  it("'Esta semana' chama onSelect com o sábado da semana corrente", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts();
    await user.click(estaSemana());
    expect(onSelect).toHaveBeenCalledWith(SATURDAY);
  });

  it("'Este mês' chama onSelect com o último dia do mês", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts();
    await user.click(esteMes());
    expect(onSelect).toHaveBeenCalledWith(END_OF_MONTH);
  });

  it("cada botão anuncia a data resolvida por extenso (não fica escondida no popover)", () => {
    renderShortcuts();
    expect(estaSemana()).toHaveAccessibleName("Esta semana — sábado, 22/08/2026");
    expect(hoje()).toHaveAccessibleName("Hoje — quarta-feira, 19/08/2026");
    expect(esteMes()).toHaveAccessibleName("Este mês — segunda-feira, 31/08/2026");
  });

  it("sem `todayIso`, 'hoje' é o dia real do relógio (não um dia congelado)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 23, 30));
    try {
      const onSelect = vi.fn();
      render(
        <TooltipProvider>
          <TaskDueShortcuts value={null} onSelect={onSelect} />
        </TooltipProvider>
      );
      expect(hoje()).toHaveAccessibleName("Hoje — quarta-feira, 19/08/2026");
      expect(estaSemana()).toHaveAccessibleName("Esta semana — sábado, 22/08/2026");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("TaskDueShortcuts — estado ativo", () => {
  it("prazo igual à data do atalho deixa só ele pressionado", () => {
    renderShortcuts({ value: END_OF_MONTH });
    expect(esteMes()).toHaveAttribute("aria-pressed", "true");
    expect(hoje()).toHaveAttribute("aria-pressed", "false");
    expect(estaSemana()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  it("prazo numa quarta-feira qualquer não pressiona nenhum (o destaque é igualdade, não bucket)", () => {
    renderShortcuts({ value: "2026-08-26" });
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("sem prazo, nenhum botão fica pressionado", () => {
    renderShortcuts({ value: null });
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  it("num sábado, 'Hoje' e 'Esta semana' ficam pressionados juntos (resolvem para o mesmo dia)", () => {
    renderShortcuts({ value: SATURDAY, todayIso: SATURDAY });
    expect(hoje()).toHaveAttribute("aria-pressed", "true");
    expect(estaSemana()).toHaveAttribute("aria-pressed", "true");
    expect(esteMes()).toHaveAttribute("aria-pressed", "false");
  });

  it("clicar num atalho já ativo é no-op — não limpa nem reescreve o prazo", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts({ value: WEDNESDAY });
    expect(hoje()).toHaveAttribute("aria-pressed", "true");
    await user.click(hoje());
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("TaskDueShortcuts — teclado", () => {
  it("os três botões são alcançados por Tab na ordem visual", async () => {
    const user = userEvent.setup();
    renderShortcuts();
    await user.tab();
    expect(hoje()).toHaveFocus();
    await user.tab();
    expect(estaSemana()).toHaveFocus();
    await user.tab();
    expect(esteMes()).toHaveFocus();
  });

  it("Enter dispara onSelect e o foco permanece no botão acionado", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts();
    await user.tab();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(SATURDAY);
    expect(estaSemana()).toHaveFocus();
  });

  it("Espaço dispara onSelect e o foco permanece no botão acionado", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.keyboard("{ }");
    expect(onSelect).toHaveBeenCalledWith(END_OF_MONTH);
    expect(esteMes()).toHaveFocus();
  });
});

describe("TaskDueShortcuts — limite da tarefa-mãe (maxDate)", () => {
  /** Prazo da mãe daqui a 2 dias: sexta 21/08. Sábado (22) e fim do mês (31) o ultrapassam. */
  const PARENT_DUE = "2026-08-21";

  it("atalhos que ultrapassam o prazo da mãe não chamam onSelect", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts({ maxDate: PARENT_DUE });
    await user.click(estaSemana());
    await user.click(esteMes());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("o atalho bloqueado continua focável e anuncia o motivo (aria-disabled, não disabled)", async () => {
    const user = userEvent.setup();
    renderShortcuts({ maxDate: PARENT_DUE });
    expect(estaSemana()).toHaveAttribute("aria-disabled", "true");
    expect(estaSemana()).not.toBeDisabled();
    expect(estaSemana()).toHaveAccessibleName(
      "Esta semana — sábado, 22/08/2026. Passa do prazo da tarefa principal — 21/08/2026"
    );
    await user.tab();
    await user.tab();
    expect(estaSemana()).toHaveFocus();
  });

  it("atalho dentro do limite continua funcionando", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts({ maxDate: PARENT_DUE });
    expect(hoje()).not.toHaveAttribute("aria-disabled");
    await user.click(hoje());
    expect(onSelect).toHaveBeenCalledWith(WEDNESDAY);
  });

  it("o limite é inclusivo: prazo da mãe exatamente no sábado libera 'Esta semana'", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderShortcuts({ maxDate: SATURDAY });
    expect(estaSemana()).not.toHaveAttribute("aria-disabled");
    expect(esteMes()).toHaveAttribute("aria-disabled", "true");
    await user.click(estaSemana());
    expect(onSelect).toHaveBeenCalledWith(SATURDAY);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});
