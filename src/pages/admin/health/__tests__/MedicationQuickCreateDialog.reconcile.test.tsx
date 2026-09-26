import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedicationQuickCreateDialog } from "@/pages/admin/health/MedicationQuickCreateDialog";
import type { Medication } from "@/types/health";

/**
 * Feature 074 — o caminho de UI da reconciliação de doses, ponta a ponta e sem navegador.
 *
 * Ao contrário de `MedicationQuickCreateDialog.test.tsx`, aqui a API **não** é mockada: o dialog
 * chama o `updateMedication` de verdade contra um Supabase falso que executa filtros e guarda as
 * linhas. É o que prova que trocar o horário pelo formulário não deixa a dose do horário antigo no
 * calendário — a duplicação de linha do mecanismo 2.
 */

type AnyRow = Record<string, unknown>;

const { store } = vi.hoisted(() => ({
  store: {
    medication: [] as AnyRow[],
    task: [] as AnyRow[],
  },
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: vi.fn(async () => "user-1"),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

vi.mock("@/lib/supabase", () => {
  function tableRows(table: string): AnyRow[] {
    if (table === "medication") return store.medication;
    if (table === "task") return store.task;
    throw new Error(`tabela inesperada no teste: ${table}`);
  }

  function makeBuilder(table: string) {
    let rows = [...tableRows(table)];
    let patch: AnyRow | null = null;
    let deleting = false;

    const builder = {
      select: () => builder,
      order: () => builder,
      eq(column: string, value: unknown) {
        rows = rows.filter((row) => row[column] === value);
        if (patch) for (const row of rows) Object.assign(row, patch);
        return builder;
      },
      in(column: string, values: unknown[]) {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      update(fields: AnyRow) {
        patch = fields;
        return builder;
      },
      delete() {
        deleting = true;
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve: (value: unknown) => unknown) {
        if (deleting) {
          deleting = false;
          const alvo = tableRows(table);
          for (const row of rows) {
            const at = alvo.indexOf(row);
            if (at >= 0) alvo.splice(at, 1);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      },
    };
    return builder;
  }

  return { supabase: { from: (table: string) => makeBuilder(table) } };
});

/** Tratamento diário das 08:00, começado em 10/08. Hoje é 17/08/2026. */
const existing: Medication = {
  id: "med-1",
  name: "Losartana",
  dose_amount: null,
  dose_unit: null,
  instructions: null,
  times: ["08:00:00"],
  interval_days: 1,
  started_on: "2026-08-10",
  ended_on: null,
  active: true,
};

function dose(overrides: AnyRow): AnyRow {
  return {
    user_id: "user-1",
    medication_id: "med-1",
    title: "Losartana",
    status: "todo",
    completed_at: null,
    dose_time: "08:00:00",
    is_medication: true,
    is_quick: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 17, 9, 0, 0));
  toastMock.mockReset();
  store.medication = [{ ...existing, user_id: "user-1" }];
  store.task = [
    dose({ id: "ontem", due_date: "2026-08-16", status: "done", completed_at: "2026-08-16T08:02:00Z" }),
    dose({ id: "hoje", due_date: "2026-08-17" }),
    dose({ id: "amanha", due_date: "2026-08-18" }),
    dose({ id: "depois", due_date: "2026-08-19" }),
  ];
});

describe("MedicationQuickCreateDialog — trocar o horário reconcilia as doses (feature 074)", () => {
  it("as doses futuras do horário antigo somem; passado, hoje e a tomada ficam", async () => {
    const user = userEvent.setup();
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={existing}
      />
    );

    const horario = screen.getByLabelText("Horário 1");
    expect(horario).toHaveValue("08:00");
    await user.clear(horario);
    await user.type(horario, "09:00");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    // O tratamento guardou o horário novo...
    await waitFor(() => expect(store.medication[0].times).toEqual(["09:00"]));
    // ...e as doses futuras das 08:00 não ficaram no calendário ao lado das novas.
    expect(store.task.map((row) => row.id)).toEqual(["ontem", "hoje"]);
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" })
    );
  });

  it("salvar sem mexer no cronograma não apaga dose nenhuma", async () => {
    const user = userEvent.setup();
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={existing}
      />
    );

    await user.type(screen.getByLabelText(/Instruções/), "em jejum");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(store.medication[0].instructions).toBe("em jejum"));
    expect(store.task.map((row) => row.id)).toEqual(["ontem", "hoje", "amanha", "depois"]);
  });
});
