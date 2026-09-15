export type NoteKind = "markdown" | "canvas";

export interface NoteCanvasData {
  elements: readonly unknown[];
  appState?: Record<string, unknown> | null;
  files?: Record<string, unknown> | null;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  kind: NoteKind;
  canvas_data: NoteCanvasData | null;
  project_id: string | null;
  updated_at?: string | null;
}

export const NOTE_LINK_ENTITY_TYPES = [
  "project",
  "task",
  "book",
  "movie",
  "album",
  "trip",
  "place",
  "goal",
  "habit",
  "vehicle",
] as const;

export type NoteLinkEntityType = (typeof NOTE_LINK_ENTITY_TYPES)[number];

export interface NoteLink {
  id: string;
  note_id: string;
  entity_type: NoteLinkEntityType;
  entity_id: string;
  label: string | null;
}

export type NoteLinkDraft = {
  note_id: string;
  entity_type: NoteLinkEntityType;
  entity_id: string;
  label?: string | null;
};
