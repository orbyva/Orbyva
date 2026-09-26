import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
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
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  ICON_EDIT_BUTTON_CLASS,
} from "@/components/FormLabel";
import { LabelColorPicker } from "./LabelColorPicker";
import { TagCombobox } from "./TagCombobox";
import { EventFormDialog } from "./EventFormDialog";
import { EventInviteDialog } from "./EventInviteDialog";
import { eventLinkKind } from "@/domain/tasks";
import { formatDateTimeBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type {
  Project,
  ProjectCreateRequest,
  ProjectEvent,
  ProjectEventCreateRequest,
  ProjectStatus,
  Tag,
  Task,
} from "@/types/tasks";

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
 * Rascunho devolvido pela seção de Eventos (feature 068). `id` presente = edição de um evento que
 * já existe; ausente = criação. Um handler só (`onSaveEvent`) para os dois casos, em vez de
 * multiplicar props no call site.
 */
export interface ProjectEventSaveDraft {
  id?: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
}

/**
 * Dialog de criar/editar projeto, compartilhado por `Projects.tsx` (lista) e `ProjectDetail.tsx`
 * (feature 050) — antes vivia inline só em `Projects.tsx`. `editing: null` = modo criação (sem
 * seção de Eventos, que só faz sentido para um projeto que já existe).
 *
 * A seção de Eventos usa o mesmo `EventFormDialog` da Agenda (feature 068): antes havia um
 * mini-form inline aqui (título + início, sem fim e sem edição) e um dialog completo lá, duas UIs
 * para a mesma entidade.
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
  tasks,
  onSave,
  onSaveEvent,
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
  /** Tarefas do projeto — só para dar nome ao evento herdado de tarefa (feature 068). */
  tasks: Task[];
  onSave: () => Promise<void> | void;
  onSaveEvent: (draft: ProjectEventSaveDraft) => Promise<void> | void;
  onDeleteEvent: (id: string) => Promise<void> | void;
}) {
  const [eventDialog, setEventDialog] = useState<{ open: boolean; editing: ProjectEvent | null }>({
    open: false,
    editing: null,
  });
  /** Evento cujo dialog de convite (feature 076) está aberto. */
  const [invitingEvent, setInvitingEvent] = useState<ProjectEvent | null>(null);
  const [saving, setSaving] = useState(false);

  const taskTitleById = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);

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

  /**
   * Repassa o rascunho do `EventFormDialog` para quem chama, com o `id` do evento em edição quando
   * houver. Só fecha o dialog de evento se `onSaveEvent` resolver — o erro sobe para o
   * `EventFormDialog`, que é quem decide continuar aberto com o que foi digitado.
   */
  async function handleSaveEventDraft(draft: ProjectEventCreateRequest) {
    await onSaveEvent({
      id: eventDialog.editing?.id,
      title: draft.title,
      starts_at: draft.starts_at,
      ends_at: draft.ends_at ?? null,
    });
    setEventDialog({ open: false, editing: null });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setEventDialog({ open: false, editing: null });
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
          {/* Sem campo de Notas: as notas de projeto viraram o módulo de Notas na
              feature 055 e `ProjectCreateRequest` não carrega mais `notes`. */}

          {editing && (
            <div>
              <FormLabel optional>Eventos (reuniões, horários de trabalho)</FormLabel>
              <div className="mt-1.5 space-y-1.5">
                {events.map((e) => {
                  // Evento herdado: o vínculo real é uma tarefa do projeto, não o projeto (feature
                  // 068). Aparece aqui para o projeto não mentir por omissão, mas em leitura: mudar
                  // o projeto de um evento de tarefa é justamente o que a 066 decidiu não permitir,
                  // e editar por aqui daria a impressão contrária. Quem edita é a Agenda.
                  const inherited = eventLinkKind(e) === "task";
                  const taskTitle = e.task_id ? taskTitleById.get(e.task_id) : undefined;
                  return (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-card p-2 text-xs"
                    >
                      <span className="min-w-0 truncate">
                        {e.title} — {formatEventDate(e.starts_at)}
                        {inherited && (
                          <span className="ml-1 text-muted-foreground">
                            (via {taskTitle ?? "tarefa do projeto"})
                          </span>
                        )}
                      </span>
                      {!inherited && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-6 w-6", ICON_EDIT_BUTTON_CLASS)}
                            onClick={() => setEventDialog({ open: true, editing: e })}
                            aria-label={`Editar evento ${e.title}`}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {/* Feature 076: convidar alguém para este evento. */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            type="button"
                            aria-label={`Convidar para ${e.title}`}
                            onClick={() => setInvitingEvent(e)}
                          >
                            <UserPlus className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => onDeleteEvent(e.id)}
                            aria-label={`Excluir evento ${e.title}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setEventDialog({ open: true, editing: null })}
                  aria-label="Adicionar evento"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <Button onClick={handleSaveClick} disabled={!form.name.trim() || saving} className="w-full">
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar projeto"}
          </Button>
        </div>
      </DialogContent>
      {editing && (
        <EventFormDialog
          open={eventDialog.open}
          onOpenChange={(next) => (next ? undefined : setEventDialog({ open: false, editing: null }))}
          editing={eventDialog.editing}
          // Vínculo travado no projeto em edição: aqui o seletor de vínculo (e com ele
          // `projects`/`ProjectPicker`) some, então não há lista de projetos para passar.
          lockedLink={{ kind: "project", id: editing.id }}
          projects={[]}
          tasks={tasks}
          onSave={handleSaveEventDraft}
        />
      )}
      {invitingEvent && (
        <EventInviteDialog
          eventId={invitingEvent.id}
          eventTitle={invitingEvent.title}
          open
          onOpenChange={(aberto) => {
            if (!aberto) setInvitingEvent(null);
          }}
        />
      )}
    </Dialog>
  );
}
