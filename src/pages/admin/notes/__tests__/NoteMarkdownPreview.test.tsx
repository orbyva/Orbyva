import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MarkdownPreview } from "@/components/MarkdownPreview";
import { NoteMarkdownPreview } from "@/pages/admin/notes/NoteMarkdownPreview";
import { NoteEditor } from "@/pages/admin/notes/NoteEditor";
import { invalidateTaskRefIndex } from "@/hooks/useTaskRefIndex";
import type { Note } from "@/types/notes";
import type { TaskRefSummary } from "@/types/tasks";

const { updateNoteMock, toastMock, fetchTaskRefsMock } = vi.hoisted(() => ({
  updateNoteMock: vi.fn(),
  toastMock: vi.fn(),
  fetchTaskRefsMock: vi.fn(),
}));

vi.mock("@/api/notes/notes", () => ({ updateNote: updateNoteMock }));
vi.mock("@/api/tasks/taskRefs", () => ({ fetchTaskRefSummaries: fetchTaskRefsMock }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));
// Painéis de vínculo e o editor de código são de outras features — aqui só atrapalhariam.
vi.mock("@/pages/admin/notes/NoteLinksPanel", () => ({ NoteLinksPanel: () => null }));
vi.mock("@/pages/admin/notes/BacklinksPanel", () => ({ BacklinksPanel: () => null }));
vi.mock("@/components/MarkdownCodeEditor", () => ({
  MarkdownCodeEditor: ({ value }: { value: string }) => (
    <textarea readOnly value={value} aria-label="Conteúdo" />
  ),
}));

/**
 * Wiki-link no preview (feature 056): resolvido vira link para a nota; não resolvido vira o chip
 * de criar. Substitui a "verificação manual nos dois estados" que a tarefa descrevia — a skill
 * `next` proíbe navegador.
 */

function note(id: string, title: string): Note {
  return {
    id,
    title,
    content: "",
    project_id: null,
    folder_id: null,
    kind: "markdown",
    canvas_data: null,
  };
}

function renderPreview(
  content: string,
  notes: Note[],
  onCreateNote?: (title: string) => void
) {
  return render(
    <MemoryRouter>
      <NoteMarkdownPreview
        content={content}
        notes={notes}
        onCreateNote={onCreateNote}
      />
    </MemoryRouter>
  );
}

describe("NoteMarkdownPreview — wiki-links", () => {
  it("um `[[Título]]` que existe vira link para a nota", () => {
    renderPreview("ver [[Obra da casa]] hoje", [note("n7", "Obra da casa")]);

    const link = screen.getByRole("link", { name: "Obra da casa" });
    expect(link).toHaveAttribute("href", "/notes/n7");
  });

  it("resolve ignorando caixa e espaço sobrando no título", () => {
    renderPreview("[[  obra   da casa ]]", [note("n7", "Obra da casa")]);
    expect(screen.getByRole("link", { name: /obra/i })).toHaveAttribute(
      "href",
      "/notes/n7"
    );
  });

  it("um `[[Título]]` que não existe vira chip de criar, e o clique manda o título", async () => {
    const user = userEvent.setup();
    const onCreateNote = vi.fn();
    renderPreview("falta a [[Pauta de setembro]]", [], onCreateNote);

    // Não é link: não dá para navegar para uma nota que não existe.
    expect(screen.queryByRole("link")).toBeNull();
    const chip = screen.getByRole("button", { name: "Criar nota Pauta de setembro" });

    await user.click(chip);
    expect(onCreateNote).toHaveBeenCalledWith("Pauta de setembro");
  });

  it("vários wiki-links na mesma linha resolvem cada um para o seu destino", () => {
    renderPreview(
      "[[Obra da casa]] e [[Reunião]] e [[Some]]",
      [note("n7", "Obra da casa"), note("n8", "Reunião")],
      vi.fn()
    );

    expect(screen.getByRole("link", { name: "Obra da casa" })).toHaveAttribute(
      "href",
      "/notes/n7"
    );
    expect(screen.getByRole("link", { name: "Reunião" })).toHaveAttribute(
      "href",
      "/notes/n8"
    );
    expect(screen.getByRole("button", { name: "Criar nota Some" })).toBeInTheDocument();
  });

  it("`[[…]]` dentro de código continua literal, sem virar link nem chip", () => {
    renderPreview("escreva `[[Assim]]` para linkar", [note("n1", "Assim")], vi.fn());

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("[[Assim]]").tagName).toBe("CODE");
  });

  it("o resto do Markdown continua funcionando ao lado do wiki-link", () => {
    renderPreview("## Etapas\n\n- [[Obra da casa]]\n- **negrito**", [
      note("n7", "Obra da casa"),
    ]);

    // O nome acessível do título agora inclui a âncora de seção da 067 — daí o regex.
    expect(screen.getByRole("heading", { name: /Etapas/ })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("negrito").tagName).toBe("STRONG");
  });

  it("link `javascript:` escrito pelo usuário continua barrado", () => {
    // O `urlTransform` customizado só abre exceção para o esquema dos wiki-links quebrados; o
    // saneamento padrão do react-markdown segue valendo para o resto (decisão de segurança da 055).
    renderPreview("[clique](javascript:alert(1))", []);

    const link = screen.getByText("clique");
    expect(link.tagName).toBe("A");
    // O href foi zerado pelo saneamento — clicar não executa nada.
    expect(link.getAttribute("href")).toBe("");
  });

  it("HTML cru continua sem ser interpretado", () => {
    renderPreview("<b>não</b> vira negrito", []);
    expect(screen.queryByText("não")).toBeNull();
    expect(screen.getByText(/<b>não<\/b> vira negrito/)).toBeInTheDocument();
  });

  it("sem `onCreateNote`, o chip aparece desabilitado em vez de sumir", () => {
    renderPreview("[[Sem nota]]", []);
    expect(screen.getByRole("button", { name: "Criar nota Sem nota" })).toBeDisabled();
  });

  it("clicar no wiki-link navega para a nota, inclusive dentro de um Dialog", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/tasks"]}>
        <Routes>
          <Route
            path="/tasks"
            element={
              <Dialog open>
                <DialogContent aria-describedby={undefined}>
                  <DialogTitle>Editar tarefa</DialogTitle>
                  <NoteMarkdownPreview
                    content="ver [[Obra da casa]]"
                    notes={[note("n7", "Obra da casa")]}
                  />
                </DialogContent>
              </Dialog>
            }
          />
          <Route path="/notes/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("link", { name: "Obra da casa" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/notes/n7");
  });
});

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="location">{pathname}</div>;
}

/**
 * Checklist interativa (feature 067): clicar num `- [ ]` do preview reescreve o Markdown da nota e
 * grava. O clique é afirmado aqui, com o `NoteEditor` de verdade — a skill `next` proíbe conferir
 * no navegador, e o que importa provar é o efeito colateral (o que foi salvo), não o pixel.
 */
describe("NoteMarkdownPreview — checklist interativa", () => {
  beforeEach(() => {
    updateNoteMock.mockReset();
    updateNoteMock.mockResolvedValue(undefined);
    toastMock.mockReset();
  });

  function noteWith(content: string): Note {
    return {
      id: "n1",
      title: "Compras",
      content,
      project_id: null,
      folder_id: null,
      kind: "markdown",
      canvas_data: null,
    };
  }

  async function renderEditorPreview(content: string) {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <NoteEditor note={noteWith(content)} projects={[]} debounceMs={0} />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("tab", { name: "Visualizar" }));
    return user;
  }

  it("clicar no checkbox salva o conteúdo com o item marcado", async () => {
    const user = await renderEditorPreview("- [ ] comprar\n- [ ] pagar\n");

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    expect(boxes[1]).toBeEnabled();

    await user.click(boxes[1]);

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: "n1", content: "- [ ] comprar\n- [x] pagar\n" })
      );
    });
  });

  it("o índice do clique casa com a linha certa mesmo com bloco de código no meio", async () => {
    const content = "- [ ] real\n\n```md\n- [ ] exemplo\n```\n\n- [ ] outro real\n";
    const user = await renderEditorPreview(content);

    const boxes = screen.getAllByRole("checkbox");
    // O `- [ ]` de dentro do bloco de código não vira checkbox — são dois, não três.
    expect(boxes).toHaveLength(2);

    await user.click(boxes[1]);

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "- [ ] real\n\n```md\n- [ ] exemplo\n```\n\n- [x] outro real\n",
        })
      );
    });
  });

  it("desmarcar também grava", async () => {
    const user = await renderEditorPreview("- [x] pago\n");

    await user.click(screen.getByRole("checkbox"));

    await waitFor(() => {
      expect(updateNoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ content: "- [ ] pago\n" })
      );
    });
  });

  it("erro ao salvar mostra toast e desmarca o item de volta", async () => {
    updateNoteMock.mockRejectedValue(new Error("sem rede"));
    const user = await renderEditorPreview("- [ ] comprar\n");

    await user.click(screen.getByRole("checkbox"));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" })
      );
    });
    // A mentira silenciosa que isto evita: checkbox marcado na tela, nada gravado no banco.
    await waitFor(() => {
      expect(screen.getByRole("checkbox")).not.toBeChecked();
    });
  });

  it("sem handler (a descrição de tarefa) o checkbox continua desabilitado", () => {
    render(<MarkdownPreview content={"- [ ] tarefa\n- [x] feita"} />);

    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toBeDisabled();
    expect(boxes[1]).toBeDisabled();
    expect(boxes[1]).toBeChecked();
  });

  it("o preview da nota sem `onToggleTaskItem` também segue somente-leitura", () => {
    renderPreview("- [ ] item", []);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});

/**
 * Referência de tarefa na prévia (feature 105): `[Rótulo](orbyva-task:<id>)` vira chip com o estado
 * **atual** da tarefa, resolvido por id contra o banco (aqui, o falso).
 */
describe("NoteMarkdownPreview — referência de tarefa", () => {
  const TASK_ID = "11111111-1111-4111-8111-111111111111";
  const GHOST_ID = "00000000-0000-0000-0000-000000000000";

  function taskRow(over: Partial<TaskRefSummary> = {}): TaskRefSummary {
    return {
      id: TASK_ID,
      title: "Revisar contrato",
      status: "todo",
      due_date: "2026-09-25",
      ...over,
    };
  }

  beforeEach(() => {
    invalidateTaskRefIndex();
    updateNoteMock.mockReset();
    fetchTaskRefsMock.mockReset();
    fetchTaskRefsMock.mockResolvedValue([taskRow()]);
  });

  it("a marca vira chip com o título do banco, não o rótulo velho do texto", async () => {
    renderPreview(`Depende de [rótulo velho](orbyva-task:${TASK_ID})`, []);

    const chip = await screen.findByRole("link", { name: /Revisar contrato/ });
    expect(chip).toHaveAttribute("href", `/tasks?task=${TASK_ID}`);
    expect(chip).toHaveTextContent("Revisar contrato");
    expect(chip).not.toHaveTextContent("rótulo velho");
    expect(screen.getByText("25/09/2026")).toBeInTheDocument();
  });

  it("o `urlTransform` deixa o esquema `orbyva-task:` passar inteiro", async () => {
    // A armadilha desta feature: sem a exceção, `defaultUrlTransform` poda o esquema, o `href`
    // chega vazio, `parseTaskRefHref` devolve null e sobra um `<a href="">` — sem erro nenhum no
    // console. Este assert é o que falha se a exceção for removida.
    renderPreview(`Depende de [rótulo velho](orbyva-task:${TASK_ID})`, []);

    await screen.findByRole("link", { name: /Revisar contrato/ });
    expect(
      document.querySelector('a[href=""]'),
      "href vazio = urlTransform podou `orbyva-task:` e o chip nunca renderizaria"
    ).toBeNull();
    expect(screen.queryByText("rótulo velho")).toBeNull();
  });

  it("tarefa apagada vira selo de referência removida, sem link e sem tocar no texto", async () => {
    fetchTaskRefsMock.mockResolvedValue([]);
    renderPreview(`Depende de [subir painel](orbyva-task:${GHOST_ID})`, []);

    const selo = await screen.findByRole("note", { name: /não existe mais/ });
    expect(selo).toHaveTextContent("subir painel");
    expect(screen.queryByRole("link")).toBeNull();
    // O chip é **render**, nunca gravação: nada do markdown é reescrito porque um id sumiu.
    expect(updateNoteMock).not.toHaveBeenCalled();
  });

  it("cinco marcas da mesma tarefa rendem cinco chips e **uma** consulta", async () => {
    const linha = `[a](orbyva-task:${TASK_ID}) `.repeat(5);
    renderPreview(linha, []);

    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: /Revisar contrato/ })).toHaveLength(5);
    });
    expect(fetchTaskRefsMock).toHaveBeenCalledTimes(1);
    expect(fetchTaskRefsMock).toHaveBeenCalledWith([TASK_ID]);
  });

  it("link markdown comum continua `<a>` normal, sem virar chip", async () => {
    renderPreview("veja o [Google](https://google.com)", []);

    const link = await screen.findByRole("link", { name: "Google" });
    expect(link).toHaveAttribute("href", "https://google.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(fetchTaskRefsMock).not.toHaveBeenCalled();
  });

  it("`[[Nota]]` e marca de tarefa no mesmo parágrafo renderizam cada um do seu jeito", async () => {
    renderPreview(
      `ver [[Obra da casa]] e [x](orbyva-task:${TASK_ID})`,
      [note("n7", "Obra da casa")]
    );

    await screen.findByRole("link", { name: /Revisar contrato/ });
    expect(screen.getByRole("link", { name: "Obra da casa" })).toHaveAttribute(
      "href",
      "/notes/n7"
    );
  });

  it("a marca dentro de bloco de código fica literal, sem chip e sem consulta", async () => {
    renderPreview(`escreva \`[x](orbyva-task:${TASK_ID})\` assim`, []);

    await waitFor(() => {
      expect(screen.getByText(`[x](orbyva-task:${TASK_ID})`).tagName).toBe("CODE");
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(fetchTaskRefsMock).not.toHaveBeenCalled();
  });

  it("rótulo vazio na marca usa o título real da tarefa", async () => {
    renderPreview(`Depende de [](orbyva-task:${TASK_ID})`, []);

    expect(await screen.findByRole("link", { name: /Revisar contrato/ })).toHaveTextContent(
      "Revisar contrato"
    );
  });

  it("tarefa concluída aparece com traço no título", async () => {
    fetchTaskRefsMock.mockResolvedValue([taskRow({ status: "done", due_date: null })]);
    renderPreview(`feito: [x](orbyva-task:${TASK_ID})`, []);

    const titulo = await screen.findByText("Revisar contrato");
    expect(titulo.className).toContain("line-through");
  });

  it("clicar no chip vai para /tasks?task=<id>, inclusive dentro de um Dialog", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/notes/n1"]}>
        <Routes>
          <Route
            path="/notes/n1"
            element={
              <Dialog open>
                <DialogContent aria-describedby={undefined}>
                  <DialogTitle>Editar tarefa</DialogTitle>
                  <NoteMarkdownPreview
                    content={`ver [x](orbyva-task:${TASK_ID})`}
                    notes={[]}
                  />
                </DialogContent>
              </Dialog>
            }
          />
          <Route path="/tasks" element={<SearchProbe />} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("link", { name: /Revisar contrato/ }));
    expect(screen.getByTestId("search")).toHaveTextContent(`?task=${TASK_ID}`);
  });
});

function SearchProbe() {
  const { search } = useLocation();
  return <div data-testid="search">{search}</div>;
}

/**
 * Link de âncora (`#…`) dentro de uma nota (feature 069). O override de `a` daqui existe para o
 * wiki-link, mas ele vê **todos** os links do markdown — e o marcador de footnote e o `↩` de volta
 * são links de fragmento. Mandá-los para o ramo de link externo faria a footnote abrir outra aba
 * em vez de rolar a página, que é o oposto de navegar dentro da própria nota.
 */
describe("NoteMarkdownPreview — âncora dentro da nota", () => {
  const NOTA = "texto[^1] e mais\n\n[^1]: a nota de rodape";

  it("o marcador da footnote é link de fragmento, sem abrir aba", () => {
    const { container } = renderPreview(NOTA, []);

    const ref = container.querySelector<HTMLAnchorElement>(
      "sup a[data-footnote-ref]"
    );
    expect(ref).not.toBeNull();
    expect(ref?.getAttribute("href")).toBe("#user-content-fn-1");
    expect(ref).not.toHaveAttribute("target");
  });

  it("o link de volta (↩) também fica na mesma página", () => {
    const { container } = renderPreview(NOTA, []);

    const backref = container.querySelector("a.data-footnote-backref");
    expect(backref?.getAttribute("href")).toBe("#user-content-fnref-1");
    expect(backref).not.toHaveAttribute("target");
  });

  it("link externo continua abrindo em outra aba", () => {
    renderPreview("[fora](https://exemplo.com)", []);

    const link = screen.getByRole("link", { name: "fora" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
