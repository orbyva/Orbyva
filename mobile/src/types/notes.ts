export type NoteKind = "markdown" | "canvas";

export interface Note {
  id: string;
  title: string;
  content: string;
  kind: NoteKind;
  project_id: string | null;
  updated_at?: string | null;
}
