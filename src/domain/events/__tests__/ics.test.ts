import { describe, expect, it } from "vitest";
import {
  buildEventIcs,
  escapeIcsText,
  foldIcsLine,
  ICS_DEFAULT_DURATION,
  toIcsUtc,
} from "@/domain/events/ics";

/**
 * O `.ics` é a única parte da feature 076 que sai do app e vai ser lida por outro software
 * (Google/Apple/Outlook Calendar), então não dá para "conferir no olho": qualquer desvio da RFC 5545
 * vira um anexo que o Google recusa silenciosamente. Este arquivo trava as regras que costumam
 * quebrar — dobra por octeto, escape, UTC — e a decisão de duração padrão.
 */

const encoder = new TextEncoder();

function linhas(ics: string): string[] {
  expect(ics.endsWith("\r\n")).toBe(true);
  return ics.trimEnd().split("\r\n");
}

/** Desfaz a dobra (linha de continuação começa com um espaço) para checar o conteúdo lógico. */
function desdobrar(ics: string): string[] {
  const out: string[] = [];
  for (const line of linhas(ics)) {
    if (line.startsWith(" ") && out.length > 0) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

const base = {
  uid: "event-1",
  title: "Reunião de kickoff",
  startsAt: "2026-09-01T13:00:00.000Z",
  endsAt: "2026-09-01T14:00:00.000Z",
  now: new Date("2026-08-20T09:30:00.000Z"),
};

describe("toIcsUtc", () => {
  it("converte ISO para o formato UTC do iCalendar", () => {
    expect(toIcsUtc("2026-09-01T13:00:00.000Z")).toBe("20260901T130000Z");
  });

  it("converte horário com offset para UTC, não mantém o offset local", () => {
    expect(toIcsUtc("2026-09-01T10:00:00-03:00")).toBe("20260901T130000Z");
  });

  it("data inválida estoura em vez de gerar um .ics quebrado", () => {
    expect(() => toIcsUtc("não é data")).toThrow(/Data inválida/);
  });
});

describe("escapeIcsText", () => {
  it("escapa vírgula, ponto-e-vírgula, barra invertida e quebra de linha", () => {
    expect(escapeIcsText("a,b")).toBe("a\\,b");
    expect(escapeIcsText("a;b")).toBe("a\\;b");
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
    expect(escapeIcsText("a\nb")).toBe("a\\nb");
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
  });

  it("escapa a barra invertida antes dos outros, sem duplicar escape", () => {
    // Ordem errada devolveria "a\\\\,b" (barra escapada duas vezes).
    expect(escapeIcsText("a\\,b")).toBe("a\\\\\\,b");
  });

  it("não mexe em acentos", () => {
    expect(escapeIcsText("Reunião com ação")).toBe("Reunião com ação");
  });
});

describe("foldIcsLine", () => {
  it("linha curta passa intacta", () => {
    expect(foldIcsLine("SUMMARY:curto")).toBe("SUMMARY:curto");
  });

  it("dobra em no máximo 75 octetos, com espaço de continuação", () => {
    const linha = `SUMMARY:${"a".repeat(200)}`;
    const partes = foldIcsLine(linha).split("\r\n");
    expect(partes.length).toBeGreaterThan(1);
    for (const [i, parte] of partes.entries()) {
      expect(encoder.encode(parte).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(parte.startsWith(" ")).toBe(true);
    }
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(linha);
  });

  it("conta OCTETOS, não caracteres — acento ocupa 2 bytes", () => {
    // 80 caracteres, 160 octetos: contando caractere, caberia numa linha de 75 e o Google recusaria.
    const linha = `SUMMARY:${"é".repeat(80)}`;
    const partes = foldIcsLine(linha).split("\r\n");
    for (const parte of partes) {
      expect(encoder.encode(parte).length).toBeLessThanOrEqual(75);
    }
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(linha);
  });

  it("nunca parte um caractere multibyte no meio", () => {
    const linha = `SUMMARY:${"ação ".repeat(40)}`;
    const dobrada = foldIcsLine(linha);
    // Round-trip por UTF-8: byte partido viraria U+FFFD.
    expect(dobrada).not.toContain("�");
  });
});

describe("buildEventIcs", () => {
  it("monta um VCALENDAR/VEVENT completo com DTSTART/DTEND em UTC", () => {
    const ics = buildEventIcs(base);
    const l = desdobrar(ics);

    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("VERSION:2.0");
    expect(l).toContain("BEGIN:VEVENT");
    expect(l).toContain("UID:event-1");
    expect(l).toContain("DTSTAMP:20260820T093000Z");
    expect(l).toContain("DTSTART:20260901T130000Z");
    expect(l).toContain("DTEND:20260901T140000Z");
    expect(l).toContain("SUMMARY:Reunião de kickoff");
    expect(l).toContain("END:VEVENT");
    expect(l[l.length - 1]).toBe("END:VCALENDAR");
  });

  it("todo DTSTART/DTEND termina em Z — nada de horário flutuante", () => {
    for (const line of desdobrar(buildEventIcs(base))) {
      if (line.startsWith("DTSTART") || line.startsWith("DTEND") || line.startsWith("DTSTAMP")) {
        expect(line.endsWith("Z")).toBe(true);
      }
    }
  });

  it("evento sem ends_at usa DURATION de 1h, e não inventa DTEND", () => {
    const l = desdobrar(buildEventIcs({ ...base, endsAt: null }));
    expect(l).toContain(`DURATION:${ICS_DEFAULT_DURATION}`);
    expect(l.some((line) => line.startsWith("DTEND"))).toBe(false);
  });

  it("ends_at ausente (undefined) cai na mesma regra", () => {
    const l = desdobrar(buildEventIcs({ ...base, endsAt: undefined }));
    expect(l).toContain("DURATION:PT1H");
  });

  it("escapa vírgula e ponto-e-vírgula no SUMMARY", () => {
    const l = desdobrar(
      buildEventIcs({ ...base, title: "Reunião: pauta, riscos; e prazos" })
    );
    expect(l).toContain("SUMMARY:Reunião: pauta\\, riscos\\; e prazos");
  });

  it("quebra de linha no título vira \\n, sem partir a estrutura do arquivo", () => {
    const ics = buildEventIcs({ ...base, title: "Linha 1\nLinha 2" });
    expect(desdobrar(ics)).toContain("SUMMARY:Linha 1\\nLinha 2");
    // Nenhuma linha do arquivo pode ter sobrado sem propriedade por causa da quebra.
    for (const line of linhas(ics)) {
      expect(line).not.toBe("Linha 2");
    }
  });

  it("acentos saem em UTF-8, sem mojibake", () => {
    const ics = buildEventIcs({ ...base, title: "Café com ação e coração" });
    const bytes = encoder.encode(ics);
    expect(new TextDecoder("utf-8", { fatal: true }).decode(bytes)).toContain(
      "Café com ação e coração"
    );
  });

  it("título longo com acento é dobrado dentro do limite e volta idêntico", () => {
    const title = "Retrospectiva de planejamento estratégico da equipe de operações ".repeat(3);
    const ics = buildEventIcs({ ...base, title });

    for (const line of linhas(ics)) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(desdobrar(ics)).toContain(`SUMMARY:${title}`);
  });

  it("organizador, convidado e link entram quando informados", () => {
    const l = desdobrar(
      buildEventIcs({
        ...base,
        organizerEmail: "host@orbyva.app",
        attendeeEmail: "convidada@exemplo.com",
        url: "https://orbyva.app/events/invite/tok123",
      })
    );
    expect(l).toContain("ORGANIZER:mailto:host@orbyva.app");
    expect(
      l.some((line) => line.includes("ATTENDEE") && line.includes("convidada@exemplo.com"))
    ).toBe(true);
    expect(l).toContain("URL:https://orbyva.app/events/invite/tok123");
    expect(
      l.some((line) => line.startsWith("DESCRIPTION:") && line.includes("tok123"))
    ).toBe(true);
  });

  it("sem organizador/convidado/link, essas linhas simplesmente não existem", () => {
    const l = desdobrar(buildEventIcs(base));
    expect(l.some((line) => line.startsWith("ORGANIZER"))).toBe(false);
    expect(l.some((line) => line.startsWith("ATTENDEE"))).toBe(false);
    expect(l.some((line) => line.startsWith("URL"))).toBe(false);
  });

  it("usa METHOD:PUBLISH — 'adicione na sua agenda', não um RSVP que ninguém responde", () => {
    expect(desdobrar(buildEventIcs(base))).toContain("METHOD:PUBLISH");
  });
});
