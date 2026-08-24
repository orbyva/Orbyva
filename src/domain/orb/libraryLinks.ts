import type { OrbModule } from "@/types/orb";

/**
 * Destinos que o Orb pode oferecer como link.
 *
 * A rota é montada aqui a partir de módulo + status — o agente escolhe entre
 * valores de um enum, nunca escreve uma URL. Assim ele não consegue apontar pra
 * uma tela que não existe (ou pra fora do app).
 */
const LIST_LABEL: Record<OrbModule, Record<string, string>> = {
  movies: {
    to_watch: "Quero assistir",
    watching: "Assistindo",
    watched: "Já assisti",
    abandoned: "Abandonados",
  },
  books: {
    to_read: "Quero ler",
    reading: "Lendo",
    read: "Já li",
    abandoned: "Abandonados",
  },
  albums: {
    to_listen: "Quero ouvir",
    listened: "Já ouvi",
  },
};

const MODULE_PATH: Record<OrbModule, string> = {
  movies: "/admin/movies",
  books: "/admin/books",
  albums: "/admin/music",
};

export interface OrbLibraryLink {
  to: string;
  label: string;
}

/**
 * Rota + rótulo pra uma lista da biblioteca. `null` quando o par
 * módulo/status não existe — melhor não oferecer o chip do que levar a
 * uma aba vazia por engano.
 */
export function libraryLink(
  module: unknown,
  status: unknown
): OrbLibraryLink | null {
  const mod = String(module ?? "") as OrbModule;
  const st = String(status ?? "");
  const labels = LIST_LABEL[mod];
  if (!labels || !labels[st]) return null;

  return {
    to: `${MODULE_PATH[mod]}?status=${st}`,
    label: labels[st],
  };
}
