import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { OrbAvatar } from "@/types/orb";

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
  toast: toastMock,
}));

vi.mock("@/api/orbAvatars", async () => {
  const actual = await vi.importActual<typeof import("@/api/orbAvatars")>("@/api/orbAvatars");
  return {
    OrbAvatarGenerateError: actual.OrbAvatarGenerateError,
    fetchOrbAvatars: vi.fn(),
    generateOrbAvatar: vi.fn(),
    setActiveOrbAvatar: vi.fn(),
    deleteOrbAvatar: vi.fn(),
  };
});

vi.mock("@/lib/orbAvatarReference", () => ({
  fileToReference: vi.fn(),
}));

import {
  deleteOrbAvatar,
  fetchOrbAvatars,
  generateOrbAvatar,
  OrbAvatarGenerateError,
  setActiveOrbAvatar,
} from "@/api/orbAvatars";
import { fileToReference } from "@/lib/orbAvatarReference";
import { OrbAvatarSection } from "@/pages/admin/account/OrbAvatarSection";
import { OrbAvatarContext } from "@/hooks/useOrbAvatar";

const refreshAvatar = vi.fn();

function renderSection() {
  return render(
    <OrbAvatarContext.Provider value={{ url: null, refresh: refreshAvatar }}>
      <OrbAvatarSection />
    </OrbAvatarContext.Provider>
  );
}

function avatar(id: string, prompt: string, isActive = false): OrbAvatar {
  return {
    id,
    user_id: "u1",
    prompt,
    url: `https://x.supabase.co/storage/v1/object/public/orb-avatars/u1/${id}.png`,
    model: "gemini-2.5-flash-image",
    is_active: isActive,
    created_at: "2026-10-05T12:00:00Z",
  };
}

function card(prompt: string): HTMLElement {
  return screen.getByText(prompt).closest("li") as HTMLElement;
}

function pngFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

describe("OrbAvatarSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchOrbAvatars).mockResolvedValue([
      avatar("a1", "esfera azul", true),
      avatar("a2", "esfera verde"),
    ]);
    vi.mocked(fileToReference).mockImplementation(async (file: File) => ({
      mime: "image/jpeg",
      data: `b64-${file.name}`,
    }));
  });

  it("lista as versões com a ativa marcada", async () => {
    renderSection();
    expect(await screen.findByText("esfera azul")).toBeInTheDocument();
    expect(within(card("esfera azul")).getByText("ativa")).toBeInTheDocument();
    expect(within(card("esfera verde")).queryByText("ativa")).toBeNull();
    expect(within(card("esfera verde")).getByRole("button", { name: /usar esta/i })).toBeEnabled();
  });

  it("sem versão nenhuma mostra o estado vazio", async () => {
    vi.mocked(fetchOrbAvatars).mockResolvedValue([]);
    renderSection();
    expect(await screen.findByText(/nenhuma versão ainda/i)).toBeInTheDocument();
  });

  it("gerar chama a API com o prompt digitado e as referências convertidas", async () => {
    const user = userEvent.setup();
    vi.mocked(generateOrbAvatar).mockResolvedValue({
      avatar: avatar("a3", "esfera de vidro"),
      remaining: 7,
    });
    renderSection();
    await screen.findByText("esfera azul");

    const gerar = screen.getByRole("button", { name: /gerar versão/i });
    expect(gerar).toBeDisabled();

    await user.type(screen.getByLabelText(/como você quer a orb/i), "esfera de vidro");
    await user.upload(screen.getByLabelText(/imagens de referência/i), [
      pngFile("a.png"),
      pngFile("b.png"),
    ]);
    expect(await screen.findAllByRole("button", { name: /remover referência/i })).toHaveLength(2);

    await user.click(gerar);

    await waitFor(() =>
      expect(generateOrbAvatar).toHaveBeenCalledWith({
        prompt: "esfera de vidro",
        references: [
          { mime: "image/jpeg", data: "b64-a.png" },
          { mime: "image/jpeg", data: "b64-b.png" },
        ],
      })
    );
    const itens = await screen.findAllByRole("listitem");
    expect(within(itens[0]).getByText("esfera de vidro")).toBeInTheDocument();
    expect(screen.getByText(/restam 7 hoje/i)).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /remover referência/i })).toHaveLength(0);
  });

  it("mais de 3 imagens: só 3 entram e um toast explica o limite", async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText("esfera azul");
    await user.upload(screen.getByLabelText(/imagens de referência/i), [
      pngFile("1.png"),
      pngFile("2.png"),
      pngFile("3.png"),
      pngFile("4.png"),
    ]);
    expect(await screen.findAllByRole("button", { name: /remover referência/i })).toHaveLength(3);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringMatching(/máximo 3/i) })
    );
  });

  it("'Usar esta' ativa pela RPC e a marca muda de cartão", async () => {
    const user = userEvent.setup();
    vi.mocked(setActiveOrbAvatar).mockResolvedValue(undefined);
    renderSection();
    await screen.findByText("esfera azul");

    await user.click(within(card("esfera verde")).getByRole("button", { name: /usar esta/i }));

    expect(setActiveOrbAvatar).toHaveBeenCalledWith("a2");
    await waitFor(() => expect(within(card("esfera verde")).getByText("ativa")).toBeInTheDocument());
    expect(within(card("esfera azul")).queryByText("ativa")).toBeNull();
    expect(refreshAvatar).toHaveBeenCalledTimes(1);
  });

  it("erro da API vira toast com a mensagem e a galeria não muda", async () => {
    const user = userEvent.setup();
    vi.mocked(generateOrbAvatar).mockRejectedValue(
      new OrbAvatarGenerateError("O modelo recusou esse pedido. Tente descrever a Orb de outro jeito.")
    );
    renderSection();
    await screen.findByText("esfera azul");

    await user.type(screen.getByLabelText(/como você quer a orb/i), "algo");
    await user.click(screen.getByRole("button", { name: /gerar versão/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "O modelo recusou esse pedido. Tente descrever a Orb de outro jeito.",
        })
      )
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /gerar versão/i })).toBeEnabled();
  });

  it("cota esgotada (remaining 0) desabilita o botão", async () => {
    const user = userEvent.setup();
    vi.mocked(generateOrbAvatar).mockRejectedValue(
      new OrbAvatarGenerateError("Você já gerou 10 versões da Orb hoje.", 0)
    );
    renderSection();
    await screen.findByText("esfera azul");

    await user.type(screen.getByLabelText(/como você quer a orb/i), "algo");
    await user.click(screen.getByRole("button", { name: /gerar versão/i }));

    await waitFor(() => expect(screen.getByText(/restam 0 hoje/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /gerar versão/i })).toBeDisabled();
  });

  it("excluir confirma no diálogo e tira o cartão", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteOrbAvatar).mockResolvedValue(undefined);
    renderSection();
    await screen.findByText("esfera azul");

    await user.click(within(card("esfera verde")).getByRole("button", { name: /excluir versão/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.queryByText("esfera verde")).toBeNull());
    expect(deleteOrbAvatar).toHaveBeenCalledWith(expect.objectContaining({ id: "a2" }));
    expect(refreshAvatar).not.toHaveBeenCalled();
  });

  it("excluir a versão ativa avisa a esfera para voltar ao CSS", async () => {
    const user = userEvent.setup();
    vi.mocked(deleteOrbAvatar).mockResolvedValue(undefined);
    renderSection();
    await screen.findByText("esfera azul");

    await user.click(within(card("esfera azul")).getByRole("button", { name: /excluir versão/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(screen.queryByText("esfera azul")).toBeNull());
    expect(refreshAvatar).toHaveBeenCalledTimes(1);
  });
});
