import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ASSET_COPY_FAILED_TITLE,
  ASSETS_PANEL_TITLE,
  CanvasAssetsPanel,
} from "@/pages/admin/notes/CanvasAssetsPanel";
import { ASSET_COPY_MESSAGE } from "@/domain/notes/assetClipboard";
import { ICON_LIBRARY_EMPTY } from "@/components/assets/AssetLibrary";
import { fetchIconAssets, uploadIconAsset } from "@/api/tasks/iconAssets";
import type { IconAsset } from "@/types/tasks";

/**
 * Features 132 e 133 — "Orbyva Assets" montado direto, sem o editor de canvas em volta. O que este
 * arquivo prova é o contrato do painel: **fechado não consulta nada**, o clique põe o **asset** no
 * clipboard no formato certo (imagem para PNG, markup para SVG, link só quando não dá), o toast
 * corresponde ao que de fato foi escrito, a falha total aparece em vez de sumir, e a biblioteca da
 * 131 continua inteira aqui dentro (enviar, colar SVG, gerenciar).
 *
 * Substitui a verificação no navegador, proibida pela skill `next`.
 */
vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

const FOGUETE = "https://cdn.example.com/library/foguete.svg";
const LIVRO = "https://cdn.example.com/library/livro.png";
const CLEAN_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';

function twoAssets(): IconAsset[] {
  return [
    { id: "icon-1", name: "Foguete", url: FOGUETE },
    { id: "icon-2", name: "Livro", url: LIVRO },
  ];
}

/**
 * O painel lê a largura **uma vez**, na montagem (`matchMedia`), para nascer aberto na tela larga e
 * fechado no celular. jsdom não tem media query de verdade: o stub é o que separa os dois casos.
 */
function screenWidth(wide: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: wide,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/**
 * jsdom não tem `clipboard.write` nem `ClipboardItem` — é justamente o que a 133 usa. O par
 * `clipboard()` + `withClipboardItem()` é o que permite provar **qual MIME** foi escrito sem abrir
 * navegador; sem `withClipboardItem()` o ambiente do teste é o de um navegador sem clipboard de
 * imagem, que é o caso de borda do fallback.
 */
function clipboard(
  options: {
    writeText?: (text: string) => Promise<void>;
    write?: (items: ClipboardItem[]) => Promise<void>;
  } = {}
) {
  const value = {
    writeText: vi.fn(options.writeText ?? (async () => {})),
    write: vi.fn(options.write ?? (async () => {})),
  };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
  return value;
}

/** Guarda o mapa MIME → conteúdo, igual ao construtor real. */
class FakeClipboardItem {
  constructor(readonly items: Record<string, Blob | string | PromiseLike<Blob | string>>) {}
}

function withClipboardItem() {
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
}

/** O `fetch` que a cópia usa para buscar o arquivo do bucket. */
function serving(body: Blob | string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    blob: async () => (body instanceof Blob ? body : new Blob([body])),
    text: async () => (body instanceof Blob ? await body.text() : body),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** `[mime, conteúdo]` de cada escrita de imagem, com as promessas já resolvidas. */
async function written(write: ReturnType<typeof vi.fn>) {
  const rows: Array<[string, unknown]> = [];
  for (const [items] of write.mock.calls) {
    for (const item of items as FakeClipboardItem[]) {
      for (const [mime, value] of Object.entries(item.items)) rows.push([mime, await value]);
    }
  }
  return rows;
}

function panel(): HTMLElement {
  return document.querySelector("aside") as HTMLElement;
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

beforeEach(() => {
  vi.mocked(fetchIconAssets).mockReset();
  vi.mocked(fetchIconAssets).mockResolvedValue([]);
  vi.mocked(uploadIconAsset).mockReset();
  toastMock.mockReset();
  screenWidth(true);
});

afterEach(() => {
  // `fetch` e `ClipboardItem` voltam ao que o ambiente tinha: o teste do fallback depende de
  // `ClipboardItem` **não** existir, e um stub vazado de outro teste o mascararia.
  vi.unstubAllGlobals();
});

describe("CanvasAssetsPanel", () => {
  it("em tela estreita nasce fechado e não consulta a biblioteca; abrir busca uma vez e lista os assets", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    screenWidth(false);
    render(<CanvasAssetsPanel />);

    // Abrir um canvas no celular não pode disparar consulta de assets.
    expect(fetchIconAssets).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: `Abrir ${ASSETS_PANEL_TITLE}` });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Copiar Foguete" })).toBeNull();

    await user.click(toggle);

    expect(await screen.findByRole("button", { name: "Copiar Foguete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar Livro" })).toBeInTheDocument();
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: `Recolher ${ASSETS_PANEL_TITLE}` })
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("em tela larga nasce aberto, com o rótulo no cabeçalho e a lista já carregada", async () => {
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<CanvasAssetsPanel />);

    expect(await screen.findByRole("button", { name: "Copiar Foguete" })).toBeInTheDocument();
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);
    // O nome aparece **uma** vez: o cabeçalho do painel rotula, a biblioteca não repete.
    expect(screen.getAllByText(ASSETS_PANEL_TITLE)).toHaveLength(1);
  });

  it("o botão de recolher aponta para o corpo do painel (aria-controls)", async () => {
    render(<CanvasAssetsPanel />);

    const toggle = screen.getByRole("button", { name: `Recolher ${ASSETS_PANEL_TITLE}` });
    const bodyId = toggle.getAttribute("aria-controls");
    expect(bodyId).toBeTruthy();
    const body = document.getElementById(bodyId as string);
    expect(body).not.toBeNull();
    expect(await screen.findByText(ICON_LIBRARY_EMPTY)).toBe(
      body?.querySelector("p") ?? null
    );
  });

  it("clicar num asset PNG escreve a imagem no clipboard e diz que o asset foi copiado", async () => {
    const user = userEvent.setup();
    const png = new Blob(["png-bytes"], { type: "image/png" });
    const fetchMock = serving(png);
    withClipboardItem();
    const board = clipboard();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<CanvasAssetsPanel />);

    await user.click(await screen.findByRole("button", { name: "Copiar Livro" }));

    await vi.waitFor(() => expect(board.write).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(LIVRO);
    // O que foi para o clipboard é a **imagem**, não o endereço dela.
    expect(await written(board.write)).toEqual([["image/png", png]]);
    expect(board.writeText).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: ASSET_COPY_MESSAGE.image.title,
        description: ASSET_COPY_MESSAGE.image.description,
      })
    );
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" })
    );
  });

  it("asset .svg vai como markup em texto, não como URL nem como imagem", async () => {
    const user = userEvent.setup();
    serving(CLEAN_SVG);
    withClipboardItem();
    const board = clipboard();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<CanvasAssetsPanel />);

    await user.click(await screen.findByRole("button", { name: "Copiar Foguete" }));

    await vi.waitFor(() => expect(board.writeText).toHaveBeenCalledWith(CLEAN_SVG));
    expect(board.writeText).not.toHaveBeenCalledWith(FOGUETE);
    expect(board.write).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: ASSET_COPY_MESSAGE.svgText.title })
    );
  });

  it("sem ClipboardItem no navegador cai no link — e o toast diz isso, sem prometer imagem", async () => {
    const user = userEvent.setup();
    serving(new Blob(["png-bytes"], { type: "image/png" }));
    // Nada de `withClipboardItem()`: é o Safari sem permissão / o contexto inseguro.
    const board = clipboard();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<CanvasAssetsPanel />);

    await user.click(await screen.findByRole("button", { name: "Copiar Livro" }));

    await vi.waitFor(() => expect(board.writeText).toHaveBeenCalledWith(LIVRO));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: ASSET_COPY_MESSAGE.link.title,
        description: ASSET_COPY_MESSAGE.link.description,
      })
    );
    // O defeito que este teste existe para impedir: dizer "asset copiado" com um link no clipboard.
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: ASSET_COPY_MESSAGE.image.title })
    );
  });

  it("dois cliques rápidos no mesmo asset disparam uma escrita só", async () => {
    serving(new Blob(["png-bytes"], { type: "image/png" }));
    withClipboardItem();
    const board = clipboard();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<CanvasAssetsPanel />);

    const button = await screen.findByRole("button", { name: "Copiar Livro" });
    // No mesmo tick, de propósito: é assim que o clique duplo chega, e é onde um guarda por
    // `useState` falharia (o segundo handler ainda leria o estado antigo).
    fireEvent.click(button);
    fireEvent.click(button);

    // `waitFor` do Testing Library (e não o do Vitest): ele embrulha a espera em `act`, e o que
    // volta depois da escrita é justamente uma atualização de estado (o rótulo sai de "Copiando").
    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: ASSET_COPY_MESSAGE.image.title })
      )
    );
    expect(board.write).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("clipboard que rejeita até o link vira toast destrutivo, em vez de mentir que copiou", async () => {
    const user = userEvent.setup();
    serving(CLEAN_SVG);
    clipboard({
      writeText: async () => {
        throw new Error("Document is not focused");
      },
    });
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<CanvasAssetsPanel />);

    await user.click(await screen.findByRole("button", { name: "Copiar Foguete" }));

    await vi.waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: ASSET_COPY_FAILED_TITLE,
        })
      )
    );
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: ASSET_COPY_MESSAGE.svgText.title })
    );
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: ASSET_COPY_MESSAGE.link.title })
    );
  });

  it("enviar imagem pelo painel acrescenta o asset à lista sem refazer a busca", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    const created: IconAsset = {
      id: "icon-9",
      name: "Logo",
      url: "https://cdn.example.com/library/logo.png",
    };
    vi.mocked(uploadIconAsset).mockResolvedValue(created);
    render(<CanvasAssetsPanel />);

    await screen.findByRole("button", { name: "Copiar Foguete" });
    const file = new File(["x"], "logo.png", { type: "image/png" });
    await user.upload(fileInput(), file);

    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
    expect(await screen.findByRole("button", { name: "Copiar Logo" })).toBeInTheDocument();
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);
  });

  it("'Gerenciar' abre renomear e excluir dentro do próprio painel", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<CanvasAssetsPanel />);

    await user.click(await screen.findByRole("button", { name: "Gerenciar" }));

    expect(await screen.findByRole("button", { name: "Renomear Foguete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir Livro" })).toBeInTheDocument();
  });

  it("colar markup de SVG com o painel aberto abre o campo de colar já preenchido", async () => {
    render(<CanvasAssetsPanel />);

    expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument();
    fireEvent.paste(panel(), { clipboardData: { getData: () => CLEAN_SVG } });

    expect(await screen.findByLabelText(/Markup do SVG/)).toHaveValue(CLEAN_SVG);
  });

  it("com o painel fechado a colagem não abre nada — o atalho é de quem está com o painel à vista", async () => {
    screenWidth(false);
    render(<CanvasAssetsPanel />);

    fireEvent.paste(panel(), { clipboardData: { getData: () => CLEAN_SVG } });

    expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument();
    expect(fetchIconAssets).not.toHaveBeenCalled();
  });

  it("recolher esconde a lista sem descartá-la: reabrir não refaz a busca", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<CanvasAssetsPanel />);

    await screen.findByRole("button", { name: "Copiar Foguete" });
    await user.click(screen.getByRole("button", { name: `Recolher ${ASSETS_PANEL_TITLE}` }));

    // Fora da árvore de acessibilidade (o corpo é `hidden`), mas ainda montado.
    expect(screen.queryByRole("button", { name: "Copiar Foguete" })).toBeNull();
    expect(screen.getByLabelText("Copiar Foguete")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Abrir ${ASSETS_PANEL_TITLE}` }));

    expect(screen.getByRole("button", { name: "Copiar Foguete" })).toBeInTheDocument();
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);
  });
});
