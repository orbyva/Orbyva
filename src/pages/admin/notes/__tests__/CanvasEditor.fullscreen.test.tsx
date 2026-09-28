import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CanvasEditor } from "@/pages/admin/notes/CanvasEditor";
import { updateNote } from "@/api/notes/notes";
import { fetchIconAssets } from "@/api/tasks/iconAssets";
import { toCanvasData } from "@/domain/notes/canvasScene";
import type { Note, NoteCanvasData } from "@/types/notes";

/**
 * Modo tela cheia do canvas (feature 171), contra o mesmo Excalidraw de mentira de
 * `CanvasEditor.test.tsx` — o de verdade não roda em jsdom (mede a tela, `ResizeObserver`, canvas
 * 2D e wasm de fonte) e tem 2,7 MB.
 *
 * O que estes testes provam, e que nenhum `tsc`/lint provaria: entrar e sair do modo **não remonta**
 * o `ExcalidrawCanvas` (remontar recarrega `initialData` e apaga o traço que o debounce de 1,5 s
 * ainda não gravou), o feedback de gravação continua visível dentro do modo, e a trava de rolagem
 * do `body` é sempre desfeita — inclusive quando a pessoa sai da nota ainda em tela cheia.
 *
 * O segundo `describe` é a saída por `Esc` (feature 172): a tecla só sai do modo quando o
 * Excalidraw não a quer para si, e o duplo abaixo ganhou um `getAppState` que o teste controla
 * entre uma tecla e outra — é assim que o estado vivo da lib entra na afirmação sem carregá-la.
 */

const { sceneSpy } = vi.hoisted(() => ({
  sceneSpy: {
    onSceneChange: null as ((data: NoteCanvasData) => void) | null,
    /** Quantas vezes o canvas foi **montado**. Trocar de modo tem que deixar este número parado. */
    mounts: 0,
    /**
     * O `appState` que a API imperativa devolve (feature 172). O teste troca este objeto entre um
     * `Esc` e outro, que é como o Excalidraw de verdade se comporta: a guarda lê o estado **do
     * momento da tecla**.
     */
    appState: {} as Record<string, unknown>,
    /**
     * `false` = o duplo **não** chama `onApiReady`, simulando o chunk lazy que ainda não entregou a
     * API (ou uma versão da lib que não a entrega).
     */
    providesApi: true,
    /** Quantas vezes `onApiReady` foi chamado — trocar de modo não pode aumentar este número. */
    apiReadyCalls: 0,
  },
}));

vi.mock("@/pages/admin/notes/ExcalidrawCanvas", () => {
  // Função nomeada (e não arrow anônima em `default:`) por causa do `react-hooks/rules-of-hooks`:
  // ela usa `useEffect` para contar montagens.
  function FakeExcalidrawCanvas({
    initialScene,
    theme,
    onSceneChange,
    onApiReady,
  }: {
    initialScene: { elements: readonly unknown[] };
    theme: string;
    onSceneChange?: (data: NoteCanvasData) => void;
    onApiReady?: (api: { getAppState: () => Record<string, unknown> }) => void;
  }) {
    sceneSpy.onSceneChange = onSceneChange ?? null;
    useEffect(() => {
      sceneSpy.mounts += 1;
    }, []);
    // Efeito separado do contador de montagens e com `onApiReady` na dependência **de propósito**:
    // é assim que uma prop instável apareceria aqui como entrega repetida da API.
    useEffect(() => {
      if (!sceneSpy.providesApi) return;
      sceneSpy.apiReadyCalls += 1;
      onApiReady?.({ getAppState: () => sceneSpy.appState });
    }, [onApiReady]);
    return (
      <div data-testid="excalidraw" data-theme={theme}>
        {`elementos recebidos: ${initialScene.elements.length}`}
      </div>
    );
  }
  return { default: FakeExcalidrawCanvas };
});

vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/api/notes/notes", () => ({ updateNote: vi.fn(async () => {}) }));

// Painéis da 056 não são o assunto aqui; sem os doubles eles iriam ao Supabase.
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
    kind: "canvas",
    canvas_data: toCanvasData([rect], { viewBackgroundColor: "#ffffff" }),
    ...over,
  };
}

/** Debounce curto: o do app é 1,5 s e o teste não pode esperar isso. */
const DEBOUNCE = 20;
const SAVED = { timeout: 2000 };

const ENTER = "Tela cheia";
const EXIT = "Sair da tela cheia";
const FULLSCREEN_REGION = "Canvas em tela cheia";

function renderEditor(note = canvasNote()) {
  return render(
    <MemoryRouter>
      <CanvasEditor note={note} projects={[]} debounceMs={DEBOUNCE} />
    </MemoryRouter>
  );
}

/** O contêiner que vira overlay — e, dentro dele, a barra fina, que é o **primeiro** filho. */
function fullscreenBar(): HTMLElement {
  const region = screen.getByRole("region", { name: FULLSCREEN_REGION });
  return region.firstElementChild as HTMLElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  sceneSpy.onSceneChange = null;
  sceneSpy.mounts = 0;
  sceneSpy.appState = {};
  sceneSpy.providesApi = true;
  sceneSpy.apiReadyCalls = 0;
  vi.mocked(fetchIconAssets).mockResolvedValue([]);
  document.body.style.overflow = "";
});

/**
 * `Esc` pelo teclado de verdade (`userEvent`): o evento nasce no elemento focado e sobe até o
 * `window`, que é onde o listener do modo cheio escuta.
 */
const ESC = "{Escape}";

describe("CanvasEditor em tela cheia", () => {
  it("abre em modo normal: projeto e painéis na tela, sem barra e sem botão de sair", async () => {
    renderEditor();
    await screen.findByTestId("excalidraw");

    expect(screen.getByRole("listbox", { name: "Projeto" })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Vínculos/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: /Mencionada em/ })).toBeVisible();
    expect(screen.getByLabelText("Título")).toBeVisible();

    // O modo não persiste (P4): não há leitura de preferência nenhuma que possa abrir em cheio.
    expect(screen.queryByRole("button", { name: EXIT })).toBeNull();
    expect(screen.queryByRole("region", { name: FULLSCREEN_REGION })).toBeNull();
    expect(screen.getByRole("button", { name: ENTER })).toBeVisible();
  });

  it("'Tela cheia' esconde título, projeto e painéis e mostra a barra com o botão de sair", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.click(screen.getByRole("button", { name: ENTER }));

    // Escondido, **não** desmontado: os nós continuam no documento (`hidden: true` acha), só não
    // são visíveis nem chegam à árvore de acessibilidade.
    expect(
      screen.getByRole("listbox", { name: "Projeto", hidden: true })
    ).not.toBeVisible();
    expect(
      screen.getByRole("heading", { name: /Vínculos/, hidden: true })
    ).not.toBeVisible();
    expect(
      screen.getByRole("heading", { name: /Mencionada em/, hidden: true })
    ).not.toBeVisible();
    expect(screen.getByLabelText("Título")).not.toBeVisible();
    expect(
      screen.getByRole("button", { name: ENTER, hidden: true })
    ).not.toBeVisible();

    // O desenho e a barra, sim.
    expect(screen.getByTestId("excalidraw")).toBeVisible();
    const bar = fullscreenBar();
    expect(within(bar).getByRole("button", { name: EXIT })).toBeVisible();
    expect(within(bar).getByText("Arquitetura")).toBeVisible();

    // Overlay CSS na faixa que cobre o chrome do AdminLayout (vai até `z-40`) e fica abaixo do
    // viewport de toast (`z-[100]`) — é o que mantém o toast de erro visível no modo cheio.
    const region = screen.getByRole("region", { name: FULLSCREEN_REGION });
    expect(region.className).toMatch(/(^|\s)fixed(\s|$)/);
    expect(region.className).toMatch(/(^|\s)inset-0(\s|$)/);
    expect(region.className).toMatch(/(^|\s)z-50(\s|$)/);
  });

  it("'Sair da tela cheia' devolve a tela normal", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.click(screen.getByRole("button", { name: ENTER }));
    await user.click(screen.getByRole("button", { name: EXIT }));

    expect(screen.getByRole("listbox", { name: "Projeto" })).toBeVisible();
    expect(screen.getByLabelText("Título")).toBeVisible();
    expect(screen.getByRole("button", { name: ENTER })).toBeVisible();
    expect(screen.queryByRole("button", { name: EXIT })).toBeNull();
    expect(screen.queryByRole("region", { name: FULLSCREEN_REGION })).toBeNull();
  });

  it("entrar e sair do modo NÃO remonta o Excalidraw — é o mesmo nó", async () => {
    const user = userEvent.setup();
    renderEditor();
    const canvas = await screen.findByTestId("excalidraw");
    expect(sceneSpy.mounts).toBe(1);

    await user.click(screen.getByRole("button", { name: ENTER }));
    expect(screen.getByTestId("excalidraw")).toBe(canvas);
    expect(sceneSpy.mounts).toBe(1);

    await user.click(screen.getByRole("button", { name: EXIT }));
    // Mesmo nó depois de ir e voltar: remontar recarregaria `initialData` e jogaria fora a cena
    // que o debounce ainda não gravou.
    expect(screen.getByTestId("excalidraw")).toBe(canvas);
    expect(sceneSpy.mounts).toBe(1);
  });

  it("o autosave continua gravando em tela cheia, com 'Salvando…' e 'Salvo' dentro da barra", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.click(screen.getByRole("button", { name: ENTER }));
    sceneSpy.onSceneChange?.(toCanvasData([rect, arrow], {}));

    expect(await within(fullscreenBar()).findByText("Salvando…")).toBeVisible();
    await waitFor(() => expect(updateNote).toHaveBeenCalledTimes(1), SAVED);
    expect(vi.mocked(updateNote).mock.calls[0][0]).toMatchObject({
      id: "c1",
      canvas_data: { elements: [rect, arrow] },
    });
    expect(
      await within(fullscreenBar()).findByText("Salvo", {}, SAVED)
    ).toBeVisible();
    // Um indicador por vez: dois `role="status"` com o mesmo texto anunciariam em dobro.
    expect(screen.getAllByRole("status", { hidden: true })).toHaveLength(1);
  });

  it("trava a rolagem do body no modo cheio e devolve o valor anterior ao sair", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.click(screen.getByRole("button", { name: ENTER }));
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByRole("button", { name: EXIT }));
    expect(document.body.style.overflow).toBe("auto");
  });

  it("sair da nota ainda em tela cheia não deixa a página travada", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    const { unmount } = renderEditor();
    await screen.findByTestId("excalidraw");

    await user.click(screen.getByRole("button", { name: ENTER }));
    expect(document.body.style.overflow).toBe("hidden");

    // Equivale a navegar para outra nota / para `/notes` sem sair do modo.
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("o foco vai para 'Sair da tela cheia' ao entrar e volta para 'Tela cheia' ao sair", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.click(screen.getByRole("button", { name: ENTER }));
    expect(screen.getByRole("button", { name: EXIT })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: EXIT }));
    expect(screen.getByRole("button", { name: ENTER })).toHaveFocus();
  });

  it("montar o editor não rouba o foco de ninguém", async () => {
    renderEditor();
    await screen.findByTestId("excalidraw");

    // Nasce em modo normal (P4) e o efeito de foco ignora a primeira renderização.
    expect(document.body).toHaveFocus();
  });

  it("em janela estreita a barra fica só com o indicador e o botão de sair (P5)", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.click(screen.getByRole("button", { name: ENTER }));

    const bar = fullscreenBar();
    // O título é o único item que some abaixo de `sm`; o botão de sair e o indicador ficam sempre.
    const heading = within(bar).getByText("Arquitetura");
    expect(heading.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(heading.className).toMatch(/(^|\s)sm:block(\s|$)/);
    expect(within(bar).getByRole("button", { name: EXIT }).className).not.toMatch(
      /sm:/
    );
    // Barra fina e que não encolhe: o desenho fica com o resto da altura.
    expect(bar.className).toMatch(/(^|\s)h-10(\s|$)/);
    expect(bar.className).toMatch(/(^|\s)shrink-0(\s|$)/);
  });

  it("entrar e sair do modo não reentrega a API do Excalidraw", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId("excalidraw");
    expect(sceneSpy.apiReadyCalls).toBe(1);

    await user.click(screen.getByRole("button", { name: ENTER }));
    await user.click(screen.getByRole("button", { name: EXIT }));

    // `onApiReady` é um `useCallback` sem dependência: a identidade não muda de um render para o
    // outro. Se mudasse, a lib reentregaria a API a cada troca de modo.
    expect(sceneSpy.apiReadyCalls).toBe(1);
  });

  it("o desenho continua com altura explícita nos dois modos", async () => {
    const user = userEvent.setup();
    renderEditor();
    const canvas = await screen.findByTestId("excalidraw");
    const box = canvas.parentElement as HTMLElement;

    // O Excalidraw se posiciona em absoluto: sem altura explícita do pai ele colapsa.
    expect(box.className).toMatch(/h-\[70vh\]/);

    await user.click(screen.getByRole("button", { name: ENTER }));
    // Em tela cheia a altura vem do flex: a linha estica dentro do overlay.
    expect(box.className).toMatch(/(^|\s)flex-1(\s|$)/);
    expect(box.className).toMatch(/(^|\s)min-h-0(\s|$)/);
    expect(box.className).not.toMatch(/h-\[70vh\]/);
  });
});

/**
 * A guarda do `Esc` (feature 172): a tecla só sai do modo cheio quando o Excalidraw não a quer
 * para si. Sem isso, apertar `Esc` para limpar a seleção arrancaria a pessoa do desenho.
 */
describe("CanvasEditor: saída da tela cheia por Esc", () => {
  async function enterFullscreen(user: ReturnType<typeof userEvent.setup>) {
    renderEditor();
    await screen.findByTestId("excalidraw");
    await user.click(screen.getByRole("button", { name: ENTER }));
    expect(screen.getByRole("button", { name: EXIT })).toBeVisible();
  }

  it("com elemento selecionado, Esc NÃO sai — a tecla é do Excalidraw", async () => {
    const user = userEvent.setup();
    sceneSpy.appState = { selectedElementIds: { r1: true } };
    await enterFullscreen(user);

    await user.keyboard(ESC);

    expect(screen.getByRole("button", { name: EXIT })).toBeVisible();
    expect(screen.getByRole("region", { name: FULLSCREEN_REGION })).toBeVisible();
    expect(screen.getByLabelText("Título")).not.toBeVisible();
  });

  it("com um painel do Excalidraw aberto (openPopup), Esc NÃO sai", async () => {
    const user = userEvent.setup();
    sceneSpy.appState = { selectedElementIds: {}, openPopup: "elementStroke" };
    await enterFullscreen(user);

    await user.keyboard(ESC);

    expect(screen.getByRole("button", { name: EXIT })).toBeVisible();
    expect(screen.getByLabelText("Título")).not.toBeVisible();
  });

  it("com o appState limpo, Esc sai e o botão 'Tela cheia' volta", async () => {
    const user = userEvent.setup();
    sceneSpy.appState = { selectedElementIds: {}, openPopup: null };
    await enterFullscreen(user);

    await user.keyboard(ESC);

    expect(screen.queryByRole("button", { name: EXIT })).toBeNull();
    expect(screen.queryByRole("region", { name: FULLSCREEN_REGION })).toBeNull();
    expect(screen.getByRole("button", { name: ENTER })).toBeVisible();
    expect(screen.getByLabelText("Título")).toBeVisible();
    // A saída por tecla é a **mesma** do botão, devolução de foco inclusive.
    expect(screen.getByRole("button", { name: ENTER })).toHaveFocus();
    // E não remontou o desenho: a cena que o debounce ainda não gravou continua onde estava.
    expect(sceneSpy.mounts).toBe(1);
  });

  it("dois Esc seguidos: o primeiro é do Excalidraw, o segundo sai do modo", async () => {
    const user = userEvent.setup();
    sceneSpy.appState = { selectedElementIds: { r1: true } };
    await enterFullscreen(user);

    await user.keyboard(ESC);
    expect(screen.getByRole("button", { name: EXIT })).toBeVisible();

    // O Excalidraw limpou a seleção com aquele primeiro Esc; o estado vivo agora está limpo.
    sceneSpy.appState = { selectedElementIds: {} };
    await user.keyboard(ESC);

    expect(screen.queryByRole("button", { name: EXIT })).toBeNull();
    expect(screen.getByRole("button", { name: ENTER })).toBeVisible();
  });

  it("sem a API do Excalidraw (chunk ainda não entregou), Esc sai — falha aberta", async () => {
    const user = userEvent.setup();
    sceneSpy.providesApi = false;
    await enterFullscreen(user);
    expect(sceneSpy.apiReadyCalls).toBe(0);

    await user.keyboard(ESC);

    expect(screen.queryByRole("button", { name: EXIT })).toBeNull();
    expect(screen.getByRole("button", { name: ENTER })).toBeVisible();
  });

  it("Esc já tratado por outro (defaultPrevented) não sai do modo", async () => {
    const user = userEvent.setup();
    sceneSpy.appState = { selectedElementIds: {} };
    await enterFullscreen(user);

    // Um diálogo do Radix, por exemplo, fecha no Esc e marca o evento como tratado.
    const swallow = (event: KeyboardEvent) => event.preventDefault();
    document.addEventListener("keydown", swallow);
    try {
      await user.keyboard(ESC);
    } finally {
      document.removeEventListener("keydown", swallow);
    }

    expect(screen.getByRole("button", { name: EXIT })).toBeVisible();
  });

  it("em modo normal, Esc não liga nem desliga nada", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByTestId("excalidraw");

    await user.keyboard(ESC);

    expect(screen.queryByRole("button", { name: EXIT })).toBeNull();
    expect(screen.queryByRole("region", { name: FULLSCREEN_REGION })).toBeNull();
    expect(screen.getByRole("button", { name: ENTER })).toBeVisible();
    expect(screen.getByRole("listbox", { name: "Projeto" })).toBeVisible();
  });

  it("depois de sair, o listener some: outro Esc não faz nada", async () => {
    const user = userEvent.setup();
    sceneSpy.appState = { selectedElementIds: {} };
    await enterFullscreen(user);

    await user.keyboard(ESC);
    expect(screen.queryByRole("button", { name: EXIT })).toBeNull();

    // Se o cleanup do `useEffect` não tivesse removido o listener, este Esc ainda rodaria a
    // saída — e, pior, continuaria rodando em qualquer outra tela de notas.
    await user.keyboard(ESC);
    expect(screen.getByRole("button", { name: ENTER })).toBeVisible();
    expect(screen.getByRole("listbox", { name: "Projeto" })).toBeVisible();
    expect(screen.getByLabelText("Título")).toBeVisible();
  });

  it("o listener de keydown só existe enquanto o modo está ligado", async () => {
    const user = userEvent.setup();
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    try {
      sceneSpy.appState = { selectedElementIds: {} };
      renderEditor();
      await screen.findByTestId("excalidraw");
      const keydownOf = (spy: typeof addSpy) =>
        spy.mock.calls.filter(([type]) => type === "keydown");

      // Em modo normal não há listener nenhum: `Esc` em cima do canvas é assunto do Excalidraw.
      expect(keydownOf(addSpy)).toHaveLength(0);

      await user.click(screen.getByRole("button", { name: ENTER }));
      expect(keydownOf(addSpy)).toHaveLength(1);
      expect(keydownOf(removeSpy)).toHaveLength(0);

      await user.click(screen.getByRole("button", { name: EXIT }));
      // Mesmo handler removido — sem isso ele sobreviveria à saída e a cada entrada haveria mais um.
      expect(keydownOf(removeSpy)).toHaveLength(1);
      expect(keydownOf(removeSpy)[0][1]).toBe(keydownOf(addSpy)[0][1]);
    } finally {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    }
  });

  it("o botão de sair ignora a guarda: sai mesmo com seleção ativa", async () => {
    const user = userEvent.setup();
    sceneSpy.appState = { selectedElementIds: { r1: true } };
    await enterFullscreen(user);

    await user.click(screen.getByRole("button", { name: EXIT }));

    expect(screen.queryByRole("button", { name: EXIT })).toBeNull();
    expect(screen.getByRole("button", { name: ENTER })).toBeVisible();
  });
});
