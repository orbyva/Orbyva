import type { ProjectEventCreateRequest } from "@/types/tasks";

/**
 * Regra de criar/editar um evento de agenda (feature 103), fora da UI de propósito: os dois modos
 * do `ProjectEventFormDialog` (criação e edição) e o gesto de arrastar da 104 montam o mesmo
 * payload e cobram a mesma validação — duplicá-la em três call sites é como se produz um evento
 * que nasce válido pelo botão e inválido pelo arrasto.
 */

/** O que o formulário tem na mão: campos de `<input>`, todos string. */
export interface ProjectEventDraft {
  title: string;
  /** `yyyy-MM-dd` do `<input type="date">`. */
  date: string;
  /** `HH:mm` do `<input type="time">`. */
  startTime: string;
  /** `HH:mm` ou vazio — hora de fim é opcional (vira `ends_at: null`). */
  endTime: string;
  projectId: string | null;
}

export type ProjectEventFieldError = "title" | "date" | "startTime" | "endTime";

/**
 * Instante local a partir de `yyyy-MM-dd` + `HH:mm`. O `new Date("2026-09-02T15:00")` do JS já é
 * interpretado como **hora local** (a forma sem sufixo de fuso), mas montar pelo construtor
 * numérico deixa isso explícito e imune a `HH:mm:ss` parcial. Passar a string do input direto para
 * o banco gravaria o horário como UTC e deslocaria o evento no fuso do usuário — o mesmo cuidado
 * que `handleAddProjectEvent` já tomava com `new Date(startsAt).toISOString()`.
 */
function localDateTime(date: string, time: string): Date | null {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/**
 * Erros por campo do rascunho — lista vazia = pode salvar. Validação inline, não toast: toast fica
 * reservado para falha de I/O (ver `docs/stack.md`).
 */
export function validateProjectEventDraft(
  draft: ProjectEventDraft
): Partial<Record<ProjectEventFieldError, string>> {
  const errors: Partial<Record<ProjectEventFieldError, string>> = {};
  if (!draft.title.trim()) errors.title = "Informe um título.";
  if (!draft.date) errors.date = "Escolha uma data.";
  if (!draft.startTime) errors.startTime = "Escolha a hora de início.";
  if (draft.date && draft.startTime && draft.endTime) {
    const start = localDateTime(draft.date, draft.startTime);
    const end = localDateTime(draft.date, draft.endTime);
    // Fim **igual** ao início também é erro: um evento de duração zero é sempre engano de digitação,
    // e `getItemTimeRange` desenharia um bloco de 1 minuto ilegível na grade de horas.
    if (start && end && end.getTime() <= start.getTime()) {
      errors.endTime = "A hora de fim precisa ser depois do início.";
    }
  }
  return errors;
}

export function isProjectEventDraftValid(draft: ProjectEventDraft): boolean {
  return Object.keys(validateProjectEventDraft(draft)).length === 0;
}

/**
 * Rascunho → payload de `createProjectEvent`/`updateProjectEvent`. `ends_at` só existe quando a
 * hora de fim foi preenchida; sem ela, `null`, e `getItemTimeRange` desenha o bloco com
 * `DEFAULT_ITEM_DURATION_MINUTES` (30 min), como já fazia para os eventos criados pelo projeto.
 *
 * Lança se o rascunho for inválido — quem chama já barrou o "Salvar" pela validação, então chegar
 * aqui com data vazia é bug de wiring, não entrada do usuário.
 */
export function buildProjectEventPayload(draft: ProjectEventDraft): ProjectEventCreateRequest {
  const start = localDateTime(draft.date, draft.startTime);
  if (!start) throw new Error("Rascunho de evento inválido: data/hora de início ausente.");
  const end = draft.endTime ? localDateTime(draft.date, draft.endTime) : null;
  return {
    project_id: draft.projectId,
    title: draft.title.trim(),
    starts_at: start.toISOString(),
    ends_at: end ? end.toISOString() : null,
  };
}

/** Rascunho vazio, com a data (e opcionalmente a hora) que o call site trouxe — o `+` de um dia da
 * grade abre já naquele dia, e a 104 vai preencher também a faixa de horário arrastada. */
export function emptyProjectEventDraft(
  overrides: Partial<ProjectEventDraft> = {}
): ProjectEventDraft {
  return {
    title: "",
    date: "",
    startTime: "",
    endTime: "",
    projectId: null,
    ...overrides,
  };
}

/** Linha do banco → rascunho do formulário (modo edição). Converte o ISO de volta para **hora
 * local**, o inverso exato de `buildProjectEventPayload`. */
export function projectEventToDraft(event: {
  project_id: string | null;
  title: string;
  starts_at: string;
  ends_at?: string | null;
}): ProjectEventDraft {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isoTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    title: event.title,
    date: isoDate(start),
    startTime: isoTime(start),
    // Evento que atravessa a meia-noite: o formulário tem **uma** data só, então o fim volta como
    // hora e a data do início manda. É a mesma limitação do par de inputs original do projeto — e
    // um evento de vários dias é caso para outra feature, não para um campo escondido aqui.
    endTime: end ? isoTime(end) : "",
    projectId: event.project_id,
  };
}
