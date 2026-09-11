import type { NoteLinkEntityType } from "@/types/notes";

export const NOTE_LINK_TYPE_LABEL: Record<NoteLinkEntityType, string> = {
  project: "Projeto",
  task: "Tarefa",
  book: "Livro",
  movie: "Filme",
  album: "Álbum",
  trip: "Viagem",
  place: "Lugar",
  goal: "Meta",
  habit: "Hábito",
  vehicle: "Veículo",
};

export const NOTE_LINK_PICK_TYPES = ["task", "project", "goal"] as const;
