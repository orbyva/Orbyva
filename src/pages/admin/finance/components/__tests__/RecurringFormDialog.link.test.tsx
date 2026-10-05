import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecurringFormDialog } from "@/pages/admin/finance/components/RecurringFormDialog";
import type { Dimension } from "@/types/dimensions";
import type { RecurringCreateRequest } from "@/types/recurring";

/**
 * Campo "Link" do formulário de recorrência (feature 206), com assert na saída real: o que chega em
 * `createRecurring`. Sem navegador — é este teste que prova que o link vai **normalizado** ao banco,
 * que vazio vira `null` (em vez de string vazia, que deixaria "apagou o link" ambíguo), que URL sem
 * protocolo barra o submit, e que a edição mostra o link já salvo.
 */

// `ClassSearchPicker` importa `@/api/finance` (rede) e o toast; o dialog aberto não deve tocar nada
// disso num ambiente jsdom.
vi.mock("@/api/finance", () => ({
  fetchMostUsedClassIds: vi.fn(async () => [] as number[]),
  createClassApi: vi.fn(),
  createTypeApi: vi.fn(),
}));

const dimensions: Dimension[] = [
  {
    id: 2,
    name: "Despesa",
    types: [
      {
        id: 20,
        name: "Casa",
        hex_color: "#888888",
        lucide_icon: "home",
        classes: [{ id: 7, name: "Luz" }],
      },
    ],
  },
];

/** Recorrência válida para o submit passar de todas as outras validações de `handleCreate`. */
function validRecurring(
  overrides: Partial<RecurringCreateRequest> = {}
): RecurringCreateRequest {
  return {
    class_id: 7,
    value: 189.9,
    description: "Luz",
    frequency: "Mensal",
    validity: "2026-12-10",
    due_day: 10,
    installment_count: 3,
    payment_start_date: "2026-10-05",
    status: true,
    link_url: null,
    ...overrides,
  };
}

/**
 * O dialog é controlado de fora (`newRecurring` + `setNewRecurring`), então o teste precisa de um
 * dono do estado — sem ele, digitar no campo não mudaria nada.
 */
function Harness({
  initial,
  createRecurring,
}: {
  initial: RecurringCreateRequest;
  createRecurring: (rec?: RecurringCreateRequest) => void;
}) {
  const [newRecurring, setNewRecurring] = useState(initial);
  return (
    <RecurringFormDialog
      open
      setOpen={() => undefined}
      newRecurring={newRecurring}
      setNewRecurring={setNewRecurring}
      createRecurring={createRecurring}
      isEditing={false}
      onClose={() => undefined}
      dimensions={dimensions}
      trigger={false}
    />
  );
}

function linkInput(): HTMLInputElement {
  return screen.getByLabelText(/Link/) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RecurringFormDialog — campo Link", () => {
  it("grava normalizado: espaços em volta da URL não chegam ao payload", async () => {
    const user = userEvent.setup();
    const createRecurring = vi.fn();
    render(
      <Harness initial={validRecurring()} createRecurring={createRecurring} />
    );

    await user.type(linkInput(), "  https://nubank.com.br/pagar  ");
    await user.click(screen.getByRole("button", { name: "Salvar recorrência" }));

    expect(createRecurring).toHaveBeenCalledTimes(1);
    expect(createRecurring.mock.calls[0][0]).toMatchObject({
      description: "Luz",
      link_url: "https://nubank.com.br/pagar",
    });
  });

  it("campo vazio vira link_url: null (chave presente, valor nulo)", async () => {
    const user = userEvent.setup();
    const createRecurring = vi.fn();
    render(
      <Harness initial={validRecurring()} createRecurring={createRecurring} />
    );

    expect(linkInput().value).toBe("");
    await user.click(screen.getByRole("button", { name: "Salvar recorrência" }));

    expect(createRecurring).toHaveBeenCalledTimes(1);
    const payload = createRecurring.mock.calls[0][0] as RecurringCreateRequest;
    expect("link_url" in payload).toBe(true);
    expect(payload.link_url).toBeNull();
  });

  it("URL sem protocolo barra o submit com \"Comece com https://\"", async () => {
    const user = userEvent.setup();
    const createRecurring = vi.fn();
    render(
      <Harness initial={validRecurring()} createRecurring={createRecurring} />
    );

    await user.type(linkInput(), "nubank.com.br");
    await user.click(screen.getByRole("button", { name: "Salvar recorrência" }));

    // `errorSummary` do `FormDialogShell` — a faixa vermelha no topo, com role="alert".
    expect(screen.getByRole("alert")).toHaveTextContent("Comece com https://");
    expect(createRecurring).not.toHaveBeenCalled();
  });

  it("só espaços no campo salvam como link vazio, sem erro", async () => {
    const user = userEvent.setup();
    const createRecurring = vi.fn();
    render(
      <Harness initial={validRecurring()} createRecurring={createRecurring} />
    );

    await user.type(linkInput(), "   ");
    await user.click(screen.getByRole("button", { name: "Salvar recorrência" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(createRecurring).toHaveBeenCalledTimes(1);
    expect(
      (createRecurring.mock.calls[0][0] as RecurringCreateRequest).link_url
    ).toBeNull();
  });

  it("edição carrega o link já salvo no campo", async () => {
    render(
      <Harness
        initial={validRecurring({ link_url: "https://www.enel.com.br/pagar" })}
        createRecurring={vi.fn()}
      />
    );

    // `findBy*` em vez de `getBy*`: deixa o efeito assíncrono do `ClassSearchPicker` assentar
    // dentro de `act`, senão o React avisa sobre update fora de `act` no fim do teste.
    const input = (await screen.findByLabelText(/Link/)) as HTMLInputElement;
    expect(input.value).toBe("https://www.enel.com.br/pagar");
  });
});
