import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssetUploadControls } from "@/components/assets/AssetUploadControls";
import { pastedSvgFromEvent } from "@/components/assets/pastedSvg";
import { uploadIconAsset } from "@/api/tasks/iconAssets";
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
 * Feature 131 — as duas formas de acrescentar um asset, e a recusa que passou a acontecer **antes**
 * da subida. O que estes testes fixam é que o arquivo grande/errado não chega ao bucket: hoje ele
 * subia inteiro para voltar com a mensagem crua do Supabase em inglês.
 */
const CLEAN = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';

/** Arquivo com o tamanho declarado, sem alocar os bytes — 2 MB de `Uint8Array` por teste seria só
 * lentidão: quem decide é `file.size`. */
function fileOfSize(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

/** O host segura o estado do campo de colar (é o popover de ícone que precisa poder abri-lo por uma
 * colagem que aconteceu num container acima) — o harness faz o mesmo papel. */
function Harness({ onUploaded = vi.fn() }: { onUploaded?: (asset: IconAsset) => void }) {
  const [pasting, setPasting] = useState(false);
  const [markup, setMarkup] = useState("");
  return (
    <div
      data-testid="area"
      onPaste={(e) => {
        if (pasting) return;
        const pastedSvg = pastedSvgFromEvent(e);
        if (pastedSvg === null) return;
        e.preventDefault();
        setMarkup(pastedSvg);
        setPasting(true);
      }}
    >
      <AssetUploadControls
        onUploaded={onUploaded}
        pasting={pasting}
        onPastingChange={setPasting}
        markup={markup}
        onMarkupChange={setMarkup}
      />
    </div>
  );
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe("AssetUploadControls", () => {
  beforeEach(() => {
    vi.mocked(uploadIconAsset).mockReset();
    toastMock.mockReset();
  });

  it("arquivo de 2 MB vira toast com o limite e o tamanho, e não chega ao bucket", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(fileInput(), fileOfSize("grande.png", "image/png", 2 * 1024 * 1024));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Este arquivo tem 2,0 MB — o limite é 1 MB.",
        variant: "destructive",
      })
    );
    expect(uploadIconAsset).not.toHaveBeenCalled();
  });

  it("arquivo de formato errado vira toast dizendo o formato, e não chega ao bucket", async () => {
    // `applyAccept: false` reproduz o que a pessoa faz de verdade: trocar o filtro do seletor do
    // sistema para "todos os arquivos". O `accept` é dica, não barreira.
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness />);

    await user.upload(fileInput(), new File(["texto"], "notas.txt", { type: "text/plain" }));

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Formato não aceito: envie PNG, JPEG, WebP ou SVG.",
        variant: "destructive",
      })
    );
    expect(uploadIconAsset).not.toHaveBeenCalled();
  });

  it("PNG pequeno chama uploadIconAsset({ file }) e entrega a linha criada em onUploaded", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    const created = { id: "icon-9", name: "logo", url: "https://cdn.example.com/library/logo.png" };
    vi.mocked(uploadIconAsset).mockResolvedValue(created);
    render(<Harness onUploaded={onUploaded} />);

    const file = fileOfSize("logo.png", "image/png", 10 * 1024);
    await user.upload(fileInput(), file);

    expect(uploadIconAsset).toHaveBeenCalledWith({ file });
    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(created));
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("o seletor de arquivo aceita os quatro formatos da regra, e só eles", () => {
    render(<Harness />);

    expect(fileInput()).toHaveAttribute(
      "accept",
      "image/png,image/jpeg,image/webp,image/svg+xml"
    );
  });

  it("colar markup de SVG na área abre o campo já preenchido", async () => {
    render(<Harness />);

    expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument();
    fireEvent.paste(screen.getByTestId("area"), {
      clipboardData: { getData: () => CLEAN },
    });

    expect(await screen.findByLabelText(/Markup do SVG/)).toHaveValue(CLEAN);
  });

  it("colar texto que não parece SVG não abre nada", () => {
    render(<Harness />);

    fireEvent.paste(screen.getByTestId("area"), {
      clipboardData: { getData: () => "só um texto qualquer" },
    });

    expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar imagem" })).toBeInTheDocument();
  });

  it("salvar o SVG colado sobe o markup e fecha o campo", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    const created = { id: "icon-8", name: "Bolinha", url: "https://cdn.example.com/b.svg" };
    vi.mocked(uploadIconAsset).mockResolvedValue(created);
    render(<Harness onUploaded={onUploaded} />);

    await user.click(screen.getByRole("button", { name: "Colar SVG" }));
    await user.click(screen.getByLabelText(/Markup do SVG/));
    await user.paste(CLEAN);
    await user.click(screen.getByRole("button", { name: "Salvar ícone" }));

    await vi.waitFor(() => expect(onUploaded).toHaveBeenCalledWith(created));
    const [source] = vi.mocked(uploadIconAsset).mock.calls[0];
    expect("svg" in source && source.svg).toContain("<circle");
    // Campo fechado e esquecido: reabrir não traz o markup anterior.
    await vi.waitFor(() =>
      expect(screen.queryByLabelText(/Markup do SVG/)).not.toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Colar SVG" }));
    expect(screen.getByLabelText(/Markup do SVG/)).toHaveValue("");
  });
});
