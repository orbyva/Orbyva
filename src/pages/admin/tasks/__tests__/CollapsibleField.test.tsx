import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleField } from "@/pages/admin/tasks/CollapsibleField";

/**
 * Feature 080 — o gatilho de uma linha que faz Descrição/Subtarefas/Registros caberem no painel.
 * O ponto delicado é o filho continuar **montado** ao fechar: fechar a Descrição no meio da
 * digitação não pode apagar o que foi escrito.
 */
describe("CollapsibleField", () => {
  it("começa fechado: o gatilho anuncia aria-expanded=false e o filho não está acessível", () => {
    render(
      <CollapsibleField label="Descrição">
        <input aria-label="Texto" />
      </CollapsibleField>
    );

    const trigger = screen.getByRole("button", { name: /Descrição/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Texto" })).not.toBeInTheDocument();
  });

  it("`defaultOpen` abre já expandido", () => {
    render(
      <CollapsibleField label="Descrição" defaultOpen>
        <input aria-label="Texto" />
      </CollapsibleField>
    );

    expect(screen.getByRole("button", { name: /Descrição/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("textbox", { name: "Texto" })).toBeVisible();
  });

  it("o gatilho aponta para o painel por aria-controls", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleField label="Descrição">
        <input aria-label="Texto" />
      </CollapsibleField>
    );

    const trigger = screen.getByRole("button", { name: /Descrição/ });
    const contentId = trigger.getAttribute("aria-controls");
    expect(contentId).toBeTruthy();
    const content = document.getElementById(contentId as string);
    expect(content).not.toBeNull();
    expect(content).toContainElement(screen.queryByLabelText("Texto"));

    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "Texto" })).toBeVisible();
  });

  it("abre no clique", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleField label="Subtarefas">
        <input aria-label="Nova subtarefa" />
      </CollapsibleField>
    );

    await user.click(screen.getByRole("button", { name: /Subtarefas/ }));

    expect(screen.getByRole("textbox", { name: "Nova subtarefa" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Subtarefas/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("abre no Enter e no Espaço, com o foco no gatilho", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleField label="Subtarefas">
        <input aria-label="Nova subtarefa" />
      </CollapsibleField>
    );

    const trigger = screen.getByRole("button", { name: /Subtarefas/ });
    await user.tab();
    expect(trigger).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Nova subtarefa" })).toBeVisible();
  });

  it("o resumo aparece no gatilho quando há conteúdo, e some quando não há", () => {
    const { rerender } = render(
      <CollapsibleField label="Descrição" summary="Comprar os ingredientes da receita">
        <input aria-label="Texto" />
      </CollapsibleField>
    );

    expect(screen.getByText("Comprar os ingredientes da receita")).toBeInTheDocument();

    rerender(
      <CollapsibleField label="Descrição" summary={null}>
        <input aria-label="Texto" />
      </CollapsibleField>
    );

    expect(screen.queryByText("Comprar os ingredientes da receita")).not.toBeInTheDocument();
  });

  it("fechar não desmonta o filho: o texto digitado sobrevive a fechar e abrir de novo", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleField label="Descrição">
        <input aria-label="Texto" />
      </CollapsibleField>
    );

    const trigger = screen.getByRole("button", { name: /Descrição/ });
    await user.click(trigger);
    await user.type(screen.getByRole("textbox", { name: "Texto" }), "rascunho");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Texto" })).not.toBeInTheDocument();
    // Continua no DOM, só escondido — é isso que preserva o estado do React.
    expect(screen.getByLabelText("Texto")).toHaveValue("rascunho");

    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "Texto" })).toHaveValue("rascunho");
  });
});
