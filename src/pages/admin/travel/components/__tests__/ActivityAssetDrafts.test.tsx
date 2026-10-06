import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TripEditActivityDialog,
  type ActivityForm,
} from "@/pages/admin/travel/components/TripEditActivityDialog";
import type { ActivityAssetDraft } from "@/domain/travel/activityAssetDrafts";

/**
 * Feature 257: o formulário de **criação** acumula assets como rascunho e entrega tudo no `onSave`.
 *
 * O que estes testes travam é o contrato com o `TripDetail`: nada de I/O enquanto o diálogo está
 * aberto (nenhum mock de API é necessário aqui — é a prova), a lista chega inteira no `onSave`, e
 * em modo `edit` a seção não existe (lá quem manda é o clipe do card).
 */

vi.mock("@/hooks/useUserLocationBias", () => ({
  useUserLocationBias: () => ({ bias: null }),
}));

vi.mock("@/lib/googleRoutes", () => ({
  fetchTravelRoutes: vi.fn(async () => []),
}));

function form(over: Partial<ActivityForm> = {}): ActivityForm {
  return {
    title: "Show do Caetano",
    activity_time: "",
    arrival_time: "",
    boarding_time: "",
    transport_mode: "other",
    notes: "",
    link_url: "",
    is_reserved: false,
    category: "other",
    place_visit_id: null,
    linked_place_label: null,
    pending_catalog: null,
    origin: null,
    destination: null,
    asset_drafts: [],
    ...over,
  };
}

function renderDialog(mode: "create" | "edit", onSave = vi.fn()) {
  render(
    <TripEditActivityDialog
      open
      onOpenChange={vi.fn()}
      form={form()}
      onSave={onSave}
      places={[]}
      mode={mode}
    />
  );
  return onSave;
}

function pdf(name: string, size = 16): File {
  return new File([new Blob([new Uint8Array(size)])], name, {
    type: "application/pdf",
  });
}

describe("assets na criação do evento", () => {
  it("o arquivo escolhido entra como rascunho e chega no onSave", async () => {
    const user = userEvent.setup();
    const onSave = renderDialog("create");

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    await user.upload(input!, pdf("ingresso.pdf"));

    expect(await screen.findByText("ingresso.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    const saved = onSave.mock.calls[0][0] as ActivityForm;
    expect(saved.asset_drafts).toHaveLength(1);
    expect(saved.asset_drafts[0].kind).toBe("file");
  });

  it("o link é normalizado ao entrar na lista", async () => {
    const user = userEvent.setup();
    const onSave = renderDialog("create");

    await user.type(screen.getByLabelText("Link do asset"), "tap.pt");
    await user.type(screen.getByLabelText("Nome do link"), "Check-in");
    await user.click(screen.getByRole("button", { name: /anexar link/i }));

    expect(await screen.findByText("Check-in")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    const saved = onSave.mock.calls[0][0] as ActivityForm;
    const draft = saved.asset_drafts[0] as Extract<
      ActivityAssetDraft,
      { kind: "link" }
    >;
    expect(draft.url).toBe("https://tap.pt/");
    expect(draft.label).toBe("Check-in");
  });

  it("link com esquema recusado não entra e explica no campo", async () => {
    const user = userEvent.setup();
    renderDialog("create");

    await user.type(screen.getByLabelText("Link do asset"), "ftp://x.test/a");
    await user.click(screen.getByRole("button", { name: /anexar link/i }));

    expect(
      await screen.findByText("O link precisa começar com http:// ou https://.")
    ).toBeInTheDocument();
  });

  it("remover tira o rascunho da lista", async () => {
    const user = userEvent.setup();
    const onSave = renderDialog("create");

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    await user.upload(input!, pdf("voucher.pdf"));
    await user.click(
      await screen.findByRole("button", { name: "Remover voucher.pdf" })
    );

    expect(screen.queryByText("voucher.pdf")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    expect((onSave.mock.calls[0][0] as ActivityForm).asset_drafts).toEqual([]);
  });

  it("em modo edição a seção não existe", () => {
    renderDialog("edit");

    expect(screen.queryByLabelText("Link do asset")).toBeNull();
    expect(screen.queryByRole("button", { name: /anexar arquivo/i })).toBeNull();
  });
});
