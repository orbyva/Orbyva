import type { DragEvent } from "react";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Inbox,
  Library,
  Pencil,
  Plus,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { cn } from "@/lib/utils";
import { dropZoneAttrs } from "@/lib/dropZone";
import {
  INBOX_FOLDER,
  NOTE_FOLDER_DROP_KIND,
  NOTE_FOLDER_MAX_DEPTH,
  buildFolderTree,
  canMoveFolder,
  folderAncestorIds,
  notesInFolder,
  type FolderNav,
  type FolderNode,
} from "@/domain/notes/folders";
import type { Note, NoteFolder } from "@/types/notes";
import type { Project, Tag } from "@/types/tasks";

const DELETE_DESCRIPTION =
  "As notas desta pasta vão para Sem pasta. Subpastas sobem um nível.";

const COLLAPSED_STORAGE_KEY = "orbyva_note_folder_collapsed_v1";
const ACTION_BTN = cn("h-6 w-6 shrink-0", ICON_EDIT_BUTTON_CLASS);

function readCollapsedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeCollapsedIds(ids: Set<string>) {
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function acceptDrop(
  event: DragEvent,
  folderId: string | null,
  onDragOverTarget?: (target: string | null) => void
) {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  onDragOverTarget?.(folderId === null ? INBOX_FOLDER : folderId);
}

function Count({ value }: { value: number }) {
  return (
    <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/80 transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
      {value}
    </span>
  );
}

function FolderActions({
  name,
  canNest,
  dragging,
  onCreateChild,
  onEdit,
  onDelete,
}: {
  name: string;
  canNest: boolean;
  dragging: boolean;
  onCreateChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-no-folder-drag
      className={cn(
        "absolute right-0.5 top-1.5 flex rounded-md bg-background/90 opacity-0 pointer-events-none shadow-sm ring-1 ring-border/60 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        dragging && "pointer-events-none"
      )}
    >
      {canNest && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={ACTION_BTN}
          aria-label={`Nova subpasta em ${name}`}
          onClick={onCreateChild}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={ACTION_BTN}
        aria-label={`Editar pasta ${name}`}
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDeleteDialog
        title={`Excluir a pasta ${name}?`}
        description={DELETE_DESCRIPTION}
        onConfirm={onDelete}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-destructive"
          aria-label={`Excluir pasta ${name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </ConfirmDeleteDialog>
    </div>
  );
}

function FolderRow({
  node,
  depth,
  folders,
  notes,
  projects,
  tags,
  selected,
  dropTarget,
  draggingNote,
  draggingFolderId,
  collapsed,
  onToggleCollapsed,
  onSelect,
  onCreateChild,
  onEdit,
  onDelete,
  onDragOverTarget,
  onDropNote,
  onDragFolderStart,
  onDragFolderEnd,
  onDropFolder,
}: {
  node: FolderNode;
  depth: number;
  folders: NoteFolder[];
  notes: Note[];
  projects: Project[];
  tags: Tag[];
  selected: FolderNav;
  dropTarget: string | null;
  draggingNote: boolean;
  draggingFolderId: string | null;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string, nextCollapsed: boolean) => void;
  onSelect: (nav: FolderNav) => void;
  onCreateChild: (parentId: string) => void;
  onEdit: (folder: NoteFolder) => void;
  onDelete: (folder: NoteFolder) => void;
  onDragOverTarget?: (target: string | null) => void;
  onDropNote?: (folderId: string | null) => void;
  onDragFolderStart?: (folderId: string) => void;
  onDragFolderEnd?: () => void;
  onDropFolder?: (parentId: string) => void;
}) {
  const count = notesInFolder(notes, node.id).length;
  const active = selected === node.id;
  const isDrop = dropTarget === node.id;
  const dragging = draggingNote || draggingFolderId != null;
  const acceptingFolder =
    draggingFolderId != null &&
    draggingFolderId !== node.id &&
    canMoveFolder(folders, draggingFolderId, node.id);
  const showDrop = isDrop && (draggingNote || acceptingFolder);
  const project = projects.find((p) => p.id === node.project_id);
  const tag = tags.find((t) => t.id === node.tag_id);
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren && !collapsed.has(node.id);
  const Icon = expanded ? FolderOpen : Folder;

  return (
    <li>
      <div
        draggable
        className={cn(
          "group relative cursor-grab rounded-lg active:cursor-grabbing",
          active && "bg-primary/10",
          draggingFolderId === node.id && "opacity-60",
          showDrop && "bg-primary/15 ring-1 ring-primary/40"
        )}
        onDragStart={(event) => {
          if (
            (event.target as HTMLElement).closest("[data-no-folder-drag]")
          ) {
            event.preventDefault();
            return;
          }
          event.stopPropagation();
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", node.id);
          }
          onDragFolderStart?.(node.id);
        }}
        onDragEnd={(event) => {
          event.stopPropagation();
          onDragFolderEnd?.();
        }}
        onDragOver={(event) => {
          if (draggingFolderId === node.id) return;
          if (draggingFolderId && !acceptingFolder) return;
          acceptDrop(event, node.id, onDragOverTarget);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleCollapsed(node.id, false);
          onDropFolder?.(node.id);
          onDropNote?.(node.id);
        }}
        {...dropZoneAttrs(NOTE_FOLDER_DROP_KIND, node.id)}
      >
        <div className="flex items-start gap-0.5 pl-0.5">
          {hasChildren ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground"
              data-no-folder-drag
              aria-expanded={expanded}
              aria-label={
                expanded ? `Recolher ${node.name}` : `Expandir ${node.name}`
              }
              onClick={() => onToggleCollapsed(node.id, expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : (
            <span className="mt-0.5 w-6 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-1 flex-col rounded-lg py-1.5 pr-2 text-left text-sm hover:bg-muted/60",
              active && "font-medium text-primary hover:bg-transparent"
            )}
            onClick={() => onSelect(node.id)}
            aria-current={active ? "page" : undefined}
            aria-label={`Pasta ${node.name}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
                style={tag ? { color: tag.color } : undefined}
              />
              <span className="min-w-0 truncate" title={node.name}>
                {node.name}
              </span>
              <Count value={count} />
            </span>
            {(project || tag) && (
              <span className="mt-0.5 flex min-w-0 items-center gap-2 pl-6 text-[10px] font-normal leading-tight text-muted-foreground">
                {project && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      aria-hidden
                      style={{ backgroundColor: project.color ?? "#94a3b8" }}
                    />
                    <span className="truncate" title={`Projeto ${project.name}`}>
                      {project.name}
                    </span>
                  </span>
                )}
                {tag && (
                  <span
                    className="inline-flex min-w-0 items-center gap-1"
                    style={{ color: tag.color }}
                  >
                    <TagIcon className="h-2.5 w-2.5 shrink-0" aria-hidden />
                    <span className="truncate" title={`Etiqueta ${tag.name}`}>
                      {tag.name}
                    </span>
                  </span>
                )}
              </span>
            )}
          </button>
        </div>
        <FolderActions
          name={node.name}
          canNest={depth < NOTE_FOLDER_MAX_DEPTH}
          dragging={dragging}
          onCreateChild={() => {
            onToggleCollapsed(node.id, false);
            onCreateChild(node.id);
          }}
          onEdit={() => onEdit(node)}
          onDelete={() => onDelete(node)}
        />
      </div>
      {expanded && (
        <ul className="ml-3.5 mt-0.5 space-y-0.5 border-l border-border/70 pl-1.5">
          {node.children.map((child) => (
            <FolderRow
              key={child.id}
              node={child}
              depth={depth + 1}
              folders={folders}
              notes={notes}
              projects={projects}
              tags={tags}
              selected={selected}
              dropTarget={dropTarget}
              draggingNote={draggingNote}
              draggingFolderId={draggingFolderId}
              collapsed={collapsed}
              onToggleCollapsed={onToggleCollapsed}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onDelete={onDelete}
              onDragOverTarget={onDragOverTarget}
              onDropNote={onDropNote}
              onDragFolderStart={onDragFolderStart}
              onDragFolderEnd={onDragFolderEnd}
              onDropFolder={onDropFolder}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function NoteFolderTree({
  folders,
  notes,
  projects,
  tags,
  selected,
  dropTarget = null,
  draggingNote = false,
  draggingFolderId = null,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onDragOverTarget,
  onDropNote,
  onDragFolderStart,
  onDragFolderEnd,
  onDropFolder,
}: {
  folders: NoteFolder[];
  notes: Note[];
  projects: Project[];
  tags: Tag[];
  selected: FolderNav;
  dropTarget?: string | null;
  draggingNote?: boolean;
  draggingFolderId?: string | null;
  onSelect: (nav: FolderNav) => void;
  onCreate: (parentId: string | null) => void;
  onEdit: (folder: NoteFolder) => void;
  onDelete: (folder: NoteFolder) => void;
  onDragOverTarget?: (target: string | null) => void;
  onDropNote?: (folderId: string | null) => void;
  onDragFolderStart?: (folderId: string) => void;
  onDragFolderEnd?: () => void;
  onDropFolder?: (parentId: string) => void;
}) {
  const tree = buildFolderTree(folders);
  const allCount = notes.length;
  const inboxCount = notesInFolder(notes, INBOX_FOLDER).length;
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsedIds);
  const dragging = draggingNote || draggingFolderId != null;

  function setCollapsedIds(next: Set<string>) {
    setCollapsed(next);
    writeCollapsedIds(next);
  }

  function handleToggleCollapsed(id: string, nextCollapsed: boolean) {
    const next = new Set(collapsed);
    if (nextCollapsed) next.add(id);
    else next.delete(id);
    setCollapsedIds(next);
  }

  useEffect(() => {
    if (typeof selected !== "string" || selected === INBOX_FOLDER) return;
    const ancestors = folderAncestorIds(folders, selected);
    if (ancestors.length === 0) return;
    setCollapsed((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of ancestors) {
        if (next.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      if (!changed) return prev;
      writeCollapsedIds(next);
      return next;
    });
  }, [selected, folders]);

  return (
    <nav
      aria-label="Pastas"
      className="space-y-2"
      title="Arraste uma nota ou uma pasta"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-medium text-muted-foreground">Pastas</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Nova pasta"
          onClick={() => onCreate(null)}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {dragging && (
        <p className="px-1 text-[11px] text-muted-foreground">
          {draggingFolderId
            ? "Solte em outra pasta para aninhar."
            : "Solte na pasta de destino."}
        </p>
      )}
      <ul className="space-y-0.5">
        <li>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/60",
              selected == null && "bg-primary/10 font-medium text-primary"
            )}
            onClick={() => onSelect(null)}
            aria-current={selected == null ? "page" : undefined}
          >
            <Library
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="min-w-0 truncate">Todas</span>
            <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/80">
              {allCount}
            </span>
          </button>
        </li>
        <li>
          <div
            className={cn(
              "rounded-lg",
              draggingNote &&
                dropTarget === INBOX_FOLDER &&
                "bg-primary/15 ring-1 ring-primary/40"
            )}
            onDragOver={(event) => {
              if (draggingFolderId) return;
              acceptDrop(event, null, onDragOverTarget);
            }}
            onDrop={(event) => {
              event.preventDefault();
              onDropNote?.(null);
            }}
            {...dropZoneAttrs(NOTE_FOLDER_DROP_KIND, INBOX_FOLDER)}
          >
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                selected === INBOX_FOLDER && "bg-primary/10 font-medium text-primary"
              )}
              onClick={() => onSelect(INBOX_FOLDER)}
              aria-current={selected === INBOX_FOLDER ? "page" : undefined}
            >
              <Inbox
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 truncate">Sem pasta</span>
              <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground/80">
                {inboxCount}
              </span>
            </button>
          </div>
        </li>
      </ul>
      {tree.length > 0 && (
        <ul className="space-y-0.5 border-t border-border/60 pt-2">
          {tree.map((node) => (
            <FolderRow
              key={node.id}
              node={node}
              depth={1}
              folders={folders}
              notes={notes}
              projects={projects}
              tags={tags}
              selected={selected}
              dropTarget={dropTarget}
              draggingNote={draggingNote}
              draggingFolderId={draggingFolderId}
              collapsed={collapsed}
              onToggleCollapsed={handleToggleCollapsed}
              onSelect={onSelect}
              onCreateChild={onCreate}
              onEdit={onEdit}
              onDelete={onDelete}
              onDragOverTarget={onDragOverTarget}
              onDropNote={onDropNote}
              onDragFolderStart={onDragFolderStart}
              onDragFolderEnd={onDragFolderEnd}
              onDropFolder={onDropFolder}
            />
          ))}
        </ul>
      )}
    </nav>
  );
}
