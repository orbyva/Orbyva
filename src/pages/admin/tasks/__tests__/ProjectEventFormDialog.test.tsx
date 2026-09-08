import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectEventFormDialog } from "@/pages/admin/tasks/ProjectEventFormDialog";
import type { Project } from "@/types/tasks";

/**
 * Feature 103 — o formulário de evento, isolado da Agenda.
 *
 * A grade (`AgendaGrid`) é testada à parte; aqui o interesse é o contrato do dialog: o payload que
 * ele devolve, o que ele **não** deixa salvar, e as duas travas que a feature pediu por escrito
 * (envio duplo e o aviso da cópia recebida por convite).
 */

const PROJETO: Project = { id: "p-1", name: "Alpha", status: "active", tag_ids: [] };

function renderDialog(props: Partial<Parameters<typeof ProjectEventFormDialog>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <ProjectEventFormDialog
      open
      onOpenChange={() => {}}
      projects={[PROJETO]}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { ...utils, onSubmit };
}

async function preencher(
  user: ReturnType<typeof userEvent.setup>,
  {
    title = "Reunião",
    date = "2026-09-02",
    start = "15:00",
    end = "",
  }: { title?: string; date?: string; start?: string; end?: string } = {}
) {
  if (title) await user.type(screen.getByLabelText(/^Título/), title);
  if (date) await user.type(screen.getByLabelText(/^Data/), date);
  if (start) await user.type(screen.getByLabelText(/^Início/), start);
  if (end) await user.type(screen.getByLabelText(/^Fim/), end);
}

describe("ProjectEventFormDialog — salvar (feature 103)", () => {
  it("título + data + horário devolvem o payload em hora local, com ends_at nulo", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await preencher(user);
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      project_id: null,
      title: "Reunião",
      // 15h no relógio do usuário, não 15h UTC — a suíte roda em qualquer fuso.
      starts_at: new Date(2026, 8, 2, 15, 0).toISOString(),
      ends_at: null,
    });
  });

  it("com hora de fim, ends_at vai preenchido", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await preencher(user, { end: "16:30" });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ ends_at: new Date(2026, 8, 2, 16, 30).toISOString() })
    );
  });

  it("escolher um projeto manda o project_id; sem escolher, fica null", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await preencher(user);
    await user.click(screen.getByRole("option", { name: "Alpha" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ project_id: "p-1" }));
  });

  it("`initial` pré-preenche o formulário — é como o `+` de um dia passa a data", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog({ initial: { date: "2026-09-10" } });

    expect(screen.getByLabelText(/^Data/)).toHaveValue("2026-09-10");
    await preencher(user, { date: "" });
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ starts_at: new Date(2026, 8, 10, 15, 0).toISOString() })
    );
  });
});

describe("ProjectEventFormDialog — o que não salva (feature 103)", () => {
  it("título só com espaços não salva", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await preencher(user, { title: "   " });
    const salvar = screen.getByRole("button", { name: "Salvar" });
    expect(salvar).toBeDisabled();
    await user.click(salvar);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Informe um título.")).toBeInTheDocument();
  });

  it("fim antes do início mostra erro inline e não chama onSubmit", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    await preencher(user, { end: "14:00" });

    expect(screen.getByText("A hora de fim precisa ser depois do início.")).toBeInTheDocument();
    const salvar = screen.getByRole("button", { name: "Salvar" });
    expect(salvar).toBeDisabled();
    await user.click(salvar);
    expect(onSubmit).not.toHaveBeenCalled();

    // Corrigido, o erro some e o salvar volta.
    await user.clear(screen.getByLabelText(/^Fim/));
    await user.type(screen.getByLabelText(/^Fim/), "16:00");
    expect(
      screen.queryByText("A hora de fim precisa ser depois do início.")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("dialog recém-aberto não cobra nada, mas já nasce com o Salvar travado", () => {
    renderDialog();

    expect(screen.queryByText("Informe um título.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });
});

describe("ProjectEventFormDialog — trava de envio duplo (feature 103)", () => {
  it("clique duplo no Salvar cria um evento só", async () => {
    const user = userEvent.setup();
    let liberar!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          liberar = () => resolve();
        })
    );
    render(
      <ProjectEventFormDialog
        open
        onOpenChange={() => {}}
        projects={[PROJETO]}
        onSubmit={onSubmit}
      />
    );

    await preencher(user);
    const salvar = screen.getByRole("button", { name: "Salvar" });
    await user.click(salvar);

    // Enquanto o envio está em voo, o botão e os campos ficam travados.
    expect(await screen.findByRole("button", { name: "Salvando…" })).toBeDisabled();
    expect(screen.getByLabelText(/^Título/)).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Salvando…" }));

    liberar();
    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectEventFormDialog — cópia recebida por convite (features 076/103)", () => {
  it("em edição, avisa que a alteração não volta para quem convidou", () => {
    renderDialog({
      mode: "edit",
      receivedByInvite: true,
      initial: { title: "Reunião do anfitrião", date: "2026-09-02", startTime: "10:00" },
    });

    expect(screen.getByText(/não volta para quem convidou/i)).toBeInTheDocument();
    // Continua editável: bloquear esconderia que a cópia é do próprio usuário.
    expect(screen.getByLabelText(/^Título/)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("evento próprio não mostra o aviso", () => {
    renderDialog({
      mode: "edit",
      initial: { title: "Reunião", date: "2026-09-02", startTime: "10:00", projectId: "p-1" },
    });

    expect(screen.queryByText(/não volta para quem convidou/i)).not.toBeInTheDocument();
    expect(screen.getByText("Editar evento")).toBeInTheDocument();
  });
});
