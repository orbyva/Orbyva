import type { Note, NoteFolder } from "@/types/notes";

/**
 * Espelho de `src/domain/notes/folders.ts` (feature 099). Sem drop zone HTML5 — no Expo o
 * movimento da nota é o picker do editor.
 */
export const NOTE_FOLDER_MAX_DEPTH = 5;

export function folderDepthLimitMessage(kind: "create" | "move"): string {
  return kind === "move"
    ? `Essa mudança deixaria a pasta com mais de ${NOTE_FOLDER_MAX_DEPTH} níveis.`
    : `A pasta não pode ter mais de ${NOTE_FOLDER_MAX_DEPTH} níveis.`;
}

export const INBOX_FOLDER = "inbox" as const;

export type FolderNav = null | typeof INBOX_FOLDER | string;

export interface FolderNode extends NoteFolder {
  children: FolderNode[];
}

function byIdMap(folders: NoteFolder[]): Map<string, NoteFolder> {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

function compareFolderName(a: NoteFolder, b: NoteFolder): number {
  return a.name.localeCompare(b.name, "pt");
}

export function buildFolderTree(folders: NoteFolder[]): FolderNode[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const childrenOf = new Map<string | null, NoteFolder[]>();

  for (const folder of folders) {
    const parentId =
      folder.parent_id && ids.has(folder.parent_id) ? folder.parent_id : null;
    const siblings = childrenOf.get(parentId) ?? [];
    siblings.push(folder);
    childrenOf.set(parentId, siblings);
  }

  const walk = (parentId: string | null): FolderNode[] =>
    (childrenOf.get(parentId) ?? [])
      .slice()
      .sort(compareFolderName)
      .map((folder) => ({ ...folder, children: walk(folder.id) }));

  return walk(null);
}

export function flattenFolderTree(
  folders: NoteFolder[]
): { folder: NoteFolder; depth: number }[] {
  const out: { folder: NoteFolder; depth: number }[] = [];
  const walk = (nodes: FolderNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ folder: node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(buildFolderTree(folders), 1);
  return out;
}

export function folderDepth(folders: NoteFolder[], id: string | null): number {
  if (id == null) return 0;
  const byId = byIdMap(folders);
  let depth = 0;
  let current: string | null = id;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) return depth;
    const folder = byId.get(current);
    if (!folder) return depth;
    seen.add(current);
    depth += 1;
    current = folder.parent_id;
  }
  return depth;
}

export function subtreeHeight(folders: NoteFolder[], id: string): number {
  const children = folders.filter((folder) => folder.parent_id === id);
  if (children.length === 0) return 1;
  return (
    1 + Math.max(...children.map((child) => subtreeHeight(folders, child.id)))
  );
}

export function wouldCreateCycle(
  folders: NoteFolder[],
  id: string,
  nextParentId: string | null
): boolean {
  if (nextParentId == null) return false;
  if (nextParentId === id) return true;
  const byId = byIdMap(folders);
  let current: string | null = nextParentId;
  const seen = new Set<string>();
  while (current) {
    if (current === id) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = byId.get(current)?.parent_id ?? null;
  }
  return false;
}

export function canNestUnder(
  folders: NoteFolder[],
  parentId: string | null
): boolean {
  return folderDepth(folders, parentId) < NOTE_FOLDER_MAX_DEPTH;
}

export function canMoveFolder(
  folders: NoteFolder[],
  id: string,
  nextParentId: string | null
): boolean {
  if (wouldCreateCycle(folders, id, nextParentId)) return false;
  return (
    folderDepth(folders, nextParentId) + subtreeHeight(folders, id) <=
    NOTE_FOLDER_MAX_DEPTH
  );
}

export function notesInFolder(notes: Note[], folderId: FolderNav): Note[] {
  if (folderId == null) return notes;
  if (folderId === INBOX_FOLDER) {
    return notes.filter((note) => note.folder_id == null);
  }
  return notes.filter((note) => note.folder_id === folderId);
}

export function reparentChildren(
  folders: NoteFolder[],
  deletedId: string
): Record<string, string | null> {
  const deleted = folders.find((folder) => folder.id === deletedId);
  const nextParent = deleted?.parent_id ?? null;
  const patch: Record<string, string | null> = {};
  for (const folder of folders) {
    if (folder.parent_id === deletedId) patch[folder.id] = nextParent;
  }
  return patch;
}

export function folderAncestorIds(
  folders: NoteFolder[],
  id: string
): string[] {
  const byId = byIdMap(folders);
  const ancestors: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current?.parent_id && !seen.has(current.id)) {
    seen.add(current.id);
    ancestors.push(current.parent_id);
    current = byId.get(current.parent_id);
  }
  return ancestors;
}

/** Lista de notas com o contexto de pasta (espelho do web). */
export function notesListHref(folderNav: FolderNav): string {
  if (folderNav == null) return "/notes";
  return `/notes?folder=${encodeURIComponent(folderNav)}`;
}

/** Lugar da nota na lista: Sem pasta → inbox; pasta → o id. */
export function folderNavForNote(folderId: string | null): FolderNav {
  return folderId ?? INBOX_FOLDER;
}
