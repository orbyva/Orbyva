import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EventInviteAccept from "@/pages/admin/tasks/EventInviteAccept";
import { acceptEventInvite, getEventInviteByToken } from "@/api/tasks";
import type { EventInvitePreview } from "@/types/tasks";

/**
 * Tela de aceite do convite de evento (feature 076).
 *
 * O que este arquivo trava, além do caminho feliz, são os estados que numa tela de convite decidem
 * se a pessoa entende o que houve ou acha que o app quebrou: token inexistente, expirado, revogado,
 * já aceito por outra pessoa, já aceito por ela mesma, logada com o e-mail errado, deslogada — cada
 * um com texto próprio — e o esqueleto enquanto carrega.
 */

vi.mock("@/api/tasks", () => ({
  getEventInviteByToken: vi.fn(),
  acceptEventInvite: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const auth = { user: null as { email: string } | null, loading: false };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => auth,
}));

const mockedGet = vi.mocked(getEventInviteByToken);
const mockedAccept = vi.mocked(acceptEventInvite);

const navigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return { ...actual, useNavigate: () => navigate };
});

function makePreview(overrides: Partial<EventInvitePreview> = {}): EventInvitePreview {
  return {
    id: "invite-1",
    event_id: "event-1",
    token: "tok123",
    email: "convidada@exemplo.com",
    status: "pending",
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    created_at: new Date().toISOString(),
    accepted_by: null,
    accepted_event_id: null,
    event_title: "Reunião de kickoff",
    event_starts_at: "2026-09-01T13:00:00.000Z",
    event_ends_at: "2026-09-01T14:00:00.000Z",
    accepted_by_me: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/invite/tok123"]}>
      <Routes>
        <Route path="/events/invite/:token" element={<EventInviteAccept />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedAccept.mockReset();
  mockToast.mockReset();
  navigate.mockReset();
  auth.user = { email: "convidada@exemplo.com" };
  auth.loading = false;
});

describe("EventInviteAccept — caminho feliz", () => {
  it("mostra o evento do convite e aceita com um clique", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(makePreview());
    mockedAccept.mockResolvedValue("novo-evento-1");

    renderPage();

    expect(await screen.findByText("Reunião de kickoff")).toBeInTheDocument();
    expect(screen.getByText(/setembro/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Aceitar convite" }));

    expect(mockedAccept).toHaveBeenCalledWith("tok123");
    expect(navigate).toHaveBeenCalledWith("/tasks/agenda", { replace: true });
  });

  it("a tela não promete acesso à conta de ninguém — diz que é uma cópia", async () => {
    mockedGet.mockResolvedValue(makePreview());
    renderPage();
    expect(await screen.findByText(/cria uma cópia deste evento/i)).toBeInTheDocument();
  });

  it("convite só-link (sem e-mail) é aceitável por quem estiver logado", async () => {
    mockedGet.mockResolvedValue(makePreview({ email: null }));
    auth.user = { email: "outra@exemplo.com" };

    renderPage();

    expect(await screen.findByRole("button", { name: "Aceitar convite" })).toBeInTheDocument();
  });

  it("falha ao aceitar mostra a mensagem da RPC e recarrega o convite", async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(makePreview());
    mockedAccept.mockRejectedValue(new Error("Este convite expirou"));

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Aceitar convite" }));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Não foi possível aceitar",
        description: "Este convite expirou",
        variant: "destructive",
      })
    );
    expect(navigate).not.toHaveBeenCalled();
    // Recarrega para descobrir o novo estado do convite.
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});

describe("EventInviteAccept — estados de identidade", () => {
  it("deslogado leva para o login com o link do convite em ?next=", async () => {
    auth.user = null;
    renderPage();

    expect(await screen.findByText("Entre para ver o convite")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Entrar / criar conta" });
    expect(link).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent("/events/invite/tok123")}`
    );
    // Deslogado nem chega a bater na RPC, que exigiria sessão.
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("enquanto a sessão carrega, não decide nada ainda", () => {
    auth.loading = true;
    auth.user = null;
    renderPage();

    expect(screen.getByText("Verificando convite…")).toBeInTheDocument();
    expect(screen.queryByText("Entre para ver o convite")).not.toBeInTheDocument();
  });

  it("logado com outro e-mail: diz para qual conta o convite foi feito e não aceita", async () => {
    auth.user = { email: "eu@exemplo.com" };
    mockedGet.mockResolvedValue(makePreview({ email: "convidada@exemplo.com" }));

    renderPage();

    expect(await screen.findByText("Convite para outra conta")).toBeInTheDocument();
    expect(screen.getByText("convidada@exemplo.com")).toBeInTheDocument();
    expect(screen.getByText("eu@exemplo.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceitar convite" })).not.toBeInTheDocument();
  });

  it("diferença só de maiúsculas/espaços no e-mail não bloqueia o aceite", async () => {
    auth.user = { email: " Convidada@Exemplo.COM " };
    mockedGet.mockResolvedValue(makePreview({ email: "convidada@exemplo.com" }));

    renderPage();

    expect(await screen.findByRole("button", { name: "Aceitar convite" })).toBeInTheDocument();
  });
});

describe("EventInviteAccept — estados de erro, vazio e carregamento", () => {
  it("mostra o esqueleto enquanto busca o convite", async () => {
    let resolver: (v: EventInvitePreview) => void = () => {};
    mockedGet.mockReturnValue(
      new Promise<EventInvitePreview>((resolve) => {
        resolver = resolve;
      })
    );

    renderPage();

    expect(screen.getByText("Verificando convite…")).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();

    resolver(makePreview());
    expect(await screen.findByText("Reunião de kickoff")).toBeInTheDocument();
  });

  it("token inexistente tem texto próprio, não um 'erro' genérico", async () => {
    mockedGet.mockResolvedValue(null);
    renderPage();

    expect(await screen.findByText("Convite não encontrado")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir para a agenda" })).toBeInTheDocument();
  });

  it("convite expirado por status", async () => {
    mockedGet.mockResolvedValue(makePreview({ status: "expired" }));
    renderPage();
    expect(await screen.findByText("Convite expirado")).toBeInTheDocument();
  });

  it("convite ainda 'pending' mas com a data vencida também conta como expirado", async () => {
    mockedGet.mockResolvedValue(
      makePreview({ expires_at: new Date(Date.now() - 86_400_000).toISOString() })
    );
    renderPage();
    expect(await screen.findByText("Convite expirado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceitar convite" })).not.toBeInTheDocument();
  });

  it("convite revogado diz que foi cancelado por quem convidou", async () => {
    mockedGet.mockResolvedValue(makePreview({ status: "revoked" }));
    renderPage();
    expect(await screen.findByText("Convite cancelado")).toBeInTheDocument();
  });

  it("convite já aceito por outra pessoa não vira 'você já aceitou'", async () => {
    mockedGet.mockResolvedValue(
      makePreview({ status: "accepted", accepted_by_me: false })
    );
    renderPage();

    expect(await screen.findByText("Convite já utilizado")).toBeInTheDocument();
    expect(screen.queryByText("Você já aceitou este convite")).not.toBeInTheDocument();
  });

  it("convite já aceito por mim vira 'já está na sua agenda', não erro", async () => {
    mockedGet.mockResolvedValue(
      makePreview({ status: "accepted", accepted_by_me: true })
    );
    renderPage();

    expect(await screen.findByText("Você já aceitou este convite")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver na agenda" })).toBeInTheDocument();
  });

  it("banco sem as migrations mostra a mensagem amigável da API", async () => {
    mockedGet.mockRejectedValue(
      new Error("Convites de evento ainda não estão disponíveis. Tente mais tarde.")
    );
    renderPage();

    expect(await screen.findByText("Não foi possível abrir o convite")).toBeInTheDocument();
    expect(
      screen.getByText(/ainda não estão disponíveis/i)
    ).toBeInTheDocument();
  });
});
