import type { Note, NoteFolder } from "@/types/notes";

/**
 * Teto da árvore de pastas (feature 099). Cinco níveis cabem empresa → clientes → cliente →
 * demandas (o exemplo da IDEA) e ainda sobra um. Sem teto a sidebar viraria um finder.
 */
export const NOTE_FOLDER_MAX_DEPTH = 5;

export function folderDepthLimitMessage(kind: "create" | "move"): string {
  return kind === "move"
    ? `Essa mudança deixaria a pasta com mais de ${NOTE_FOLDER_MAX_DEPTH} níveis.`
    : `A pasta não pode ter mais de ${NOTE_FOLDER_MAX_DEPTH} níveis.`;
}

/** Valor de `?folder=` e do filtro da lista para notas sem pasta. */
export const INBOX_FOLDER = "inbox" as const;

/**
 * Recorte da lista por pasta. `null` = todas; `"inbox"` = sem pasta; uuid = só aquele
 * `folder_id`, sem as notas das subpastas.
 */
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

/**
 * Lista plana → árvore, filhos ordenados por nome. Pasta cujo pai não está na lista sobe para a
 * raiz — senão um `parent_id` órfão esconderia a pasta inteira.
 */
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

/** Árvore achatada com a profundidade de cada pasta (raiz = 1) — alimenta o select indentado. */
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

/**
 * Profundidade da pasta na árvore. `null` é "acima da raiz" (0): aninhar lá cria uma pasta de
 * nível 1. Ciclo nos dados para a caminhada em vez de estourar a pilha.
 */
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

/** Altura da subárvore (folha = 1). Usada ao *mover* uma pasta, não ao criar. */
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

/** Dá para criar uma pasta nova (altura 1) debaixo deste pai? */
export function canNestUnder(
  folders: NoteFolder[],
  parentId: string | null
): boolean {
  return folderDepth(folders, parentId) < NOTE_FOLDER_MAX_DEPTH;
}

/** Dá para mover a pasta `id` para debaixo de `nextParentId` sem estourar o teto nem ciclar? */
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

/**
 * Patch `filho.id → novo parent_id` para antes de apagar a pasta. Filhos sobem para o pai da
 * pasta apagada (ou para a raiz).
 */
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

export function parseFolderParam(raw: string | null): FolderNav {
  if (!raw) return null;
  if (raw === INBOX_FOLDER) return INBOX_FOLDER;
  return raw;
}

/** Pais, avós, … da pasta — do mais próximo à raiz. Pasta raiz devolve `[]`. */
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

/**
 * Kind do `data-drop-zone` da árvore: arrastar uma nota para a pasta (feature 099).
 * `note-folder|inbox` = Sem pasta; `note-folder|<uuid>` = aquela pasta.
 */
export const NOTE_FOLDER_DROP_KIND = "note-folder";

/**
 * Lê o alvo do arraste. `undefined` = zona que não é pasta (ignorar);
 * `null` = Sem pasta; uuid = `folder_id` novo.
 */
export function folderIdFromDropZone(
  zone: string | null | undefined
): string | null | undefined {
  if (!zone) return undefined;
  const [kind, id] = zone.split("|");
  if (kind !== NOTE_FOLDER_DROP_KIND || !id) return undefined;
  return id === INBOX_FOLDER ? null : id;
}
