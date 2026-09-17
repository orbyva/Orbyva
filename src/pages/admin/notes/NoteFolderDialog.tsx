import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/pages/admin/tasks/ProjectPicker";
import { TagCombobox } from "@/pages/admin/tasks/TagCombobox";
import {
  canMoveFolder,
  canNestUnder,
  flattenFolderTree,
  wouldCreateCycle,
} from "@/domain/notes/folders";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import {
  createNoteFolder,
  updateNoteFolder,
} from "@/api/notes/folders";
import type { NoteFolder, NoteFolderDraft } from "@/types/notes";
import type { Project, Tag } from "@/types/tasks";

const ROOT_VALUE = "__root__";

interface NoteFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: NoteFolder | null;
  folders: NoteFolder[];
  projects: Project[];
  tags: Tag[];
  /** Pai sugerido ao criar (a árvore está com essa pasta aberta / "nova subpasta"). */
  defaultParentId?: string | null;
  onCreateTag: (name: string, color: string) => Promise<Tag>;
  onSaved: () => void;
}

const emptyDraft = (): NoteFolderDraft => ({
  name: "",
  parent_id: null,
  project_id: null,
  tag_id: null,
});

export function NoteFolderDialog({
  open,
  onOpenChange,
  folder,
  folders,
  projects,
  tags,
  defaultParentId = null,
  onCreateTag,
  onSaved,
}: NoteFolderDialogProps) {
  const [form, setForm] = useState<NoteFolderDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setForm(
      folder
        ? {
            name: folder.name,
            parent_id: folder.parent_id,
            project_id: folder.project_id,
            tag_id: folder.tag_id,
          }
        : { ...emptyDraft(), parent_id: defaultParentId }
    );
  }, [open, folder, defaultParentId]);

  const parentOptions = useMemo(() => {
    return flattenFolderTree(folders).filter(({ folder: candidate }) => {
      if (folder) {
        if (candidate.id === folder.id) return false;
        return canMoveFolder(folders, folder.id, candidate.id);
      }
      return canNestUnder(folders, candidate.id);
    });
  }, [folders, folder]);

  const rootAllowed = folder
    ? canMoveFolder(folders, folder.id, null)
    : canNestUnder(folders, null);

  async function handleSave() {
    if (!form.name.trim()) return;
    if (folder && form.parent_id && wouldCreateCycle(folders, folder.id, form.parent_id)) {
      return;
    }
    setSaving(true);
    try {
      if (folder) await updateNoteFolder({ id: folder.id, ...form });
      else await createNoteFolder(form);
      toast({ title: "Pasta salva", duration: 2000 });
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: getErrorMessage(error, "Não foi possível salvar a pasta."),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>{folder ? "Editar pasta" : "Nova pasta"}</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel htmlFor="note-folder-name" required>
              Nome
            </FormLabel>
            <Input
              id="note-folder-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Obra da casa, Saúde, Ideias…"
            />
          </div>
          <div>
            <FormLabel htmlFor="note-folder-parent" optional>
              Pasta pai
            </FormLabel>
            <Select
              value={form.parent_id ?? ROOT_VALUE}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  parent_id: value === ROOT_VALUE ? null : value,
                })
              }
            >
              <SelectTrigger id="note-folder-parent">
                <SelectValue placeholder="Raiz" />
              </SelectTrigger>
              <SelectContent>
                {rootAllowed && <SelectItem value={ROOT_VALUE}>Raiz</SelectItem>}
                {parentOptions.map(({ folder: option, depth }) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span style={{ paddingLeft: `${(depth - 1) * 12}px` }}>
                      {option.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FormLabel optional>Projeto</FormLabel>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Atributo da pasta, não da nota. Mover uma nota para cá não muda o projeto dela.
            </p>
            <ProjectPicker
              projects={projects}
              value={form.project_id}
              onChange={(projectId) => setForm({ ...form, project_id: projectId })}
            />
          </div>
          <div>
            <FormLabel optional>Etiqueta</FormLabel>
            <p className="mb-1.5 text-xs text-muted-foreground">
              Uma etiqueta do catálogo, ou crie uma agora com o nome da pasta.
            </p>
            <TagCombobox
              allTags={tags}
              selectedIds={form.tag_id ? [form.tag_id] : []}
              onChange={(ids) =>
                setForm({ ...form, tag_id: ids[ids.length - 1] ?? null })
              }
              onCreateTag={onCreateTag}
            />
          </div>
          <Button
            onClick={() => void handleSave()}
            className="w-full"
            disabled={saving || !form.name.trim()}
          >
            {folder ? "Salvar alterações" : "Criar pasta"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
