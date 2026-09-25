import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NoteEditor } from "@/pages/admin/notes/NoteEditor";
import type { Note } from "@/types/notes";

/**
 * A barra de formatação e o menu `/` **dentro do editor de notas** (feature 068), com o
 * `MarkdownCodeEditor` de verdade — este é o teste que prova que barra, menu e autosave estão
 * ligados uns aos outros, e não só que cada peça funciona sozinha.
 */

const { updateNoteMock, toastMock } = vi.hoisted(() => ({
  updateNoteMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({ updateNote: updateNoteMock }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));
// Painéis de vínculo são de outra feature e só fariam fetch aqui.
vi.mock("@/pages/admin/notes/NoteLinksPanel", () => ({ NoteLinksPanel: () => null }));
vi.mock("@/pages/admin/notes/BacklinksPanel", () => ({ BacklinksPanel: () => null }));

function note(content: string): Note {
  return {
    id: "n1",
    title: "Reforma",
    content,
    project_id: null,
    folder_id: null,
    kind: "markdown",
    canvas_data: null,
  };
}

/** Debounce curto: o que interessa é que a gravação acontece, não quanto ela espera. */
function renderEditor(content: string) {
  return render(
    <MemoryRouter>
      <NoteEditor note={note(content)} projects={[]} notes={[]} debounceMs={10} />
    </MemoryRouter>
  );
}

/** O conteúdo da última gravação — é o documento real do CodeMirror chegando na API. */
function savedContent(): string {
  const calls = updateNoteMock.mock.calls;
  return (calls[calls.length - 1]?.[0] as { content: string }).content;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateNoteMock.mockResolvedValue(undefined);
});

describe("NoteEditor — barra de formatação", () => {
  it("clicar em Negrito com texto selecionado envolve a seleção e grava", async () => {
    const user = userEvent.setup();
    renderEditor("prazo apertado");

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    await user.keyboard("{Control>}a{/Control}");
    await user.click(screen.getByRole("button", { name: "Negrito" }));

    await waitFor(() => expect(savedContent()).toBe("**prazo apertado**"));
  });

  it("a barra não aparece na aba Visualizar", async () => {
    const user = userEvent.setup();
    renderEditor("# Reforma");

    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    // O painel de escrita é desmontado pelo Radix — a barra vai junto, sem condicional própria.
    expect(screen.queryByRole("toolbar", { name: "Formatação" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Negrito" })).toBeNull();
  });

  it('o botão "Inserir" abre o mesmo menu do `/`', async () => {
    const user = userEvent.setup();
    renderEditor("");

    await user.click(screen.getByRole("textbox", { name: "Conteúdo" }));
    await user.click(screen.getByRole("button", { name: /Inserir/ }));

    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Tabela/ })).toBeInTheDocument()
    );
  });

  it("o item Diagrama do menu insere no cursor, não no fim do arquivo", async () => {
    const user = userEvent.setup();
    // Duas linhas: a primeira em branco (onde o cursor cai) e a última com texto. Se o diagrama
    // fosse anexado no fim — como fazia o botão "Inserir diagrama" até a 067 —, "fim da nota"
    // deixaria de ser a última linha.
    renderEditor("\nfim da nota");

    await user.click(screen.getByRole("textbox", { name: "Conteúdo" }));
    await user.keyboard("/diagrama");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Diagrama/ })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("option", { name: /Diagrama/ }));

    await waitFor(() => expect(savedContent()).toContain("```mermaid"));
    const content = savedContent();
    expect(content.startsWith("```mermaid")).toBe(true);
    expect(content.trimEnd().endsWith("fim da nota")).toBe(true);
    // A consulta digitada sai junto com a barra.
    expect(content).not.toContain("/diagrama");
  });

  it("o menu insere callout com o gatilho do GitHub", async () => {
    const user = userEvent.setup();
    renderEditor("");

    await user.click(screen.getByRole("textbox", { name: "Conteúdo" }));
    await user.keyboard("/atencao");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Atenção/ })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("option", { name: /Atenção/ }));

    await waitFor(() => expect(savedContent()).toContain("> [!WARNING]"));
  });
});

/**
 * O sumário ligado ao editor. O painel sozinho está coberto em `NoteOutline.test.tsx`; aqui o que
 * importa é a ponte com o CodeMirror — clicar leva o **cursor**, e a seção atual acompanha ele.
 */
const DUAS_SECOES = "# Etapas\n\ntexto\n\n## Materiais\n\nmais texto";

describe("NoteEditor — sumário", () => {
  it("lista os títulos da nota", () => {
    renderEditor(DUAS_SECOES);

    const outline = screen.getByRole("navigation", { name: "Sumário da nota" });
    expect(outline).toHaveTextContent("Etapas");
    expect(outline).toHaveTextContent("Materiais");
  });

  it("clicar num título leva o cursor até a linha dele no Markdown", async () => {
    const user = userEvent.setup();
    renderEditor(DUAS_SECOES);

    await user.click(screen.getByRole("button", { name: "Materiais" }));
    // Digitar prova onde o cursor parou: o texto entra no começo da linha do título clicado.
    await user.keyboard("X");

    await waitFor(() => expect(savedContent()).toContain("X## Materiais"));
  });

  it("a seção atual acompanha o cursor", async () => {
    const user = userEvent.setup();
    renderEditor(DUAS_SECOES);

    // Cursor na posição 0 (linha 1): a seção é a primeira.
    await user.click(screen.getByRole("textbox", { name: "Conteúdo" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Etapas" })).toHaveAttribute(
        "aria-current",
        "true"
      )
    );

    await user.keyboard("{Control>}{End}{/Control}");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Materiais" })).toHaveAttribute(
        "aria-current",
        "true"
      )
    );
    expect(screen.getByRole("button", { name: "Etapas" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("nota com um título só não mostra o painel", () => {
    renderEditor("# Só um\n\ntexto");
    expect(screen.queryByRole("navigation", { name: "Sumário da nota" })).toBeNull();
  });
});

describe("NoteEditor — rodapé de contagem", () => {
  it("mostra palavras, caracteres e tempo de leitura do texto legível", () => {
    renderEditor("# Etapas\n\ncomprar cimento e areia");

    // O `# ` do título e a marcação não entram na conta (ver `wordCount.ts`).
    expect(screen.getByText(/5 palavras/)).toBeInTheDocument();
    expect(screen.getByText(/1 min de leitura/)).toBeInTheDocument();
  });

  it("não anuncia a contagem em voz alta (o `Salvo` é o aviso que importa)", () => {
    renderEditor("uma nota qualquer");

    expect(screen.getByText(/palavras/)).toHaveAttribute("aria-live", "off");
  });

  it("nota vazia não mostra rodapé nenhum", () => {
    renderEditor("");
    expect(screen.queryByText(/palavras/)).toBeNull();
  });

  it("a contagem acompanha o que é digitado", async () => {
    const user = userEvent.setup();
    renderEditor("uma");

    expect(screen.getByText(/1 palavra ·/)).toBeInTheDocument();

    await user.click(screen.getByRole("textbox", { name: "Conteúdo" }));
    // Fim do documento: em jsdom o clique não tem geometria e cai na posição 0.
    await user.keyboard("{Control>}{End}{/Control}");
    await user.keyboard(" duas tres");

    await waitFor(() => expect(screen.getByText(/3 palavras/)).toBeInTheDocument());
  });
});

/**
 * O modo "Dividido" (068). A decisão diz que ele **não existe** abaixo de `lg` — e "não existe" é
 * diferente de "está escondido no CSS": aba escondida continua alcançável por teclado.
 */
describe("NoteEditor — modo Dividido", () => {
  /** Fixa o que `window.matchMedia` responde, que é o que o `useMediaQuery` lê. */
  function setViewportMatches(matches: boolean) {
    window.matchMedia = ((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  afterEach(() => {
    // jsdom não implementa `matchMedia`: o estado original é "não existe".
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("o gatilho não é renderizado quando a media query não bate", () => {
    setViewportMatches(false);
    renderEditor("# Reforma");

    expect(screen.queryByRole("tab", { name: "Dividido" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Escrever" })).toBeInTheDocument();
  });

  it("sem `matchMedia` nenhum (jsdom cru), o app não quebra e o modo some", () => {
    renderEditor("# Reforma");
    expect(screen.queryByRole("tab", { name: "Dividido" })).toBeNull();
  });

  it("a partir de `lg`, o gatilho aparece e mostra editor e preview ao mesmo tempo", async () => {
    const user = userEvent.setup();
    setViewportMatches(true);
    renderEditor("# Reforma");

    await user.click(screen.getByRole("tab", { name: "Dividido" }));

    // As duas metades vivas no mesmo painel: o editor (contenteditable) e o preview (o `<h1>`).
    expect(screen.getByRole("textbox", { name: "Conteúdo" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Reforma/ })).toBeInTheDocument();
    // E a barra continua ao alcance, porque continua existindo um editor.
    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();
  });

  it("cada coluna do split rola por conta própria", async () => {
    const user = userEvent.setup();
    setViewportMatches(true);
    renderEditor("# Reforma");

    await user.click(screen.getByRole("tab", { name: "Dividido" }));

    const panel = screen.getAllByRole("tabpanel")[0];
    const columns = [...panel.querySelectorAll(".overflow-y-auto")];
    expect(columns).toHaveLength(2);
  });
});
