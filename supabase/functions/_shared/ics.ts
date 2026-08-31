/**
 * Geração de `.ics` (RFC 5545) — espelho de src/domain/events/ics.ts
 * (Edge Deno não importa o front; manter sincronizado).
 *
 * A cobertura vive do lado do front (`src/domain/events/__tests__/ics.test.ts`), e
 * `ics.mirror.test.ts` garante que os dois arquivos não divergem.
 */

export type BuildEventIcsInput = {
  /** Identificador estável do evento — o `id` do `project_event` do anfitrião serve. */
  uid: string;
  title: string;
  /** ISO 8601. */
  startsAt: string;
  /** ISO 8601. Sem isto, o evento vira `DURATION:PT1H`. */
  endsAt?: string | null;
  organizerEmail?: string | null;
  attendeeEmail?: string | null;
  /** Link do convite no app — vai em `URL` e no fim da `DESCRIPTION`. */
  url?: string | null;
  /** Só para teste: carimbo de `DTSTAMP`. Default = agora. */
  now?: Date;
};

/** Duração assumida quando o evento não tem `ends_at`. */
export const ICS_DEFAULT_DURATION = "PT1H";

/**
 * Escapa um valor de texto do iCalendar (RFC 5545 §3.3.11). A ordem importa: a barra invertida vem
 * primeiro, senão os escapes gerados abaixo seriam escapados de novo.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/[\r\n]/g, "\\n");
}

/** `2026-09-01T13:00:00.000Z` → `20260901T130000Z`. */
export function toIcsUtc(iso: string | Date): string {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data inválida para o .ics: ${String(iso)}`);
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const encoder = new TextEncoder();

/**
 * Dobra uma linha em no máximo 75 **octetos** (RFC 5545 §3.1), continuando com um espaço. Contar
 * caractere em vez de octeto quebraria em qualquer título com acento — que em pt-BR é a regra, não
 * a exceção — e nunca parte um caractere multibyte no meio.
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Limite da 1ª linha é 75; das seguintes, 74 (o espaço de continuação ocupa 1 octeto).
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += size;
  }
  if (current) out.push(current);

  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

/** Monta o VCALENDAR/VEVENT completo, já dobrado e com CRLF. */
export function buildEventIcs(input: BuildEventIcsInput): string {
  const {
    uid,
    title,
    startsAt,
    endsAt,
    organizerEmail,
    attendeeEmail,
    url,
    now,
  } = input;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Orbyva//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    // `REQUEST` faria o Gmail desenhar botões de RSVP e tentar responder ao organizador, que não
    // existe do lado do servidor. `PUBLISH` é o convite "adicione na sua agenda", que é o combinado.
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toIcsUtc(now ?? new Date())}`,
    `DTSTART:${toIcsUtc(startsAt)}`,
    endsAt ? `DTEND:${toIcsUtc(endsAt)}` : `DURATION:${ICS_DEFAULT_DURATION}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];

  if (organizerEmail) {
    lines.push(`ORGANIZER:mailto:${organizerEmail}`);
  }
  if (attendeeEmail) {
    lines.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${attendeeEmail}`
    );
  }
  if (url) {
    lines.push(`URL:${escapeIcsText(url)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(`Convite no Orbyva: ${url}`)}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
