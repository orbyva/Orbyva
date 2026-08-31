import { useState } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  EXTERNAL_LINK_PREVIEW_EMPTY,
  LINK_ICON_RULES_PATH,
  TaskExternalLinksField,
} from "@/pages/admin/tasks/TaskExternalLinksField";
import type { TaskExternalLinkDraft } from "@/types/tasks";

/**
 * Feature 085 — a seção "Links externos" do painel de tarefa: vários links, cada um com o campo
 * livre de comentário, a prévia de como o chip vai sair no card, e a ordem que decide quais links
 * aparecem lá.
 *
 * O componente é controlado, então o harness segura o estado (é o `TaskList.tsx`/`ProjectDetail.tsx`
 * de mentira) e `current()` lê o que o `onChange` emitiu — do mesmo jeito que os testes de
 * `TaskFormFields` leem o `form`.
 */

let current: TaskExternalLinkDraft[] = [];

function Harness({ initial = [] as TaskExternalLinkDraft[] }) {
  const [links, setLinks] = useState<TaskExternalLinkDraft[]>(initial);
  current = links;
  return <TaskExternalLinksField value={links} onChange={setLinks} />;
}

function urlInput(position: string) {
  return screen.getByLabelText(`URL do link ${position}`);
}

function addButton() {
  return screen.getByRole("button", { name: "Adicionar link" });
}

describe("TaskExternalLinksField — lista", () => {
  it("estado vazio explica a seção e oferece adicionar como única ação", () => {
    render(<Harness />);

    expect(screen.getByText(/Nenhum link ainda/)).toBeInTheDocument();
    expect(addButton()).toBeInTheDocument();
    expect(screen.queryByLabelText(/^URL do link/)).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  it("adicionar cria uma linha vazia com position 0 e some com o estado vazio", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(addButton());

    expect(current).toEqual([{ url: "", comment: null, position: 0 }]);
    expect(screen.queryByText(/Nenhum link ainda/)).not.toBeInTheDocument();
    expect(urlInput("1 de 1")).toHaveValue("");
  });

  it("digitar URL e comentário escreve na linha certa, e o comentário vazio vira null", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { url: "https://a.com", comment: null, position: 0 },
          { url: "https://b.com", comment: null, position: 1 },
        ]}
      />
    );

    await user.type(screen.getByLabelText("Comentário do link 2 de 2"), "vale a pena");
    expect(current[1].comment).toBe("vale a pena");
    // A linha 1 não foi tocada.
    expect(current[0].comment).toBeNull();

    await user.clear(screen.getByLabelText("Comentário do link 2 de 2"));
    expect(current[1].comment).toBeNull();
  });

  it("remover tira só a linha pedida e renumera as position", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { url: "https://a.com", comment: "a", position: 0 },
          { url: "https://b.com", comment: "b", position: 1 },
          { url: "https://c.com", comment: "c", position: 2 },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remover link 2 de 3" }));

    expect(current).toEqual([
      { url: "https://a.com", comment: "a", position: 0 },
      { url: "https://c.com", comment: "c", position: 1 },
    ]);
  });

  it("as setas reordenam e reescrevem a position — é ela que decide os chips do card", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { url: "https://a.com", comment: null, position: 0 },
          { url: "https://b.com", comment: null, position: 1 },
          { url: "https://c.com", comment: null, position: 2 },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mover link 3 de 3 para cima" }));
    expect(current.map((d) => [d.url, d.position])).toEqual([
      ["https://a.com", 0],
      ["https://c.com", 1],
      ["https://b.com", 2],
    ]);

    await user.click(screen.getByRole("button", { name: "Mover link 1 de 3 para baixo" }));
    expect(current.map((d) => d.url)).toEqual([
      "https://c.com",
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("a seta que sairia da lista fica desabilitada nas pontas", () => {
    render(
      <Harness
        initial={[
          { url: "https://a.com", comment: null, position: 0 },
          { url: "https://b.com", comment: null, position: 1 },
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Mover link 1 de 2 para cima" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover link 2 de 2 para baixo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover link 1 de 2 para baixo" })).toBeEnabled();
  });

  it("cada linha é um grupo nomeado — a lista não vira um amontoado de campos sem nome", () => {
    render(
      <Harness
        initial={[
          { url: "https://a.com", comment: null, position: 0 },
          { url: "https://b.com", comment: null, position: 1 },
        ]}
      />
    );

    expect(screen.getByRole("group", { name: "Link externo 1 de 2" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Link externo 2 de 2" })).toBeInTheDocument();
  });
});

describe("TaskExternalLinksField — avisos", () => {
  it("URL sem protocolo acusa no blur e não no meio da digitação", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ url: "", comment: null, position: 0 }]} />);

    const input = urlInput("1 de 1");
    await user.type(input, "github.com/owner/repo");
    expect(screen.queryByText("Comece com https://")).not.toBeInTheDocument();

    await user.tab();

    expect(screen.getByText("Comece com https://")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    // Avisar não é apagar: o que foi digitado continua na lista.
    expect(current[0].url).toBe("github.com/owner/repo");
  });

  it("voltar a digitar limpa o aviso de protocolo", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ url: "", comment: null, position: 0 }]} />);

    const input = urlInput("1 de 1");
    await user.type(input, "github.com");
    await user.tab();
    expect(screen.getByText("Comece com https://")).toBeInTheDocument();

    await user.click(input);
    await user.type(input, "/x");
    expect(screen.queryByText("Comece com https://")).not.toBeInTheDocument();
  });

  it("URL válida não acusa nada", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ url: "", comment: null, position: 0 }]} />);

    await user.type(urlInput("1 de 1"), "https://github.com/owner/repo/issues/1");
    await user.tab();

    expect(screen.queryByText("Comece com https://")).not.toBeInTheDocument();
  });

  it("URL repetida acusa na segunda linha, não na primeira", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { url: "https://a.com", comment: null, position: 0 },
          { url: "", comment: null, position: 1 },
        ]}
      />
    );

    await user.type(urlInput("2 de 2"), "https://a.com");

    expect(screen.getByText("Este link já está na lista.")).toBeInTheDocument();
    expect(urlInput("2 de 2")).toHaveAttribute("aria-invalid", "true");
    expect(urlInput("1 de 2")).not.toHaveAttribute("aria-invalid");
  });
});

describe("TaskExternalLinksField — prévia do chip", () => {
  it("colar uma URL do GitHub e sair do campo mostra a prévia com owner/repo#N", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ url: "", comment: null, position: 0 }]} />);

    const preview = screen.getByTestId("link-preview-0");
    expect(preview).toHaveTextContent(EXTERNAL_LINK_PREVIEW_EMPTY);

    await user.click(urlInput("1 de 1"));
    await user.paste("https://github.com/pedroynk/Orbyva/issues/123");
    // Ainda não saiu do campo: o rótulo não treme enquanto se digita/cola.
    expect(preview).toHaveTextContent(EXTERNAL_LINK_PREVIEW_EMPTY);

    await user.tab();

    expect(screen.getByTestId("link-preview-0")).toHaveTextContent("pedroynk/Orbyva#123");
  });

  it("a prévia da linha 2 não muda quando a URL da linha 1 muda", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { url: "https://www.figma.com/file/abc", comment: null, position: 0 },
          { url: "https://docs.google.com/document/d/abc", comment: null, position: 1 },
        ]}
      />
    );

    expect(screen.getByTestId("link-preview-0")).toHaveTextContent("figma.com");
    expect(screen.getByTestId("link-preview-1")).toHaveTextContent("docs.google.com");

    await user.clear(urlInput("1 de 2"));
    await user.type(urlInput("1 de 2"), "https://github.com/a/b/pull/9");
    await user.tab();

    expect(screen.getByTestId("link-preview-0")).toHaveTextContent("a/b#9");
    // Uma prévia por linha, não uma compartilhada.
    expect(screen.getByTestId("link-preview-1")).toHaveTextContent("docs.google.com");
  });

  it("remover uma linha remove a prévia dela, e a que sobra mantém a sua", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { url: "https://www.figma.com/file/abc", comment: null, position: 0 },
          { url: "https://docs.google.com/x", comment: null, position: 1 },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remover link 1 de 2" }));

    expect(screen.queryByTestId("link-preview-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("link-preview-0")).toHaveTextContent("docs.google.com");
    expect(screen.queryByText("figma.com")).not.toBeInTheDocument();
  });

  it("linha vazia mostra o marcador neutro, não um chip fantasma", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ url: "https://a.com", comment: null, position: 0 }]} />);

    await user.click(addButton());

    expect(screen.getByTestId("link-preview-1")).toHaveTextContent(EXTERNAL_LINK_PREVIEW_EMPTY);
    expect(screen.getByTestId("link-preview-0")).toHaveTextContent("a.com");
  });

  it("URL sem protocolo mantém a prévia (apagada) junto do aviso, em vez de sumir", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[{ url: "", comment: null, position: 0 }]} />);

    await user.type(urlInput("1 de 1"), "docs.google.com/x");
    await user.tab();

    const preview = screen.getByTestId("link-preview-0");
    expect(preview).toHaveTextContent("docs.google.com/x");
    expect(preview.className).toContain("opacity-50");
    expect(screen.getByText("Comece com https://")).toBeInTheDocument();
  });

  it("reordenar leva a prévia junto do link", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={[
          { url: "https://www.figma.com/file/abc", comment: null, position: 0 },
          { url: "https://github.com/a/b/issues/2", comment: null, position: 1 },
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Mover link 2 de 2 para cima" }));

    expect(screen.getByTestId("link-preview-0")).toHaveTextContent("a/b#2");
    expect(screen.getByTestId("link-preview-1")).toHaveTextContent("figma.com");
  });

  it("o botão de configurar ícones leva à tela de regras, em outra aba", () => {
    render(<Harness />);
    const link = screen.getByRole("link", { name: "Configurar ícones" });
    expect(link).toHaveAttribute("href", LINK_ICON_RULES_PATH);
    // Outra aba de propósito: este botão vive dentro do formulário de tarefa, e navegar por cima
    // dele descartaria os links ainda não salvos (feature 087).
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByText("em breve")).not.toBeInTheDocument();
  });
});
