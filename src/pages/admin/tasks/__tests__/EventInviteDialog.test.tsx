import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  EventInviteDialog,
  validateInviteEmail,
} from "@/pages/admin/tasks/EventInviteDialog";
import {
  createEventInvite,
  listEventInvites,
  revokeEventInvite,
} from "@/api/tasks";
import type { EventInvite } from "@/types/tasks";

/**
 * Dialog de convidar para um evento (feature 076).
 *
 * O caso que mais importa não é o feliz: é a falha do e-mail. O convite continua válido quando o
 * Resend cai, e a tela precisa dizer isso e empurrar o "copiar link" — senão a pessoa acha que não
 * convidou ninguém e convida de novo.
 */

vi.mock("@/api/tasks", () => ({
  createEventInvite: vi.fn(),
  listEventInvites: vi.fn(),
  revokeEventInvite: vi.fn(),
  eventInviteUrl: (token: string) => `https://orbyva.app/events/invite/${token}`,
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockedCreate = vi.mocked(createEventInvite);
const mockedList = vi.mocked(listEventInvites);
const mockedRevoke = vi.mocked(revokeEventInvite);

const writeText = vi.fn().mockResolvedValue(undefined);

function makeInvite(overrides: Partial<EventInvite> = {}): EventInvite {
  return {
    id: "invite-1",
    event_id: "event-1",
    email: "convidada@exemplo.com",
    token: "tok123",
    created_by: "host-1",
    status: "pending",
    expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    accepted_by: null,
    accepted_event_id: null,
    email_sent_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * `userEvent.setup()` instala o próprio stub de `navigator.clipboard`, então o nosso tem de vir
 * depois dele — e `navigator.clipboard` só tem getter no jsdom (mesmo truque de
 * `CanvasEditor.test.tsx`).
 */
function setupUser() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return user;
}

function renderDialog() {
  return render(
    <EventInviteDialog
      eventId="event-1"
      eventTitle="Reunião de kickoff"
      open
      onOpenChange={() => {}}
    />
  );
}

beforeEach(() => {
  mockedCreate.mockReset();
  mockedList.mockReset().mockResolvedValue([]);
  mockedRevoke.mockReset().mockResolvedValue(undefined);
  mockToast.mockReset();
  writeText.mockClear();
});

describe("validateInviteEmail", () => {
  it("mensagem afirmativa quando está vazio", () => {
    expect(validateInviteEmail("  ")).toMatch(/Escreva o e-mail/);
  });

  it("mensagem que diz o formato esperado quando está malformado", () => {
    expect(validateInviteEmail("nome@")).toMatch(/nome@dominio\.com/);
    expect(validateInviteEmail("nome")).toMatch(/nome@dominio\.com/);
    expect(validateInviteEmail("nome@dominio")).toMatch(/nome@dominio\.com/);
  });

  it("e-mail válido não gera mensagem", () => {
    expect(validateInviteEmail(" convidada@exemplo.com ")).toBeNull();
  });
});

describe("EventInviteDialog — campo de e-mail", () => {
  it("o campo é type=email com autocomplete e label associada", async () => {
    renderDialog();
    const campo = await screen.findByLabelText(/E-mail de quem você quer convidar/i);
    expect(campo).toHaveAttribute("type", "email");
    expect(campo).toHaveAttribute("autocomplete", "email");
  });

  it("e-mail inválido não envia e mostra o que corrigir", async () => {
    const user = setupUser();
    renderDialog();

    await user.type(
      await screen.findByLabelText(/E-mail de quem você quer convidar/i),
      "nome@"
    );
    await user.click(screen.getByRole("button", { name: /Enviar convite/i }));

    expect(await screen.findByText(/nome@dominio\.com/)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("valida no blur, não a cada tecla", async () => {
    const user = setupUser();
    renderDialog();
    const campo = await screen.findByLabelText(/E-mail de quem você quer convidar/i);

    await user.type(campo, "nome@");
    expect(screen.queryByText(/nome@dominio\.com/)).not.toBeInTheDocument();

    await user.tab();
    expect(await screen.findByText(/nome@dominio\.com/)).toBeInTheDocument();
  });

  it("campo vazio no blur não acusa erro — só quando tenta enviar", async () => {
    const user = setupUser();
    renderDialog();
    const campo = await screen.findByLabelText(/E-mail de quem você quer convidar/i);

    await user.click(campo);
    await user.tab();
    expect(screen.queryByText(/Escreva o e-mail/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Enviar convite/i }));
    expect(await screen.findByText(/Escreva o e-mail/)).toBeInTheDocument();
  });
});

describe("EventInviteDialog — enviar, reenviar e revogar", () => {
  it("envio com sucesso mostra o convite na lista como pendente", async () => {
    const user = setupUser();
    const invite = makeInvite();
    mockedCreate.mockResolvedValue({ invite, emailSent: true, resent: false });
    mockedList.mockResolvedValueOnce([]).mockResolvedValue([invite]);

    renderDialog();
    await user.type(
      await screen.findByLabelText(/E-mail de quem você quer convidar/i),
      "convidada@exemplo.com"
    );
    await user.click(screen.getByRole("button", { name: /Enviar convite/i }));

    expect(mockedCreate).toHaveBeenCalledWith("event-1", "convidada@exemplo.com");
    const item = await screen.findByText("convidada@exemplo.com");
    expect(within(item.closest("li")!).getByText("Pendente")).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Convite enviado" })
    );
  });

  it("falha do e-mail ainda cria o convite e destaca o link para copiar", async () => {
    const user = setupUser();
    const invite = makeInvite();
    mockedCreate.mockResolvedValue({ invite, emailSent: false, resent: false });
    mockedList.mockResolvedValueOnce([]).mockResolvedValue([invite]);

    renderDialog();
    await user.type(
      await screen.findByLabelText(/E-mail de quem você quer convidar/i),
      "convidada@exemplo.com"
    );
    await user.click(screen.getByRole("button", { name: /Enviar convite/i }));

    expect(
      await screen.findByText("https://orbyva.app/events/invite/tok123")
    ).toBeInTheDocument();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Convite criado, mas o e-mail não saiu" })
    );
    // O convite continua na lista: ele é válido mesmo sem o e-mail.
    expect(await screen.findByText("convidada@exemplo.com")).toBeInTheDocument();
  });

  it("convidar o mesmo e-mail de novo é anunciado como reenvio", async () => {
    const user = setupUser();
    const invite = makeInvite();
    mockedCreate.mockResolvedValue({ invite, emailSent: true, resent: true });

    renderDialog();
    await user.type(
      await screen.findByLabelText(/E-mail de quem você quer convidar/i),
      "convidada@exemplo.com"
    );
    await user.click(screen.getByRole("button", { name: /Enviar convite/i }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Convite reenviado" })
      )
    );
  });

  it("'Copiar link' cria um convite sem e-mail e copia a URL", async () => {
    const user = setupUser();
    const invite = makeInvite({ email: null, token: "toklink" });
    mockedCreate.mockResolvedValue({ invite, emailSent: false, resent: false });

    renderDialog();
    await user.click(await screen.findByRole("button", { name: /Copiar link/i }));

    expect(mockedCreate).toHaveBeenCalledWith("event-1");
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "https://orbyva.app/events/invite/toklink"
      )
    );
  });

  it("revogar tira o convite pendente da lista", async () => {
    const user = setupUser();
    const invite = makeInvite();
    mockedList.mockResolvedValueOnce([invite]).mockResolvedValue([]);

    renderDialog();
    await user.click(
      await screen.findByRole("button", { name: /Cancelar convite de convidada@exemplo.com/i })
    );

    expect(mockedRevoke).toHaveBeenCalledWith("invite-1");
    await waitFor(() =>
      expect(screen.getByText("Ninguém foi convidado ainda.")).toBeInTheDocument()
    );
  });

  it("convite já aceito aparece com o status e sem a ação de cancelar", async () => {
    mockedList.mockResolvedValue([
      makeInvite({ status: "accepted", accepted_by: "guest-1" }),
    ]);

    renderDialog();

    expect(await screen.findByText("Aceito")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Cancelar convite/i })
    ).not.toBeInTheDocument();
  });

  it("convite por link aparece rotulado, sem inventar e-mail", async () => {
    mockedList.mockResolvedValue([makeInvite({ email: null })]);
    renderDialog();
    expect(await screen.findByText("Convite por link")).toBeInTheDocument();
  });

  it("erro ao listar vira toast, não tela quebrada", async () => {
    mockedList.mockRejectedValue(new Error("banco fora do ar"));
    renderDialog();

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Não foi possível carregar os convites" })
      )
    );
    expect(screen.getByText("Ninguém foi convidado ainda.")).toBeInTheDocument();
  });
});
