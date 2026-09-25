import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Notes from "@/pages/admin/notes/Notes";
import NoteDetail from "@/pages/admin/notes/NoteDetail";
import { normalizeNoteDraft } from "@/domain/notes/noteDraft";
import type { Note, NoteDraft, NoteUpdateRequest } from "@/types/notes";

/**
 * Fluxo fim a fim do módulo de Notas contra um backend falso em memória que imita o schema real —
 * inclusive o `on delete set null` de `note.project_id` e o `updated_at` que a API carimba no
 * update. Substitui a verificação manual no navegador (proibida pela skill `next`): criar nota,
 * escrever Markdown, ver o preview, vincular a um projeto, voltar para a lista, filtrar, recarregar
 * a página (remontar, refazendo os fetches) e excluir.
 */

/**
 * Linha semeada no backend falso. `kind`/`canvas_data` (feature 058) ficam opcionais aqui e são
 * preenchidos na saída de `fetchNotes`/`fetchNote`, exatamente como o default da coluna faz no
 * Postgres — o fixture continua dizendo só o que importa para cada teste.
 */
type NoteRow = Partial<Note> & Pick<Note, "id" | "title" | "content" | "project_id">;

const { store } = vi.hoisted(() => ({
  store: {
    notes: [] as NoteRow[],
    projects: [] as { id: string; name: string }[],
    seq: 0,
    clock: 0,
  },
}));

/** Cada escrita anda o relógio, como o `now()` do Postgres faria. */
function stamp(): string {
  store.clock += 1;
  return new Date(Date.UTC(2026, 7, 16, 12, store.clock)).toISOString();
}

vi.mock("@/api/notes/notes", () => ({
  fetchNotes: vi.fn(async ({ projectId }: { projectId?: string | null } = {}) =>
    store.notes
      .filter((n) => (projectId ? n.project_id === projectId : true))
      .map((n): Note => ({ kind: "markdown", canvas_data: null, ...n }))
      // `order("updated_at", { ascending: false })`
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
  ),
  fetchNote: vi.fn(async (id: string) => {
    const found = store.notes.find((n) => n.id === id);
    return found ? ({ kind: "markdown", canvas_data: null, ...found } as Note) : null;
  }),
  createNote: vi.fn(async (draft: NoteDraft) => {
    const at = stamp();
    // A API real normaliza antes de gravar — o falso usa a mesma função, não uma cópia.
    const created: Note = {
      id: `n${++store.seq}`,
      ...normalizeNoteDraft(draft),
      created_at: at,
      updated_at: at,
    };
    store.notes.push(created);
    return { ...created };
  }),
  updateNote: vi.fn(async ({ id, ...fields }: NoteUpdateRequest) => {
    const target = store.notes.find((n) => n.id === id);
    if (!target) return;
    Object.assign(target, fields, { updated_at: stamp() });
    if (fields.title !== undefined) {
      target.title = normalizeNoteDraft({
        title: fields.title,
        content: "",
        project_id: null,
      }).title;
    }
  }),
  deleteNote: vi.fn(async (id: string) => {
    store.notes = store.notes.filter((n) => n.id !== id);
  }),
}));

vi.mock("@/api/tasks/projects", () => ({
  fetchProjects: vi.fn(async () => store.projects.map((p) => ({ ...p }))),
}));

/**
 * O mermaid (feature 057) é trocado por um duplo: ele mede texto com `getBBox`, que o jsdom não
 * implementa. O que interessa aqui é o caminho — botão do editor → bloco no documento → preview
 * chamando o renderer com o código do bloco.
 */
const { mermaidMock } = vi.hoisted(() => ({
  mermaidMock: {
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: vi.fn(async (id: string) => ({ svg: `<svg id="${id}"></svg>` })),
  },
}));
vi.mock("mermaid", () => ({ default: mermaidMock }));

/**
 * O Excalidraw (feature 058) também é trocado por um duplo: são 2,7 MB que não rodam em jsdom.
 * O duplo mantém a fronteira do módulo real (`initialScene`/`theme`/`onSceneChange`), que é o que
 * este fluxo precisa — provar que criar um canvas leva ao editor de canvas, e não ao de markdown.
 */
const { canvasSpy } = vi.hoisted(() => ({
  canvasSpy: { onSceneChange: null as ((data: unknown) => void) | null },
}));
/** `exportToSvg` é o que o bloco embutido usa para desenhar em modo leitura. */
const { exportToSvgMock } = vi.hoisted(() => ({ exportToSvgMock: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => ({ exportToSvg: exportToSvgMock }));

vi.mock("@/pages/admin/notes/ExcalidrawCanvas", () => ({
  default: ({
    initialScene,
    onSceneChange,
  }: {
    initialScene: { elements: readonly unknown[] };
    onSceneChange?: (data: unknown) => void;
  }) => {
    canvasSpy.onSceneChange = onSceneChange ?? null;
    return (
      <div data-testid="excalidraw">{`elementos: ${initialScene.elements.length}`}</div>
    );
  },
}));

// `toast` precisa ter identidade estável: o `load` das páginas é `useCallback([toast])`.
const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

/** O que a migration faz ao excluir um projeto: zera o vínculo, preserva a nota. */
function deleteProject(projectId: string) {
  store.projects = store.projects.filter((p) => p.id !== projectId);
  for (const note of store.notes) {
    if (note.project_id === projectId) note.project_id = null;
  }
}

function renderApp(url = "/notes") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/notes" element={<Notes />} />
        <Route path="/notes/:id" element={<NoteDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

/** O autosave tem debounce de 800 ms; a espera precisa caber isso. */
const AUTOSAVE = { timeout: 4000 };

beforeEach(() => {
  vi.clearAllMocks();
  store.notes = [];
  store.projects = [{ id: "p1", name: "Obra da casa" }];
  store.seq = 0;
  store.clock = 0;
  exportToSvgMock.mockImplementation(async () => {
    const host = document.createElement("div");
    host.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg"><rect data-testid="traco" /></svg>';
    return host.firstElementChild as SVGSVGElement;
  });
});

describe("Notas — fluxo fim a fim", () => {
  it("lista vazia oferece criar a primeira nota", async () => {
    renderApp();
    expect(await screen.findByText("Nenhuma nota ainda")).toBeInTheDocument();
  });

  it("criar uma nota abre o editor dela e a nota nasce com título padrão", async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByText("Nenhuma nota ainda");
    await user.click(screen.getAllByRole("button", { name: "Nova nota" })[0]);

    // Navegou para /notes/:id — o editor está montado.
    expect(await screen.findByLabelText("Título")).toBeInTheDocument();
    expect(store.notes).toHaveLength(1);
    // Título vazio virou "Sem título": a coluna é not null (normalizeNoteDraft).
    expect(store.notes[0].title).toBe("Sem título");
    expect(store.notes[0].content).toBe("");
    expect(store.notes[0].project_id).toBeNull();
  });

  it("escrever título e conteúdo salva sozinho, sem botão Salvar", async () => {
    const user = userEvent.setup();
    store.notes = [
      {
        id: "n1",
        title: "Rascunho",
        content: "",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    const title = await screen.findByLabelText("Título");
    await user.clear(title);
    await user.type(title, "Pauta da reunião");

    // O indicador aparece na hora, antes do debounce virar.
    expect(await screen.findByText("Salvando…")).toBeInTheDocument();

    await waitFor(
      () => expect(store.notes[0].title).toBe("Pauta da reunião"),
      AUTOSAVE
    );
    expect(await screen.findByText("Salvo", {}, AUTOSAVE)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Conteúdo"), "- decidir o orçamento");
    await waitFor(
      () => expect(store.notes[0].content).toBe("- decidir o orçamento"),
      AUTOSAVE
    );
    // Não existe botão Salvar: o autosave é a única via (ver Decisões da 055).
    expect(screen.queryByRole("button", { name: /salvar/i })).toBeNull();
  });

  it("a aba Visualizar renderiza o Markdown do corpo da nota", async () => {
    const user = userEvent.setup();
    store.notes = [
      {
        id: "n1",
        title: "Reforma",
        content: "## Etapas\n\n- [x] pedreiro\n- [ ] pintura\n\n**urgente**",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    await user.click(await screen.findByRole("tab", { name: "Visualizar" }));

    const preview = within(screen.getAllByRole("tabpanel")[0]);
    expect(preview.getByRole("heading", { name: "Etapas" })).toBeInTheDocument();
    expect(preview.getAllByRole("listitem")).toHaveLength(2);
    // GFM: checklist vira checkbox de verdade, não texto "[x]".
    expect(preview.getAllByRole("checkbox")).toHaveLength(2);
    expect(preview.getByText("urgente").tagName).toBe("STRONG");
  });

  it("vincular a nota a um projeto persiste e aparece na lista", async () => {
    const user = userEvent.setup();
    store.notes = [
      {
        id: "n1",
        title: "Materiais",
        content: "cimento e areia",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    await user.click(await screen.findByRole("option", { name: "Obra da casa" }));
    await waitFor(() => expect(store.notes[0].project_id).toBe("p1"), AUTOSAVE);

    // De volta à lista, o vínculo aparece no card.
    await user.click(screen.getByRole("button", { name: /Todas as notas/ }));
    const card = (await screen.findByText("Materiais")).closest("article") as HTMLElement;
    expect(within(card).getByText("Obra da casa")).toBeInTheDocument();
    expect(within(card).getByText("cimento e areia")).toBeInTheDocument();
  });

  it("o card mostra o excerpt do conteúdo, sem a marcação nem o título repetido", async () => {
    store.notes = [
      {
        id: "n1",
        title: "Reforma",
        content: "# Reforma\n\n- comprar **cimento** na terça",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp();

    const card = (await screen.findByText("Reforma")).closest("article") as HTMLElement;
    expect(within(card).getByText("comprar cimento na terça")).toBeInTheDocument();
  });

  it("o filtro casa no título e no conteúdo, sem depender de acento nem de caixa", async () => {
    const user = userEvent.setup();
    store.notes = [
      { id: "n1", title: "Reunião", content: "pauta", project_id: null, updated_at: stamp() },
      { id: "n2", title: "Mercado", content: "cimento", project_id: null, updated_at: stamp() },
    ];
    renderApp();

    const filter = await screen.findByLabelText("Filtrar notas");

    await user.type(filter, "reuniao");
    expect(screen.getByText("Reunião")).toBeInTheDocument();
    expect(screen.queryByText("Mercado")).toBeNull();

    // Agora por um trecho que só existe no conteúdo da outra nota.
    await user.clear(filter);
    await user.type(filter, "CIMENTO");
    expect(screen.getByText("Mercado")).toBeInTheDocument();
    expect(screen.queryByText("Reunião")).toBeNull();

    await user.clear(filter);
    await user.type(filter, "xyz");
    expect(await screen.findByText("Nenhuma nota encontrada")).toBeInTheDocument();
  });

  it("a lista traz a nota editada mais recentemente primeiro", async () => {
    store.notes = [
      { id: "n1", title: "Antiga", content: "", project_id: null, updated_at: stamp() },
      { id: "n2", title: "Recente", content: "", project_id: null, updated_at: stamp() },
    ];
    renderApp();

    const titles = (await screen.findAllByRole("heading", { level: 2 })).map(
      (h) => h.textContent
    );
    expect(titles).toEqual(["Recente", "Antiga"]);
  });

  it("recarregar a página traz o que foi escrito (persistiu no store)", async () => {
    const user = userEvent.setup();
    store.notes = [
      { id: "n1", title: "Rascunho", content: "", project_id: null, updated_at: stamp() },
    ];
    const view = renderApp("/notes/n1");

    await user.type(await screen.findByLabelText("Conteúdo"), "não pode sumir");
    await waitFor(
      () => expect(store.notes[0].content).toBe("não pode sumir"),
      AUTOSAVE
    );

    view.unmount();
    renderApp("/notes/n1");
    // O corpo agora é um CodeMirror (feature 056): o texto vive no `contenteditable`, não num
    // `value` de textarea.
    expect(await screen.findByLabelText("Conteúdo")).toHaveTextContent(
      "não pode sumir"
    );
  });

  it("digitar `[[` no editor sugere os títulos das outras notas", async () => {
    const user = userEvent.setup();
    store.notes = [
      { id: "n1", title: "Rascunho", content: "", project_id: null, updated_at: stamp() },
      { id: "n2", title: "Lista de materiais", content: "", project_id: null, updated_at: stamp() },
    ];
    renderApp("/notes/n1");

    await user.click(await screen.findByLabelText("Conteúdo"));
    // `[[` duplicado: no `userEvent.keyboard`, `[` é caractere de escape.
    await user.keyboard("ver [[[[mate");

    // O popup do CodeMirror é assíncrono (debounce de digitação), daí o `waitFor`. A busca é pelo
    // elemento do popup, não por texto: o CodeMirror quebra o rótulo em spans para destacar o
    // trecho digitado, então `getByText` não casaria a string inteira.
    const tooltip = await waitFor(
      () => {
        const found = document.querySelector(".cm-tooltip-autocomplete");
        expect(found).not.toBeNull();
        return found as HTMLElement;
      },
      { timeout: 3000 }
    );
    expect(tooltip.textContent).toContain("Lista de materiais");
    // A própria nota aberta não é sugerida: linkar para si mesma não leva a lugar nenhum.
    expect(tooltip.textContent).not.toContain("Rascunho");

    // Escolher a sugestão fecha o wiki-link sozinho, e o que fica gravado é markdown cru.
    // O CodeMirror ignora o Enter nos primeiros 75 ms de popup aberto (`interactionDelay`, para
    // não aceitar sugestão que o usuário nem viu) — esperar é parte de reproduzir o uso real.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await user.keyboard("{Enter}");
    await waitFor(
      () => expect(store.notes[0].content).toBe("ver [[Lista de materiais]]"),
      AUTOSAVE
    );
  });

  it("digitar `/` no começo da linha abre o menu de blocos e insere o esqueleto", async () => {
    const user = userEvent.setup();
    store.notes = [
      { id: "n1", title: "Rascunho", content: "", project_id: null, updated_at: stamp() },
    ];
    renderApp("/notes/n1");

    await user.click(await screen.findByLabelText("Conteúdo"));
    await user.keyboard("/tab");

    const tooltip = await waitFor(
      () => {
        const found = document.querySelector(".cm-tooltip-autocomplete");
        expect(found).not.toBeNull();
        return found as HTMLElement;
      },
      { timeout: 3000 }
    );
    expect(tooltip.textContent).toContain("Tabela");

    // Mesmo `interactionDelay` do popup de `[[`: o CodeMirror ignora o Enter nos primeiros 75 ms.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await user.keyboard("{Enter}");
    await waitFor(
      () => expect(store.notes[0].content).toContain("| --- | --- |"),
      AUTOSAVE
    );
    // A barra do menu não pode sobrar no texto gravado.
    expect(store.notes[0].content).not.toContain("/tab");
  });

  it("um wiki-link resolvido no preview leva para a outra nota", async () => {
    const user = userEvent.setup();
    store.notes = [
      {
        id: "n1",
        title: "Rascunho",
        content: "ver [[Obra da casa]] e [[Nota que não existe]]",
        project_id: null,
        updated_at: stamp(),
      },
      { id: "n2", title: "Obra da casa", content: "", project_id: null, updated_at: stamp() },
    ];
    // As duas notas acima já ocupam n1/n2 — sem isso a nota criada nasceria com id repetido.
    store.seq = 2;
    renderApp("/notes/n1");

    await user.click(await screen.findByRole("tab", { name: "Visualizar" }));

    const link = await screen.findByRole("link", { name: "Obra da casa" });
    expect(link).toHaveAttribute("href", "/notes/n2");
    // O link quebrado vira a ação de criar a nota que falta.
    await user.click(
      screen.getByRole("button", { name: "Criar nota Nota que não existe" })
    );

    await waitFor(() => expect(store.notes).toHaveLength(3));
    expect(store.notes[2].title).toBe("Nota que não existe");
    // E navegou para a nota nova, já aberta no editor. O `waitFor` é sobre o **valor**: o campo
    // "Título" já existe (é o da nota anterior), então esperar só pelo elemento passaria cedo
    // demais e leria o título velho.
    await waitFor(
      () =>
        expect(screen.getByLabelText("Título")).toHaveValue(
          "Nota que não existe"
        ),
      AUTOSAVE
    );
  });

  it("excluir a nota pela lista tira ela do banco e da tela", async () => {
    const user = userEvent.setup();
    store.notes = [
      { id: "n1", title: "Descartável", content: "", project_id: null, updated_at: stamp() },
    ];
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: "Excluir nota Descartável" })
    );
    await user.click(await screen.findByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(store.notes).toHaveLength(0));
    expect(await screen.findByText("Nenhuma nota ainda")).toBeInTheDocument();
  });

  it("excluir o projeto preserva a nota, só desfaz o vínculo (on delete set null)", async () => {
    store.notes = [
      {
        id: "n1",
        title: "Materiais",
        content: "cimento",
        project_id: "p1",
        updated_at: stamp(),
      },
    ];
    deleteProject("p1");
    renderApp();

    const card = (await screen.findByText("Materiais")).closest("article") as HTMLElement;
    expect(within(card).getByText("cimento")).toBeInTheDocument();
    // O projeto sumiu, a nota não.
    expect(screen.queryByText("Obra da casa")).toBeNull();
  });

  it("abrir uma nota que não existe mais mostra o estado vazio, não uma tela quebrada", async () => {
    renderApp("/notes/inexistente");
    expect(await screen.findByText("Nota não encontrada")).toBeInTheDocument();
  });

  it('"Inserir diagrama" escreve um bloco mermaid válido, salva e o preview desenha', async () => {
    const user = userEvent.setup();
    store.notes = [
      {
        id: "n1",
        title: "Fluxo do projeto",
        content: "# Fluxo",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    await user.click(
      await screen.findByRole("button", { name: /inserir diagrama/i })
    );

    // O esqueleto entra no documento cru (markdown na veia) e o autosave grava sozinho.
    await waitFor(
      () => expect(store.notes[0].content).toContain("```mermaid"),
      AUTOSAVE
    );
    expect(store.notes[0].content).toContain("graph TD");
    expect(store.notes[0].content.startsWith("# Fluxo\n\n")).toBe(true);

    await user.click(screen.getByRole("tab", { name: "Visualizar" }));

    const preview = within(screen.getAllByRole("tabpanel")[0]);
    const diagram = await preview.findByTestId("mermaid-diagram");
    expect(diagram.querySelector("svg")).not.toBeNull();
    // O código desenhado é o do bloco, não o markdown inteiro.
    expect(mermaidMock.render).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("graph TD")
    );
    expect(mermaidMock.render).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("# Fluxo")
    );
  });

  // ---- canvas de desenho (feature 058) -------------------------------------------------------

  it("'Novo canvas' cria a nota com kind = canvas e abre o editor de desenho", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /Novo canvas/ }));

    expect(await screen.findByTestId("excalidraw")).toBeInTheDocument();
    expect(store.notes).toHaveLength(1);
    expect(store.notes[0].kind).toBe("canvas");
    // Editor de canvas, não o de markdown: não há aba Escrever/Visualizar.
    expect(screen.queryByRole("tab", { name: "Escrever" })).toBeNull();
    expect(screen.getByLabelText("Título")).toBeInTheDocument();
  });

  it("desenhar num canvas grava o canvas_data e recarregar a página traz o desenho de volta", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: /Novo canvas/ }));
    await screen.findByTestId("excalidraw");

    canvasSpy.onSceneChange?.({
      elements: [
        { id: "r1", type: "rectangle" },
        { id: "a1", type: "arrow" },
      ],
      appState: {},
      files: null,
    });

    await waitFor(
      () =>
        expect(
          (store.notes[0].canvas_data as { elements: unknown[] } | null)?.elements
        ).toHaveLength(2),
      AUTOSAVE
    );

    // Recarregar = remontar refazendo os fetches, como um F5 faria.
    cleanup();
    renderApp(`/notes/${store.notes[0].id}`);
    expect(await screen.findByText("elementos: 2")).toBeInTheDocument();
  });

  it("a lista mostra o canvas com a contagem de elementos, não excerpt de texto", async () => {
    store.notes = [
      {
        id: "n1",
        title: "Arquitetura",
        content: "",
        project_id: null,
        kind: "canvas",
        canvas_data: {
          elements: [{ id: "r1" }, { id: "a1" }, { id: "t1" }],
        },
        updated_at: stamp(),
      },
      {
        id: "n2",
        title: "Pauta",
        content: "combinar o cronograma",
        project_id: null,
        updated_at: stamp(),
      },
    ];
    renderApp();

    expect(await screen.findByText("Canvas · 3 elementos")).toBeInTheDocument();
    // A nota markdown continua com o excerpt de sempre — o card não virou canvas para todo mundo.
    expect(screen.getByText("combinar o cronograma")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Canvas")).toHaveLength(1);
    expect(screen.getAllByLabelText("Nota")).toHaveLength(1);
  });

  it("canvas vazio diz que está vazio, e o singular do contador é 'elemento'", async () => {
    store.notes = [
      {
        id: "n1",
        title: "Em branco",
        content: "",
        project_id: null,
        kind: "canvas",
        canvas_data: { elements: [] },
        updated_at: stamp(),
      },
      {
        id: "n2",
        title: "Um traço",
        content: "",
        project_id: null,
        kind: "canvas",
        canvas_data: { elements: [{ id: "r1" }] },
        updated_at: stamp(),
      },
    ];
    renderApp();

    expect(await screen.findByText("Canvas vazio")).toBeInTheDocument();
    expect(screen.getByText("Canvas · 1 elemento")).toBeInTheDocument();
  });

  it("fluxo completo do embed: criar canvas → desenhar → copiar a referência → colar numa nota → ver o desenho → chegar no canvas", async () => {
    const user = userEvent.setup();
    // O parâmetro tipado é o que deixa `writeText.mock.calls[0][0]` ser `string` no teste.
    const writeText = vi.fn(async (text: string) => text);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    // 1. criar o canvas e desenhar nele
    renderApp();
    await user.click(await screen.findByRole("button", { name: /Novo canvas/ }));
    await screen.findByTestId("excalidraw");
    canvasSpy.onSceneChange?.({
      elements: [{ id: "r1", type: "rectangle" }],
      appState: {},
      files: null,
    });
    await waitFor(
      () =>
        expect(
          (store.notes[0].canvas_data as { elements: unknown[] } | null)?.elements
        ).toHaveLength(1),
      AUTOSAVE
    );
    const canvasId = store.notes[0].id;

    // 2. copiar a referência
    await user.click(screen.getByRole("button", { name: /Copiar referência/ }));
    const copiado = writeText.mock.calls[0][0];
    expect(copiado).toBe(`\`\`\`orbyva-canvas\n${canvasId}\n\`\`\`\n`);

    // 3. colar numa nota markdown — o conteúdo é exatamente o que foi para a área de transferência
    cleanup();
    store.notes.push({
      id: "n-md",
      title: "Pauta",
      content: `# Arquitetura\n\n${copiado}\ndecidir com o time`,
      project_id: null,
      updated_at: stamp(),
    });
    renderApp("/notes/n-md");

    // 4. o preview desenha o canvas embutido
    await user.click(await screen.findByRole("tab", { name: "Visualizar" }));
    const preview = within(screen.getAllByRole("tabpanel")[0]);
    const desenho = await preview.findByTestId("canvas-drawing");
    expect(desenho.querySelector("svg")).not.toBeNull();
    // Desenhou a cena da nota-canvas, não o markdown em volta.
    expect(exportToSvgMock).toHaveBeenCalledWith(
      expect.objectContaining({ elements: [{ id: "r1", type: "rectangle" }] })
    );
    // O resto da nota continua renderizando em volta do desenho.
    expect(preview.getByRole("heading", { name: "Arquitetura" })).toBeInTheDocument();
    expect(preview.getByText("decidir com o time")).toBeInTheDocument();

    // 5. o link leva ao canvas certo
    const link = preview.getByRole("link", { name: /Abrir canvas/ });
    expect(link).toHaveAttribute("href", `/notes/${canvasId}`);
    await user.click(link);
    expect(await screen.findByTestId("excalidraw")).toBeInTheDocument();
    expect(screen.getByText("elementos: 1")).toBeInTheDocument();
  });

  it("nota antiga, sem kind gravado, continua abrindo no editor de markdown", async () => {
    // É a nota que a migration da 055 copiou de `project.notes`: o `default 'markdown'` da coluna
    // é o que a mantém funcionando sem migração de dados (feature 058).
    store.notes = [
      {
        id: "n1",
        title: "Notas do projeto",
        content: "# Pauta\n\ncombinar o cronograma",
        project_id: "p1",
        updated_at: stamp(),
      },
    ];
    renderApp("/notes/n1");

    expect(await screen.findByRole("tab", { name: "Escrever" })).toBeInTheDocument();
    expect(screen.queryByTestId("excalidraw")).toBeNull();

    // E o filtro da lista (busca por título/conteúdo, 055) continua achando as duas coisas.
    cleanup();
    store.notes.push({
      id: "n2",
      title: "Arquitetura",
      content: "",
      project_id: null,
      kind: "canvas",
      canvas_data: { elements: [{ id: "r1" }] },
      updated_at: stamp(),
    });
    renderApp();
    const filter = await screen.findByLabelText("Filtrar notas");
    await userEvent.setup().type(filter, "arquitet");
    expect(screen.getByText("Arquitetura")).toBeInTheDocument();
    expect(screen.queryByText("Notas do projeto")).toBeNull();
  });
});
