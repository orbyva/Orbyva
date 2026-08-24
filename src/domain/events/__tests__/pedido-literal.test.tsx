import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AgendaGrid } from "@/pages/admin/tasks/AgendaGrid";
import {
  fetchProjectEvents,
  fetchProjects,
  fetchTags,
  fetchTasks,
} from "@/api/tasks";
import { fetchRecurringTransactions } from "@/api/recurring";
import {
  buildInviteEmailPayload,
  shouldSendInviteEmail,
} from "@/domain/events/inviteEmail";
import type { ProjectEvent } from "@/types/tasks";

/**
 * Verificação do **pedido literal** da feature 076:
 *
 *   "funcionalidade em que consigo criar um convite para alguém, se a pessoa já tiver conta, cria o
 *    evento na agenda dela, em caso de por exemplo ela ter conta no google também cria"
 *
 * Este arquivo cobre as duas metades que dependem do front:
 *   (a) **o evento aparece na agenda dela** — a cópia criada pelo aceite (`project_id` nulo) é
 *       desenhada na agenda do convidado como qualquer outro evento;
 *   (b) **também cria no Google** — o e-mail do convite carrega um `.ics` que Google/Apple/Outlook
 *       Calendar entendem, montado pela mesma função que a Edge Function chama.
 *
 * A metade que depende do banco — o aceite criando de fato a linha na conta do convidado, sem
 * duplicar, respeitando expiração/revogação/e-mail — é provada em
 * `supabase/tests/event_invite/05_assert_accept.sql`, contra um Postgres 16 de verdade.
 */

vi.mock("@/api/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/api/tasks")>("@/api/tasks");
  return {
    ...actual,
    // Feature 085: sem isto a busca em lote dos links cairia no Supabase de verdade.
    fetchExternalLinksForTask: vi.fn().mockResolvedValue([]),
    fetchExternalLinksForTasks: vi.fn().mockResolvedValue({}),
    saveExternalLinksForTask: vi.fn().mockResolvedValue([]),
    fetchTasks: vi.fn(),
    fetchProjects: vi.fn(),
    fetchProjectEvents: vi.fn(),
    fetchTags: vi.fn(),
    createTag: vi.fn(),
    createTask: vi.fn(),
    deleteTask: vi.fn(),
    updateTask: vi.fn(),
    deleteProjectEvent: vi.fn(),
    listEventInvites: vi.fn(async () => []),
  };
});

vi.mock("@/api/recurring", () => ({
  fetchRecurringTransactions: vi.fn(),
}));

vi.mock("@/hooks/useDimensions", () => ({
  useDimensions: () => ({ dimensions: [], loading: false, error: null, refetch: vi.fn() }),
}));

const mockedFetchTasks = vi.mocked(fetchTasks);
const mockedFetchProjects = vi.mocked(fetchProjects);
const mockedFetchProjectEvents = vi.mocked(fetchProjectEvents);
const mockedFetchTags = vi.mocked(fetchTags);
const mockedFetchRecurring = vi.mocked(fetchRecurringTransactions);

/** Meio-dia local de hoje: o evento cai no dia certo da grade do mês em qualquer fuso. */
function hojeAoMeioDia(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/**
 * O que `accept_event_invite` devolve para a conta do convidado: cópia do evento do anfitrião, com
 * `project_id` nulo (ele não tem o projeto de quem convidou).
 */
const copiaDoConvidado: ProjectEvent = {
  id: "evento-copiado-1",
  user_id: "guest-1",
  project_id: null,
  title: "Reunião de kickoff",
  starts_at: hojeAoMeioDia(),
  ends_at: null,
};

beforeEach(() => {
  mockedFetchTasks.mockReset().mockResolvedValue([]);
  // A conta do convidado não tem projeto nenhum — nem o do anfitrião.
  mockedFetchProjects.mockReset().mockResolvedValue([]);
  mockedFetchProjectEvents.mockReset().mockResolvedValue([copiaDoConvidado]);
  mockedFetchTags.mockReset().mockResolvedValue([]);
  mockedFetchRecurring.mockReset().mockResolvedValue([]);
});

describe("(a) depois de aceitar, o evento aparece na agenda do convidado", () => {
  it("a cópia sem projeto é desenhada na agenda dele", async () => {
    render(
      <MemoryRouter>
        <AgendaGrid />
      </MemoryRouter>
    );
    await screen.findByText("Dom");

    expect(screen.getByText("Reunião de kickoff")).toBeInTheDocument();
  });

  it("e ele não precisa ter nenhum projeto para isso", async () => {
    render(
      <MemoryRouter>
        <AgendaGrid />
      </MemoryRouter>
    );
    await screen.findByText("Dom");

    expect(mockedFetchProjects).toHaveBeenCalled();
    expect(screen.getByText("Reunião de kickoff")).toBeInTheDocument();
  });
});

describe("(b) o e-mail do convite leva o .ics que o Google/Apple Calendar entende", () => {
  const convite = {
    status: "pending",
    email: "convidada@exemplo.com",
    expires_at: "2026-09-03T12:00:00.000Z",
    email_sent_at: null,
  };

  function payload(overrides: Partial<Parameters<typeof buildInviteEmailPayload>[0]> = {}) {
    return buildInviteEmailPayload({
      inviterName: "Rafael",
      inviterEmail: "host@orbyva.app",
      guestEmail: "convidada@exemplo.com",
      eventId: "event-1",
      eventTitle: "Reunião de kickoff",
      eventStartsAt: "2026-09-01T13:00:00.000Z",
      eventEndsAt: "2026-09-01T14:00:00.000Z",
      inviteLink: "https://orbyva.app/events/invite/tok123",
      now: new Date("2026-08-20T09:30:00.000Z"),
      ...overrides,
    });
  }

  function icsDoAnexo(p: ReturnType<typeof buildInviteEmailPayload>): string {
    const anexo = p.attachments[0];
    expect(anexo.content_type).toBe("text/calendar");
    expect(anexo.filename).toBe("convite.ics");
    return new TextDecoder().decode(
      Uint8Array.from(atob(anexo.content), (c) => c.charCodeAt(0))
    );
  }

  it("o convite pendente e no prazo de fato dispara e-mail", () => {
    expect(
      shouldSendInviteEmail(convite, new Date("2026-08-20T12:00:00.000Z"))
    ).toEqual({ send: true });
  });

  it("o anexo é um VCALENDAR completo, com o evento do anfitrião dentro", () => {
    const ics = icsDoAnexo(payload());

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Reunião de kickoff");
    expect(ics).toContain("DTSTART:20260901T130000Z");
    expect(ics).toContain("DTEND:20260901T140000Z");
    expect(ics).toContain("UID:event-1@orbyva.app");
    expect(ics).toContain("END:VEVENT");
  });

  it("o .ics identifica organizador e convidado, e aponta de volta para o convite", () => {
    const ics = icsDoAnexo(payload());
    expect(ics).toContain("ORGANIZER:mailto:host@orbyva.app");
    expect(ics).toContain("convidada@exemplo.com");
    expect(ics).toContain("URL:https://orbyva.app/events/invite/tok123");
  });

  it("evento sem hora de fim vira DURATION de 1h, não um DTEND inventado", () => {
    const ics = icsDoAnexo(payload({ eventEndsAt: null }));
    expect(ics).toContain("DURATION:PT1H");
    expect(ics).not.toContain("DTEND");
  });

  it("nenhuma linha do .ics passa de 75 octetos — é o que faz o Google aceitar o arquivo", () => {
    const ics = icsDoAnexo(
      payload({
        eventTitle:
          "Retrospectiva de planejamento estratégico da equipe de operações, com café",
      })
    );
    const encoder = new TextEncoder();
    for (const linha of ics.trimEnd().split("\r\n")) {
      expect(encoder.encode(linha).length).toBeLessThanOrEqual(75);
    }
  });

  it("o assunto e o corpo dizem quem convidou e para o quê", () => {
    const p = payload();
    expect(p.to).toBe("convidada@exemplo.com");
    expect(p.subject).toBe("Rafael te convidou para Reunião de kickoff");
    expect(p.bodyHtml).toContain("Rafael");
    expect(p.bodyHtml).toContain("Reunião de kickoff");
    expect(p.ctaUrl).toBe("https://orbyva.app/events/invite/tok123");
  });

  it("o e-mail não vaza nada do anfitrião além de nome e e-mail de organizador", () => {
    const p = payload();
    // Nada de projeto, id de conta, ou outros eventos.
    expect(p.bodyHtml).not.toContain("project");
    expect(p.ics).not.toContain("Lançamento");
    expect(p.subject).not.toContain("@orbyva.app");
  });

  it("nome de quem convida com HTML é neutralizado antes de entrar no corpo", () => {
    const p = payload({ inviterName: '<img src=x onerror="alert(1)">' });
    expect(p.bodyHtml).not.toContain("<img");
    expect(p.bodyHtml).toContain("&lt;img");
  });
});
