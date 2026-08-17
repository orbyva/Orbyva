import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormLabel, FORM_DIALOG_CONTENT_CLASS, FORM_FIELDS_CLASS } from "@/components/FormLabel";
import { LabelColorPicker } from "./LabelColorPicker";
import { TagCombobox } from "./TagCombobox";
import { formatDateTimeBR } from "@/lib/currency";
import type { Project, ProjectCreateRequest, ProjectEvent, ProjectStatus, Tag } from "@/types/tasks";

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  planned: "Planejado",
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

export function formatEventDate(iso: string): string {
  const time = new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return formatDateTimeBR(iso, time);
}

/**
 * Dialog de criar/editar projeto, compartilhado por `Projects.tsx` (lista) e `ProjectDetail.tsx`
 * (feature 050) — antes vivia inline só em `Projects.tsx`. `editing: null` = modo criação (sem
 * seção de Eventos, que só faz sentido para um projeto que já existe).
 */
export function ProjectFormDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  tags,
  onCreateTag,
  events,
  onSave,
  onAddEvent,
  onDeleteEvent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Project | null;
  form: ProjectCreateRequest;
  setForm: (form: ProjectCreateRequest) => void;
  tags: Tag[];
  onCreateTag: (name: string, color: string) => Promise<Tag>;
  events: ProjectEvent[];
  onSave: () => Promise<void> | void;
  onAddEvent: (payload: { title: string; startsAt: string }) => Promise<void> | void;
  onDeleteEvent: (id: string) => Promise<void> | void;
}) {
  const [eventTitle, setEventTitle] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSaveClick() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave();
    } catch {
      // Erro já tratado (toast) por quem chama via `onSave` — só evita rejeição não tratada.
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEventClick() {
    if (!eventTitle.trim() || !eventStartsAt) return;
    await onAddEvent({ title: eventTitle.trim(), startsAt: eventStartsAt });
    setEventTitle("");
    setEventStartsAt("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setEventTitle("");
          setEventStartsAt("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required htmlFor="project-name">
              Nome
            </FormLabel>
            <Input
              id="project-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <FormLabel optional htmlFor="project-description">
              Descrição
            </FormLabel>
            <Input
              id="project-description"
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <FormLabel required htmlFor="project-status">
              Status
            </FormLabel>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as ProjectStatus })}
            >
              <SelectTrigger id="project-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FormLabel optional>Cor</FormLabel>
            <div className="mt-1.5">
              <LabelColorPicker
                color={form.color ?? "#94a3b8"}
                onChange={(color) => setForm({ ...form, color })}
              />
            </div>
          </div>
          <div>
            <FormLabel optional>Labels</FormLabel>
            <TagCombobox
              allTags={tags}
              selectedIds={form.tag_ids}
              onChange={(tag_ids) => setForm({ ...form, tag_ids })}
              onCreateTag={onCreateTag}
            />
          </div>
          <div>
            <FormLabel optional htmlFor="project-notes">
              Notas
            </FormLabel>
            <textarea
              id="project-notes"
              className="flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Contexto, decisões, links úteis…"
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {editing && (
            <div>
              <FormLabel optional>Eventos (reuniões, horários de trabalho)</FormLabel>
              <div className="mt-1.5 space-y-1.5">
                {events.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 text-xs"
                  >
                    <span className="min-w-0 truncate">
                      {e.title} — {formatEventDate(e.starts_at)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-destructive"
                      onClick={() => onDeleteEvent(e.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Título"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="datetime-local"
                    value={eventStartsAt}
                    onChange={(e) => setEventStartsAt(e.target.value)}
                    className="h-8 w-48 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={handleAddEventClick}
                    aria-label="Adicionar evento"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <Button onClick={handleSaveClick} disabled={!form.name.trim() || saving} className="w-full">
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar projeto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
