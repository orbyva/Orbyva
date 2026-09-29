import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AssetLibrary,
  ICON_DELETE_WARNING,
  ICON_LIBRARY_EMPTY,
  ICON_LIBRARY_ERROR,
} from "@/components/assets/AssetLibrary";
import {
  deleteIconAsset,
  fetchIconAssets,
  renameIconAsset,
} from "@/api/tasks/iconAssets";
import type { IconAsset } from "@/types/tasks";

vi.mock("@/api/tasks/iconAssets", () => ({
  uploadIconAsset: vi.fn(),
  fetchIconAssets: vi.fn().mockResolvedValue([]),
  deleteIconAsset: vi.fn().mockResolvedValue(undefined),
  renameIconAsset: vi.fn().mockResolvedValue(undefined),
}));

const toastMock = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

/**
 * Feature 131 — a biblioteca **fora** do popover de ícone de tarefa, montada direta. É este arquivo
 * que prova que ela deixou de ser um pedaço do `TaskIconPicker`: nada aqui sabe o que é uma tarefa,
 * nem o que `icon_key`/`icon_url` significam.
 */
function libraryAsset(id: string, name: string, url: string): IconAsset {
  return { id, name, url };
}

const FOGUETE = "https://cdn.example.com/library/foguete.svg";
const LIVRO = "https://cdn.example.com/library/livro.png";

function twoAssets() {
  return [libraryAsset("icon-1", "Foguete", FOGUETE), libraryAsset("icon-2", "Livro", LIVRO)];
}

describe("AssetLibrary", () => {
  beforeEach(() => {
    vi.mocked(fetchIconAssets).mockReset();
    vi.mocked(fetchIconAssets).mockResolvedValue([]);
    vi.mocked(deleteIconAsset).mockReset();
    vi.mocked(deleteIconAsset).mockResolvedValue(undefined);
    vi.mocked(renameIconAsset).mockReset();
    vi.mocked(renameIconAsset).mockResolvedValue(undefined);
    toastMock.mockReset();
  });

  // O carregamento preguiçoso é o motivo de `enabled` existir: o picker aparece em toda linha da
  // Lista, do Kanban e do Gantt, e buscar na montagem seria uma consulta por card.
  it("com enabled=false não busca nada; ligando enabled busca uma vez e lista os assets", async () => {
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    const { rerender } = render(
      <AssetLibrary title="Orbyva Assets" enabled={false} onSelect={vi.fn()} />
    );

    expect(fetchIconAssets).not.toHaveBeenCalled();
    expect(screen.getByText("Orbyva Assets")).toBeInTheDocument();

    rerender(<AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Foguete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Livro" })).toBeInTheDocument();
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);

    // Rerender por qualquer outro motivo não refaz a busca.
    rerender(<AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />);
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);
  });

  it("lista vazia mostra o texto que diz o que fazer", async () => {
    render(<AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />);

    expect(await screen.findByText(ICON_LIBRARY_EMPTY)).toBeInTheDocument();
  });

  it("erro na busca vira uma linha de aviso, e reabrir tenta de novo", async () => {
    vi.mocked(fetchIconAssets).mockRejectedValue(new Error("offline"));
    const { rerender } = render(<AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />);

    expect(await screen.findByText(ICON_LIBRARY_ERROR)).toBeInTheDocument();

    // Um erro libera nova tentativa: é o `loadedRef` sendo devolvido no catch.
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    rerender(<AssetLibrary title="Orbyva Assets" enabled={false} onSelect={vi.fn()} />);
    rerender(<AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Foguete" })).toBeInTheDocument();
    expect(fetchIconAssets).toHaveBeenCalledTimes(2);
  });

  it("fechar durante uma busca pendente permite buscar novamente ao reabrir", async () => {
    let resolveFirst!: (assets: IconAsset[]) => void;
    vi.mocked(fetchIconAssets)
      .mockImplementationOnce(
        () => new Promise<IconAsset[]>((resolve) => { resolveFirst = resolve; })
      )
      .mockResolvedValueOnce(twoAssets());

    const { rerender } = render(
      <AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />
    );
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);

    rerender(<AssetLibrary title="Orbyva Assets" enabled={false} onSelect={vi.fn()} />);
    rerender(<AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Foguete" })).toBeInTheDocument();
    expect(fetchIconAssets).toHaveBeenCalledTimes(2);

    // A resposta antiga não pode substituir o resultado da nova abertura.
    resolveFirst([libraryAsset("stale", "Antigo", "https://cdn.example.com/stale.svg")]);
    await vi.waitFor(() => expect(screen.queryByText("Antigo")).toBeNull());
  });

  it("'Gerenciar' abre renomear e excluir; a confirmação de excluir traz o aviso do arquivo", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />);

    // Sem clicar em Gerenciar, a lista é só de escolher.
    expect(await screen.findByRole("button", { name: "Foguete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir Foguete" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Gerenciar" }));
    await user.click(await screen.findByRole("button", { name: "Excluir Foguete" }));

    expect(screen.getByText(new RegExp(ICON_DELETE_WARNING))).toBeInTheDocument();
    expect(deleteIconAsset).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Excluir" }));

    await vi.waitFor(() => expect(deleteIconAsset).toHaveBeenCalledWith("icon-1"));
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Excluir Foguete" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Excluir Livro" })).toBeInTheDocument();
  });

  it("renomear chama renameIconAsset e atualiza a linha sem refazer a busca", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(<AssetLibrary title="Orbyva Assets" enabled onSelect={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Gerenciar" }));
    await user.click(await screen.findByRole("button", { name: "Renomear Foguete" }));
    const input = screen.getByLabelText("Novo nome de Foguete");
    await user.clear(input);
    await user.type(input, "Lançamento");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await vi.waitFor(() => expect(renameIconAsset).toHaveBeenCalledWith("icon-1", "Lançamento"));
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Excluir Lançamento" })).toBeInTheDocument()
    );
    // O nome é só rótulo: trocar a linha em memória evita piscar a lista inteira.
    expect(fetchIconAssets).toHaveBeenCalledTimes(1);
  });

  // A regra que impede a 132 de nascer com botão que não faz nada.
  it("sem onSelect os itens não são botões clicáveis — com onSelect, o clique entrega o asset", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    const { unmount } = render(<AssetLibrary title="Orbyva Assets" enabled />);

    expect(await screen.findByAltText("Foguete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Foguete" })).not.toBeInTheDocument();
    unmount();

    const onSelect = vi.fn();
    render(<AssetLibrary title="Orbyva Assets" enabled onSelect={onSelect} />);
    await user.click(await screen.findByRole("button", { name: "Foguete" }));

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "icon-1", url: FOGUETE })
    );
  });

  it("o asset em uso aparece marcado, e o desenho sai sempre por <img> (nunca inline)", async () => {
    vi.mocked(fetchIconAssets).mockResolvedValue(twoAssets());
    render(
      <AssetLibrary title="Orbyva Assets" enabled selectedUrl={FOGUETE} onSelect={vi.fn()} />
    );

    const tile = await screen.findByRole("button", { name: "Foguete" });
    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Livro" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(tile.querySelector("img")).toHaveAttribute("src", FOGUETE);
    expect(tile.querySelector("svg")).toBeNull();
  });
});
