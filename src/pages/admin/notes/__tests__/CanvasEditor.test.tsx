import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CanvasEditor } from "@/pages/admin/notes/CanvasEditor";
import { ASSETS_PANEL_TITLE } from "@/pages/admin/notes/CanvasAssetsPanel";
import { updateNote } from "@/api/notes/notes";
import { fetchIconAssets } from "@/api/tasks/iconAssets";
import { toCanvasData } from "@/domain/notes/canvasScene";
import type { Note, NoteCanvasData } from "@/types/notes";

/**
 * Editor de canvas (feature 058) contra um Excalidraw de mentira.
 *
 * O Excalidraw de verdade não roda em jsdom (mede a tela, usa `ResizeObserver`, canvas 2D e wasm de
 * fonte) e tem 2,7 MB — carregá-lo aqui tornaria a suíte inviável. O duplo abaixo tem a mesma
 * **fronteira** do módulo real (`initialScene`, `theme`, `onSceneChange` com `NoteCanvasData`), que
 * é o que este teste precisa exercer: o que sai do desenho vira `update` no banco, e o que estava
 * no banco chega ao desenho. Substitui a verificação manual no navegador, proibida pela skill
 * `next`.
 */

const { sceneSpy } = vi.hoisted(() => ({
  sceneSpy: {
    onSceneChange: null as ((data: NoteCanvasData) => void) | null,
    /** Quantas vezes o canvas foi **montado**. Uma remontagem recarrega `initialData` e joga fora
     * a cena que o debounce ainda não gravou — é o defeito que a 132 precisa manter longe. */
    mounts: 0,
  },
}));

vi.mock("@/pages/admin/notes/ExcalidrawCanvas", () => {
  // Componente nomeado (e não um arrow anônimo em `default:`) porque ele usa `useEffect` para
  // contar montagens — o `rules-of-hooks` do ESLint só reconhece hook dentro de algo que **parece**
  // componente, ou seja, com nome em maiúscula.
  function FakeExcalidrawCanvas({
    initialScene,
    theme,
    onSceneChange,
  }: {
    initialScene: { elements: readonly unknown[] };
    theme: string;
    onSceneChange?: (data: NoteCanvasData) => void;
  }) {
    sceneSpy.onSceneChange = onSceneChange ?? null;
    useEffect(() => {
      sceneSpy.mounts += 1;
    }, []);
    return (
      <div data-testid="excalidraw" data-theme={theme}>
        {`elementos recebidos: ${initialScene.elements.length}`}
      </div>
    );
  }
  return { default: FakeExcalidrawCanvas };
});

// A biblioteca de assets do painel "Orbyva Assets" (132) — mockada para que "abrir um canvas não
// consulta assets" seja uma afirmação verificável, e não um efeito de o Supabase não responder.
vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/api/notes/notes", () => ({ updateNote: vi.fn(async () => {}) }));

// Painéis da 056 não são o assunto deste teste; sem os doubles eles iriam ao Supabase.
vi.mock("@/api/notes/noteLinks", () => ({
  fetchNoteLinks: vi.fn(async () => []),
  createNoteLink: vi.fn(),
  deleteNoteLink: vi.fn(),
  fetchNotesSharingEntity: vi.fn(async () => []),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const rect = { id: "r1", type: "rectangle", x: 0, y: 0 };
const arrow = { id: "a1", type: "arrow" };

function canvasNote(over: Partial<Note> = {}): Note {
  return {
    id: "c1",
    title: "Arquitetura",
    content: "",
    project_id: null,
    folder_id: null,
    kind: "canvas",
    canvas_data: toCanvasData([rect], { viewBackgroundColor: "#ffffff" }),
    ...over,
  };
}

/** Debounce curto: o do app é 1,5 s e o teste não pode esperar isso. */
const DEBOUNCE = 20;
const SAVED = { timeout: 2000 };

function renderEditor(note = canvasNote()) {
  return render(
    <MemoryRouter>
      <CanvasEditor note={note} projects={[]} debounceMs={DEBOUNCE} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sceneSpy.onSceneChange = null;
  sceneSpy.mounts = 0;
  vi.mocked(fetchIconAssets).mockResolvedValue([]);
  document.documentElement.classList.remove("dark");
});

describe("CanvasEditor", () => {
  it("mostra o esqueleto enquanto o chunk do Excalidraw não chegou", async () => {
    renderEditor();
    // `React.lazy` resolve num microtask: antes disso, quem está na tela é o fallback do Suspense.
    expect(
      screen.getByRole("status", { name: "Carregando o canvas" })
    ).toBeInTheDocument();
    expect(await screen.findByTestId("excalidraw")).toBeInTheDocument();
  });

  it("o desenho salvo chega ao canvas — é o que faz recarregar a página preservar o traço", async () => {
    renderEditor(canvasNote({ canvas_data: toCanvasData([rect, arrow], {}) }));
    expect(await screen.findByText("elementos recebidos: 2")).toBeInTheDocument();
  });

  it("canvas novo (sem desenho no banco) abre em branco, sem quebrar", async () => {
    renderEditor(canvasNote({ canvas_data: null }));
    expect(await screen.findByText("elementos recebidos: 0")).toBeInTheDocument();
  });

  it("desenhar salva o canvas_data depois do debounce, sem botão Salvar", async () => {
    renderEditor();
    await screen.findByTestId("excalidraw");

    sceneSpy.onSceneChange?.(toCanvasData([rect, arrow], {}));

    expect(await screen.findByText("Salvando…")).toBeInTheDocument();
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1), SAVED);
    expect(vi.mocked(updateNote).mock.calls[0][0]).toMatchObject({
      id: "c1",
      canvas_data: { elements: [rect, arrow] },
    });
    expect(await screen.findByText("Salvo", {}, SAVED)).toBeInTheDocument();
  });

  it("o onChange de montagem NÃO grava — abrir um canvas não pode carimbar updated_at", async () => {
    renderEditor();
    await screen.findByTestId("excalidraw");

    // É o que o Excalidraw dispara ao montar: a mesma cena que veio do banco, de volta.
    sceneSpy.onSceneChange?.(toCanvasData([rect], { viewBackgroundColor: "#ffffff" }));

    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE * 4));
    expect(updateNote).not.toHaveBeenCalled();
    expect(screen.queryByText("Salvando…")).toBeNull();
  });

  it("vários movimentos seguidos viram uma gravação só, com o último estado", async () => {
    renderEditor();
    await screen.findByTestId("excalidraw");

    sceneSpy.onSceneChange?.(toCanvasData([rect, arrow], {}));
    sceneSpy.onSceneChange?.(toCanvasData([rect, arrow, { id: "t1", type: "text" }], {}));
    sceneSpy.onSceneChange?.(
      toCanvasData([rect, arrow, { id: "t1", type: "text" }, { id: "e1", type: "ellipse" }], {})
    );

    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1), SAVED);
    const saved = vi.mocked(updateNote).mock.calls[0][0].canvas_data as NoteCanvasData;
    expect(saved.elements).toHaveLength(4);
  });

  it("renomear grava o título sem inventar desenho nenhum", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.type(screen.getByLabelText("Título"), " v2");

    // O debounce pode gravar no meio do `type` (o picker de pasta deixou cada tecla mais lenta
    // que os 20 ms). Esperar o título fechado, não a primeira chamada.
    await waitFor(() => {
      const patch = vi.mocked(updateNote).mock.calls.at(-1)?.[0];
      expect(patch?.title).toBe("Arquitetura v2");
      expect(patch).not.toHaveProperty("canvas_data");
    }, SAVED);
  });

  it("erro ao salvar vira toast e 'Não salvo', sem perder o desenho da tela", async () => {
    vi.mocked(updateNote).mockRejectedValueOnce(new Error("row level security"));
    renderEditor();
    await screen.findByTestId("excalidraw");

    sceneSpy.onSceneChange?.(toCanvasData([rect, arrow], {}));

    expect(await screen.findByText("Não salvo", {}, SAVED)).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        title: "Não foi possível salvar o canvas",
      })
    );
    expect(screen.getByTestId("excalidraw")).toBeInTheDocument();
  });

  it("o canvas segue o tema do app", async () => {
    document.documentElement.classList.add("dark");
    renderEditor();
    expect(await screen.findByTestId("excalidraw")).toHaveAttribute(
      "data-theme",
      "dark"
    );
  });

  it("'Copiar referência' põe o bloco ```orbyva-canvas com o id na área de transferência", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    // Depois do `setup()` e com `defineProperty`: o `navigator.clipboard` só tem getter, e o
    // próprio user-event instala o stub dele durante o `setup()` — trocar antes não adianta.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.click(screen.getByRole("button", { name: /Copiar referência/ }));

    expect(writeText).toHaveBeenCalledWith("```orbyva-canvas\nc1\n```\n");
    expect(await screen.findByRole("button", { name: /Copiado/ })).toBeInTheDocument();
  });

  /**
   * Feature 132 — o painel "Orbyva Assets" passou a dividir a linha com o desenho. Os três testes
   * abaixo são os de **regressão da mudança de layout**: o desenho continua com altura explícita,
   * o autosave não mudou, e mexer no painel não remonta o canvas.
   */
  describe("painel Orbyva Assets", () => {
    it("aparece ao lado do desenho, e abrir o canvas não consulta a biblioteca", async () => {
      renderEditor();
      const canvas = await screen.findByTestId("excalidraw");

      const panel = document.querySelector("aside");
      expect(panel).not.toBeNull();
      expect(
        screen.getByRole("button", { name: `Abrir ${ASSETS_PANEL_TITLE}` })
      ).toBeInTheDocument();

      // Irmãos na mesma linha, nesta ordem: painel à esquerda, desenho à direita — e abaixo de
      // `sm` a mesma ordem vira coluna, com o painel **acima** do desenho.
      expect(panel?.nextElementSibling?.contains(canvas)).toBe(true);
      const row = panel?.parentElement as HTMLElement;
      expect(row.className).toMatch(/(^|\s)flex-col(\s|$)/);
      expect(row.className).toMatch(/sm:flex-row/);
      // O Excalidraw se posiciona em absoluto: sem altura explícita no irmão ele colapsa.
      const canvasBox = panel?.nextElementSibling as HTMLElement;
      expect(canvasBox.className).toMatch(/h-\[70vh\]/);
      expect(canvasBox.className).toMatch(/min-h-\[420px\]/);

      // O painel nasce fechado fora da tela larga, e fechado não busca nada: quem nunca usa a
      // biblioteca não paga uma consulta por canvas aberto.
      expect(fetchIconAssets).not.toHaveBeenCalled();
    });

    it("recolher e expandir o painel NÃO remonta o canvas", async () => {
      const user = userEvent.setup();
      renderEditor();
      const canvas = await screen.findByTestId("excalidraw");
      expect(sceneSpy.mounts).toBe(1);

      await user.click(screen.getByRole("button", { name: `Abrir ${ASSETS_PANEL_TITLE}` }));
      await user.click(screen.getByRole("button", { name: `Recolher ${ASSETS_PANEL_TITLE}` }));

      // Mesma montagem e **mesmo nó**: remontar recarregaria `initialData` e apagaria o traço que
      // o debounce de 1,5 s ainda não gravou.
      expect(sceneSpy.mounts).toBe(1);
      expect(screen.getByTestId("excalidraw")).toBe(canvas);
    });

    it("o autosave continua igual depois de mexer no painel", async () => {
      const user = userEvent.setup();
      renderEditor();
      await screen.findByTestId("excalidraw");

      await user.click(screen.getByRole("button", { name: `Abrir ${ASSETS_PANEL_TITLE}` }));
      sceneSpy.onSceneChange?.(toCanvasData([rect, arrow], {}));

      await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1), SAVED);
      expect(vi.mocked(updateNote).mock.calls[0][0]).toMatchObject({
        id: "c1",
        canvas_data: { elements: [rect, arrow] },
      });
      expect(await screen.findByText("Salvo", {}, SAVED)).toBeInTheDocument();
    });
  });
});
