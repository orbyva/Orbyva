import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedicationQuickCreateDialog } from "@/pages/admin/health/MedicationQuickCreateDialog";
import { createMedicationWithDoses, updateMedication } from "@/api/health/medications";
import { pickDate } from "@/test/pickDate";
import type { Medication } from "@/types/health";
import type { Task } from "@/types/tasks";

/**
 * O dialog depois da 064: o que ele cria é uma linha em `medication` (posologia, N horários,
 * período), não mais uma tarefa recorrente com um horário só como na 049. Cobre validação, o
 * payload enviado, a lista de horários (adicionar/remover, mínimo um), o modo edição e — desde a
 * reabertura de 2026-08-18 — o retorno visível da integração com as tarefas: o toast diz quantas
 * doses viraram tarefa e oferece "Ver na agenda".
 */

vi.mock("@/api/health/medications", () => ({
  createMedicationWithDoses: vi.fn(),
  updateMedication: vi.fn(),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

// `useNavigate` mockado (em vez de um `MemoryRouter` em volta) para a navegação da ação do toast
// ser assertável: o que importa é para onde ela leva, não a árvore de rotas.
const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));

const mockedCreate = vi.mocked(createMedicationWithDoses);
const mockedUpdate = vi.mocked(updateMedication);

/** Retorno de `createMedicationWithDoses`: o tratamento + as doses que já viraram tarefa. */
function created(doseCount = 0) {
  const doses = Array.from({ length: doseCount }, (_, i) => ({
    id: `dose-${i + 1}`,
    medication_id: "med-1",
  })) as Task[];
  return { medication: { id: "med-1" } as Medication, doses };
}

/** A última chamada de `toast`, para inspecionar descrição e ação. */
function lastToast() {
  return toastMock.mock.calls.at(-1)![0] as {
    title: string;
    description?: string;
    action?: { props: { children: string; onClick: () => void } };
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 7, 17, 9, 0, 0));
  toastMock.mockReset();
  navigateMock.mockReset();
  mockedCreate.mockReset();
  mockedUpdate.mockReset();
});

describe("MedicationQuickCreateDialog", () => {
  it("botão Criar começa desabilitado sem nome nem horário", () => {
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
  });

  it("preencher só o nome mantém o botão desabilitado (falta horário)", async () => {
    const user = userEvent.setup();
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );
    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    expect(screen.getByRole("button", { name: "Criar" })).toBeDisabled();
  });

  it("nome + horário criam o tratamento com início hoje e cadência diária", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created());
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    const saveButton = screen.getByRole("button", { name: "Criar" });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(mockedCreate).toHaveBeenCalledWith({
      name: "Losartana",
      dose_amount: null,
      dose_unit: null,
      instructions: null,
      times: ["08:00"],
      interval_days: 1,
      started_on: "2026-08-17",
      ended_on: null,
    });
    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("dois horários no mesmo tratamento — o gap que a 049 não cobria", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created());
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: /Adicionar horário/ }));
    await user.type(screen.getByLabelText("Horário 2"), "20:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ times: ["08:00", "20:00"] })
    );
  });

  it("remover horário tira o campo, e o último não pode ser removido", async () => {
    const user = userEvent.setup();
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    // Com um horário só não há botão de remover — a medicação precisa de ao menos um.
    expect(screen.queryByRole("button", { name: /Remover horário/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Adicionar horário/ }));
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.type(screen.getByLabelText("Horário 2"), "20:00");
    expect(screen.getAllByRole("button", { name: /Remover horário/ })).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Remover horário 2" }));
    expect(screen.queryByLabelText("Horário 2")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remover horário/ })).toBeNull();
  });

  it("posologia, instruções e término entram no payload", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created());
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Amoxicilina");
    await user.type(screen.getByLabelText("Horário 1"), "09:30");
    await user.type(screen.getByLabelText(/Quantidade/), "2");
    await user.type(screen.getByLabelText(/Unidade/), "comprimidos");
    await user.type(screen.getByLabelText(/Instruções/), "em jejum");
    await user.click(screen.getByRole("radio", { name: "Termina em" }));
    await pickDate(user, "Data de término", "2026-08-24");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Amoxicilina",
        dose_amount: 2,
        dose_unit: "comprimidos",
        instructions: "em jejum",
        ended_on: "2026-08-24",
      })
    );
  });

  it("frequência 'A cada X dias' vira interval_days", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created());
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Antibiótico");
    await user.type(screen.getByLabelText("Horário 1"), "09:30");
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "A cada X dias" }));

    const intervalInput = screen.getByLabelText(/A cada quantos dias/);
    await user.clear(intervalInput);
    await user.type(intervalInput, "3");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ interval_days: 3 })
    );
  });

  // ---- feature 096: "sem limite" deixa de ser um campo vazio e vira um estado afirmativo -------

  it("'Uso contínuo' vem pré-selecionado e o campo de data nem existe", async () => {
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    expect(screen.getByRole("radio", { name: "Uso contínuo" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Termina em" })).not.toBeChecked();
    expect(screen.queryByLabelText("Data de término")).toBeNull();
  });

  it("criar com 'Uso contínuo' manda ended_on: null", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created());
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ended_on: null })
    );
  });

  it("alternar de 'Termina em' para 'Uso contínuo' limpa a data no payload", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created());
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Amoxicilina");
    await user.type(screen.getByLabelText("Horário 1"), "09:30");
    await user.click(screen.getByRole("radio", { name: "Termina em" }));
    await pickDate(user, "Data de término", "2026-08-24");

    await user.click(screen.getByRole("radio", { name: "Uso contínuo" }));
    // O campo some junto com a escolha — não fica uma data escondida contando outra história.
    expect(screen.queryByLabelText("Data de término")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ended_on: null })
    );
  });

  it("'Termina em' sem data não salva e mostra o erro no campo", async () => {
    const user = userEvent.setup();
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Amoxicilina");
    await user.type(screen.getByLabelText("Horário 1"), "09:30");
    await user.click(screen.getByRole("radio", { name: "Termina em" }));
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).not.toHaveBeenCalled();
    // A mensagem diz o que fazer, e é anunciada — nada de `alert()`.
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Escolha a data de término ou marque “Uso contínuo”."
    );
    expect(screen.getByLabelText("Data de término")).toHaveAttribute("aria-invalid", "true");
  });

  it("término anterior ao início é barrado com mensagem própria", async () => {
    const user = userEvent.setup();
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Amoxicilina");
    await user.type(screen.getByLabelText("Horário 1"), "09:30");
    await user.click(screen.getByRole("radio", { name: "Termina em" }));
    // Início é hoje (17/08) por padrão.
    await pickDate(user, "Data de término", "2026-08-10");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "O término precisa ser igual ou posterior ao início."
    );
  });

  it("corrigir a data faz o erro sumir e o tratamento salvar", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created());
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Amoxicilina");
    await user.type(screen.getByLabelText("Horário 1"), "09:30");
    await user.click(screen.getByRole("radio", { name: "Termina em" }));
    await user.click(screen.getByRole("button", { name: "Criar" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await pickDate(user, "Data de término", "2026-08-24");
    expect(screen.queryByRole("alert")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Criar" }));
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ended_on: "2026-08-24" })
    );
  });

  it("erro ao criar mostra toast e não fecha o dialog", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(new Error("Falhou"));
    const onOpenChange = vi.fn();
    render(
      <MedicationQuickCreateDialog open onOpenChange={onOpenChange} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", description: "Falhou", variant: "destructive" })
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

/**
 * Reabertura de 2026-08-18 — "a integração da criação de um remédio para tomar, com as tarefas,
 * que vão identificar": o modelo já criava as doses como `task`, mas a tela não dizia nada. Estes
 * casos cobrem o retorno visível disso.
 */
describe("MedicationQuickCreateDialog — retorno da integração com as tarefas", () => {
  it("dois horários hoje → o toast conta as 2 doses e oferece 'Ver na agenda'", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created(2));
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: /Adicionar horário/ }));
    await user.type(screen.getByLabelText("Horário 2"), "20:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    const shown = lastToast();
    expect(shown.title).toBe("Medicação criada!");
    expect(shown.description).toBe("2 doses já entraram na sua agenda como tarefas.");
    expect(shown.action?.props.children).toBe("Ver na agenda");

    // A ação leva mesmo para a agenda de tarefas — é o elo remédio → tarefa que o pedido cobra.
    shown.action!.props.onClick();
    expect(navigateMock).toHaveBeenCalledWith("/tasks/agenda");
  });

  it("uma dose só é contada no singular", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created(1));
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(lastToast().description).toBe("1 dose já entrou na sua agenda como tarefa.");
  });

  it("tratamento que começa no futuro: nenhuma dose ainda, e nenhuma ação para a agenda", async () => {
    const user = userEvent.setup();
    mockedCreate.mockResolvedValue(created(0));
    render(
      <MedicationQuickCreateDialog open onOpenChange={() => {}} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Amoxicilina");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    // `Início` é um DatePicker (botão), não um input — clear/type quebram.
    await pickDate(user, /^Início/, "2026-09-01");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    const shown = lastToast();
    expect(shown.description).toBe(
      "Nenhuma dose venceu ainda — elas entram na sua agenda a partir do início do tratamento."
    );
    // Sem dose criada, "Ver na agenda" levaria a uma tela sem nada do remédio.
    expect(shown.action).toBeUndefined();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("editar não promete dose nenhuma — só criar materializa", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue(undefined);
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={
          {
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
          } as Medication
        }
      />
    );

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const shown = lastToast();
    expect(shown.title).toBe("Medicação atualizada!");
    expect(shown.description).toBeUndefined();
    expect(shown.action).toBeUndefined();
  });

  it("erro ao criar não promete dose nenhuma", async () => {
    const user = userEvent.setup();
    mockedCreate.mockRejectedValue(new Error("Falhou"));
    const onOpenChange = vi.fn();
    render(
      <MedicationQuickCreateDialog open onOpenChange={onOpenChange} onCreated={() => {}} />
    );

    await user.type(screen.getByLabelText(/Nome do remédio/), "Losartana");
    await user.type(screen.getByLabelText("Horário 1"), "08:00");
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Erro", description: "Falhou", variant: "destructive" })
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // O caminho de erro não pode mandar ninguém "ver na agenda" uma dose que não existe.
    expect(lastToast().action).toBeUndefined();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe("MedicationQuickCreateDialog — modo edição", () => {
  const existing: Medication = {
    id: "med-1",
    name: "Losartana",
    dose_amount: 2,
    dose_unit: "comprimidos",
    instructions: "em jejum",
    // O Postgres devolve `time` com segundos; o `<input type="time">` precisa de HH:MM.
    times: ["08:00:00", "20:00:00"],
    interval_days: 3,
    started_on: "2026-08-10",
    ended_on: null,
    active: true,
  };

  it("carrega o tratamento existente nos campos, com os horários já em HH:MM", () => {
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={existing}
      />
    );

    expect(screen.getByText("Editar medicação")).toBeInTheDocument();
    expect(screen.getByLabelText(/Nome do remédio/)).toHaveValue("Losartana");
    expect(screen.getByLabelText("Horário 1")).toHaveValue("08:00");
    expect(screen.getByLabelText("Horário 2")).toHaveValue("20:00");
    expect(screen.getByLabelText(/A cada quantos dias/)).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Início — 10/08/2026" })).toBeInTheDocument();
    // Sem `ended_on`, o tratamento abre afirmando que é contínuo (feature 096).
    expect(screen.getByRole("radio", { name: "Uso contínuo" })).toBeChecked();
  });

  it("tratamento com término abre em 'Termina em', com a data preenchida", () => {
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={{ ...existing, ended_on: "2026-08-25" }}
      />
    );

    expect(screen.getByRole("radio", { name: "Termina em" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Data de término — 25/08/2026" })).toBeInTheDocument();
  });

  it("tirar o término de um tratamento existente manda ended_on: null", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue(undefined);
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={{ ...existing, ended_on: "2026-08-25" }}
      />
    );

    await user.click(screen.getByRole("radio", { name: "Uso contínuo" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "med-1", ended_on: null })
    );
  });

  it("salvar chama updateMedication com o id, não cria outro tratamento", async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue(undefined);
    render(
      <MedicationQuickCreateDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
        medication={existing}
      />
    );

    await user.clear(screen.getByLabelText(/Quantidade/));
    await user.type(screen.getByLabelText(/Quantidade/), "1");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "med-1",
        dose_amount: 1,
        times: ["08:00", "20:00"],
        interval_days: 3,
      })
    );
  });
});
