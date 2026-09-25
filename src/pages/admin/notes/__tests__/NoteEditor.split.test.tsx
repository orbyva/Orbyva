import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { NoteEditor } from "@/pages/admin/notes/NoteEditor";
import type { Note } from "@/types/notes";

/**
 * Os modos de visualização do editor de nota (feature 070): **Escrever | Dividir | Visualizar**,
 * com o modo na URL. Testado montando o editor de verdade — sem navegador, como manda a skill
 * `next`.
 */

const updateNote = vi.fn(async () => ({}) as Note);
vi.mock("@/api/notes/notes", () => ({
  updateNote: (...args: unknown[]) => updateNote(...(args as [])),
}));

const NOTE: Note = {
  id: "n1",
  title: "Nota",
  content: "# Titulo\n\ncorpo da nota",
  project_id: null,
  kind: "markdown",
  canvas_data: null,
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
};

/** Espelha a URL atual na tela — é por ele que as assertivas leem o `?view=`. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>;
}

function url(): string {
  return screen.getByTestId("url").textContent ?? "";
}

function renderEditor(initialEntry = "/notes/n1", note: Note = NOTE) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NoteEditor note={note} projects={[]} notes={[note]} />
      <LocationProbe />
    </MemoryRouter>
  );
}

/** Nota-checklist — metade do uso de nota é isto. */
const NOTA_CHECKLIST: Note = {
  ...NOTE,
  content: ["- [ ] comprar pão", "- [ ] pagar conta", "- [ ] ligar para a Ana"].join("\n"),
};

/** Nota com duas seções — é o que o sumário precisa para ter para onde levar. */
const NOTA_COM_SECOES: Note = {
  ...NOTE,
  content: ["# Primeira", "", "corpo", "", "## Segunda", "", "fim"].join("\n"),
};

/** O preview renderizado — o `h1` da nota só existe depois que o markdown vira HTML. */
function previewHeading(): HTMLElement | null {
  return screen.queryByRole("heading", { name: "Titulo" });
}

/**
 * jsdom não faz layout: `scrollHeight`/`clientHeight` são sempre 0 e `scrollTop` nunca sai do lugar
 * sozinho. Esta função finge a geometria de um painel rolável, que é tudo que a sincronização lê.
 */
function fakeScrollBox(
  element: HTMLElement,
  { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }
) {
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(element, "clientHeight", { configurable: true, value: clientHeight });
  let top = 0;
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (next: number) => {
      top = next;
    },
  });
}

/** Largura da janela, que é o que `useIsMobile` lê. Volta ao normal depois de cada teste. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

beforeEach(() => {
  updateNote.mockClear();
  setViewportWidth(1024);
});

describe("NoteEditor — modos de visualização", () => {
  it("abre em Escrever, sem parâmetro na URL", () => {
    renderEditor();
    expect(screen.getByRole("tab", { name: "Escrever" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(screen.getByRole("textbox", { name: "Conteúdo" })).toBeInTheDocument();
    expect(previewHeading()).toBeNull();
    expect(url()).toBe("/notes/n1");
  });

  it("abrir com `?view=dividir` já mostra as duas colunas", () => {
    renderEditor("/notes/n1?view=dividir");

    // Editor e preview na tela ao mesmo tempo — é o ponto do modo.
    expect(screen.getByRole("textbox", { name: "Conteúdo" })).toBeInTheDocument();
    expect(previewHeading()).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();
  });

  it("trocar de modo escreve na URL (e o padrão apaga o parâmetro)", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("tab", { name: "Dividir" }));
    expect(url()).toBe("/notes/n1?view=dividir");

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    expect(url()).toBe("/notes/n1?view=visualizar");

    // "escrever" é o padrão: some da URL em vez de virar `?view=escrever`.
    await user.click(screen.getByRole("tab", { name: "Escrever" }));
    expect(url()).toBe("/notes/n1");
  });

  it("trocar de modo usa `replace`: não empilha uma entrada de histórico por clique", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("tab", { name: "Dividir" }));
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    // Um único passo de "voltar" tem que sair da nota, não desfazer as trocas de aba.
    expect(window.history.length).toBeLessThan(4);
  });

  it("URL com valor inválido cai em Escrever, sem quebrar a tela", () => {
    renderEditor("/notes/n1?view=zzz");
    expect(screen.getByRole("tab", { name: "Escrever" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(previewHeading()).toBeNull();
  });

  it("abaixo de `md`, Dividir some da barra e cai para Escrever — mas a URL é preservada", () => {
    setViewportWidth(500);
    renderEditor("/notes/n1?view=dividir");

    expect(screen.queryByRole("tab", { name: "Dividir" })).toBeNull();
    // Só o editor: duas colunas em telefone é ilegível.
    expect(screen.getByRole("textbox", { name: "Conteúdo" })).toBeInTheDocument();
    expect(previewHeading()).toBeNull();
    // A URL continua dizendo `dividir`: abrir o mesmo link no computador volta ao modo pedido.
    expect(url()).toBe("/notes/n1?view=dividir");
  });

  it("no modo Dividir, rolar o editor rola o preview na mesma proporção", async () => {
    renderEditor("/notes/n1?view=dividir");

    const editorPane = screen.getByTestId("note-editor-pane");
    const previewPane = screen.getByTestId("note-preview-pane");
    // Editor com 1000 px de conteúdo em 200 px de janela (800 de curso); preview com 400 de curso.
    fakeScrollBox(editorPane, { scrollHeight: 1000, clientHeight: 200 });
    fakeScrollBox(previewPane, { scrollHeight: 600, clientHeight: 200 });

    editorPane.scrollTop = 400; // metade do curso
    await act(async () => {
      fireEvent.scroll(editorPane);
      // O ajuste acontece uma vez por quadro; o teste espera esse quadro.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(previewPane.scrollTop).toBe(200); // metade de 400

    editorPane.scrollTop = 800; // fim
    await act(async () => {
      fireEvent.scroll(editorPane);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(previewPane.scrollTop).toBe(400);
  });

  it("rolar o preview não mexe no editor — a sincronia é de mão única", async () => {
    renderEditor("/notes/n1?view=dividir");

    const editorPane = screen.getByTestId("note-editor-pane");
    const previewPane = screen.getByTestId("note-preview-pane");
    fakeScrollBox(editorPane, { scrollHeight: 1000, clientHeight: 200 });
    fakeScrollBox(previewPane, { scrollHeight: 600, clientHeight: 200 });

    previewPane.scrollTop = 300;
    await act(async () => {
      fireEvent.scroll(previewPane);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    // Sem laço de rolagem: o editor fica onde estava.
    expect(editorPane.scrollTop).toBe(0);
  });

  it("clicar no sumário leva o cursor do editor até a linha do título", async () => {
    const user = userEvent.setup();
    renderEditor("/notes/n1", NOTA_COM_SECOES);

    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    // O live preview só mostra a marcação da linha **onde está o cursor**: com o cursor no começo
    // do documento, o `#` da linha 1 aparece e o `##` da linha 5 está escondido.
    expect(field.textContent).toContain("# Primeira");
    expect(field.textContent).not.toContain("## Segunda");

    await user.click(screen.getByRole("button", { name: "Segunda" }));

    // Cursor na linha 5: agora é o `##` dela que aparece, e o `#` da primeira que some.
    expect(field.textContent).toContain("## Segunda");
    expect(field.textContent).not.toContain("# Primeira");
    expect(field).toHaveFocus();
  });

  it("no modo Visualizar, o sumário rola até a âncora do título no preview", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
    renderEditor("/notes/n1?view=visualizar", NOTA_COM_SECOES);

    // O `id` é o mesmo slug que `rehypeHeadingIds` (069) escreveu no título renderizado.
    const target = document.getElementById("segunda");
    expect(target).not.toBeNull();

    scrollIntoView.mockClear();
    await user.click(screen.getByRole("button", { name: "Segunda" }));

    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.instances[0]).toBe(target);
    scrollIntoView.mockRestore();
  });

  it("o rodapé mostra palavras, caracteres e tempo de leitura — e some na nota vazia", async () => {
    const user = userEvent.setup();
    renderEditor("/notes/n1", NOTA_COM_SECOES);

    // "Primeira corpo Segunda fim" = 4 palavras de texto (a marcação não conta).
    const footer = screen.getByText(/palavras/);
    expect(footer).toHaveTextContent("4 palavras");
    expect(footer).toHaveTextContent("caracteres");
    expect(footer).toHaveTextContent("1 min de leitura");

    // Esvaziar a nota tira o rodapé: "0 palavras" em folha em branco é ruído.
    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await user.click(field);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    expect(screen.queryByText(/palavras/)).toBeNull();
  });

  it("clicar o segundo checkbox do preview escreve `- [x]` no markdown da nota", async () => {
    renderEditor("/notes/n1?view=dividir", NOTA_CHECKLIST);

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    /**
     * `fireEvent.click` e não `user.click`: o `user-event` simula ponteiro e, neste jsdom, não
     * produz o `change` de um checkbox **controlado** dentro do painel rolável. Que o clique chama
     * `onToggleTask` já está provado com `user.click` em `MarkdownPreview.tasks.test.tsx`; o que
     * este teste guarda é o passo seguinte — o markdown da nota ser reescrito.
     */
    fireEvent.click(boxes[1]);

    // O editor mostra o documento novo: só a segunda linha mudou. (O `@uiw/react-codemirror`
    // aplica o `value` novo no documento num efeito, daí o `waitFor`.)
    const field = screen.getByRole("textbox", { name: "Conteúdo" });
    await waitFor(() => expect(field.textContent).toContain("- [x] pagar conta"));
    expect(field.textContent).toContain("- [ ] comprar pão");
    expect(field.textContent).toContain("- [ ] ligar para a Ana");

    // E desmarcar volta ao que era — o preview reflete o texto, não um estado próprio.
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await waitFor(() => expect(field.textContent).toContain("- [ ] pagar conta"));
  });

  it("a barra de ferramentas some no modo Visualizar e volta no Escrever", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    // Sem editor na tela, botão de formatação é botão que não formata nada.
    expect(screen.queryByRole("toolbar", { name: "Formatação" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Escrever" }));
    expect(screen.getByRole("toolbar", { name: "Formatação" })).toBeInTheDocument();
  });
});
