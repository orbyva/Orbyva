import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
  FORM_SEGMENT_TRIGGER_CLASS,
} from "@/components/FormLabel";
import { ProjectPicker } from "./ProjectPicker";
import { TaskPicker } from "./TaskPicker";
import {
  EVENT_WITHOUT_PROJECT_LABEL,
  eventLinkKind,
  validateEventDraft,
  type EventLinkKind,
} from "@/domain/tasks";
import { localDateTimeInputToIso, toLocalDateTimeInputValue } from "@/lib/dates";
import type { Project, ProjectEvent, ProjectEventCreateRequest, Task } from "@/types/tasks";

/** Vínculo travado por quem abre o dialog (feature 068: dentro do projeto o evento já nasce dele). */
export type EventFormLockedLink = { kind: "project"; id: string } | { kind: "task"; id: string };

export const EVENT_ENDS_BEFORE_STARTS_MESSAGE =
  "O fim precisa ser depois do início.";

/**
 * Dialog de criar/editar evento de agenda (feature 067) — mesmo padrão do `ProjectFormDialog`
 * (feature 065): `editing: null` é criação, `saving` é estado interno e erro em `onSave` **não**
 * fecha o dialog (quem chama mostra o toast e deixa o usuário corrigir sem perder o que digitou).
 *
 * Nasce genérico de propósito: a 068 reusa o mesmo componente dentro do dialog de projeto, com o
 * vínculo travado por `lockedLink`.
 */
export function EventFormDialog({
  open,
  onOpenChange,
  editing,
  projects,
  tasks,
  lockedLink,
  prefillStartsAt,
  extraActions,
  onOpenTask,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação. */
  editing: ProjectEvent | null;
  projects: Project[];
  tasks: Task[];
  /** Quando presente, o evento fica preso a esse vínculo e o seletor some. */
  lockedLink?: EventFormLockedLink;
  /** ISO de início sugerido na criação (clique num dia/slot da agenda). */
  prefillStartsAt?: string | null;
  /** Ações extras na barra de baixo em modo edição (ex.: "Ir para o projeto"). */
  extraActions?: ReactNode;
  /**
   * Abre a tarefa vinculada sem sair da tela (feature 068) — na Agenda é o form da própria tarefa
   * que abre, porque navegar para outra tela quebraria o contexto do calendário. Sem a prop (ou com
   * a tarefa fora da lista carregada), o botão vira um link para `/tasks`.
   */
  onOpenTask?: (taskId: string) => void;
  onSave: (draft: ProjectEventCreateRequest) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [linkKind, setLinkKind] = useState<EventLinkKind>("none");
  const [saving, setSaving] = useState(false);

  // Reabrir o dialog é o que reinicia o formulário: cada abertura parte ou do evento em edição, ou
  // do prefill de criação (dia/hora clicados na agenda). Sem isso, o dialog reabriria com o que
  // sobrou da última vez.
  useEffect(() => {
    if (!open) return;
    setSaving(false);
    setTitle(editing?.title ?? "");
    setStartsAt(toLocalDateTimeInputValue(editing?.starts_at ?? prefillStartsAt ?? ""));
    setEndsAt(toLocalDateTimeInputValue(editing?.ends_at ?? ""));
    if (lockedLink) {
      setProjectId(lockedLink.kind === "project" ? lockedLink.id : null);
      setTaskId(lockedLink.kind === "task" ? lockedLink.id : null);
      setLinkKind(lockedLink.kind);
    } else {
      setProjectId(editing?.project_id ?? null);
      setTaskId(editing?.task_id ?? null);
      setLinkKind(editing ? eventLinkKind(editing) : "none");
    }
    // `lockedLink` é objeto literal de quem renderiza: entra pelas partes pra não reiniciar o form a
    // cada render do pai.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, prefillStartsAt, lockedLink?.kind, lockedLink?.id]);

  const startsIso = localDateTimeInputToIso(startsAt);
  const endsIso = localDateTimeInputToIso(endsAt);
  const validation = validateEventDraft({
    title,
    startsAt: startsIso,
    endsAt: endsIso || null,
  });
  const endsInvalid = !validation.ok && validation.reason === "ends";

  // Tarefa do evento em edição. A cascade da 066 garante que evento de tarefa apagada não existe;
  // `null` aqui é só o caso transitório de a tarefa não estar na lista carregada (ex.: filtro).
  const linkedTask = editing?.task_id ? (tasks.find((t) => t.id === editing.task_id) ?? null) : null;

  /**
   * Trocar de segmento zera o id do outro lado — é isso que mantém a check
   * `project_event_single_link` (no máximo um vínculo) sempre satisfeita, sem depender de o banco
   * recusar depois.
   */
  function handleLinkKindChange(next: EventLinkKind) {
    setLinkKind(next);
    if (next !== "project") setProjectId(null);
    if (next !== "task") setTaskId(null);
  }

  async function handleSaveClick() {
    if (!validation.ok) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        starts_at: startsIso,
        ends_at: endsIso || null,
        project_id: projectId,
        task_id: taskId,
      });
      onOpenChange(false);
    } catch {
      // Toast é de quem chama (`onSave`); aqui o que importa é o dialog continuar aberto com os
      // dados digitados e o botão de salvar utilizável de novo.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>
        <div className={FORM_FIELDS_CLASS}>
          <div>
            <FormLabel required htmlFor="event-title">
              Título
            </FormLabel>
            <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FormLabel required htmlFor="event-starts-at">
                Início
              </FormLabel>
              <Input
                id="event-starts-at"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <FormLabel optional htmlFor="event-ends-at">
                Fim
              </FormLabel>
              <Input
                id="event-ends-at"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
              {endsInvalid && (
                <p className="mt-1 text-xs text-destructive">{EVENT_ENDS_BEFORE_STARTS_MESSAGE}</p>
              )}
            </div>
          </div>

          {!lockedLink && (
            <div>
              <FormLabel optional>Vínculo</FormLabel>
              <div className="mt-1.5 space-y-2">
                <Tabs value={linkKind} onValueChange={(v) => handleLinkKindChange(v as EventLinkKind)}>
                  <TabsList className="grid h-10 w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                    <TabsTrigger className={FORM_SEGMENT_TRIGGER_CLASS} value="none">
                      Sem vínculo
                    </TabsTrigger>
                    <TabsTrigger className={FORM_SEGMENT_TRIGGER_CLASS} value="project">
                      Projeto
                    </TabsTrigger>
                    <TabsTrigger className={FORM_SEGMENT_TRIGGER_CLASS} value="task">
                      Tarefa
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {linkKind === "project" && (
                  <ProjectPicker projects={projects} value={projectId} onChange={setProjectId} />
                )}
                {linkKind === "task" && (
                  <TaskPicker
                    tasks={tasks}
                    projects={projects}
                    value={taskId}
                    onChange={setTaskId}
                  />
                )}
              </div>
            </div>
          )}

          {/* Feature 076: cópia recebida por convite (`project_id` nulo, sem tarefa) — o rótulo
              neutro no lugar do badge de projeto. Continua editável; só sinaliza a origem. */}
          {editing && !editing.project_id && !editing.task_id && (
            <p className="text-xs text-muted-foreground">{EVENT_WITHOUT_PROJECT_LABEL}</p>
          )}

          {editing?.task_id && (
            <p className="text-xs text-muted-foreground">
              Tarefa vinculada:{" "}
              <span className="font-medium text-foreground">
                {linkedTask?.title ?? "tarefa fora da lista carregada"}
              </span>
            </p>
          )}

          <Button onClick={handleSaveClick} disabled={!validation.ok || saving} className="w-full">
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar evento"}
          </Button>

          {(onDelete || extraActions || editing?.task_id) && (
            <div className="flex flex-wrap gap-2">
              {extraActions}
              {editing?.task_id &&
                (linkedTask && onOpenTask ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => onOpenTask(linkedTask.id)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ir para a tarefa
                  </Button>
                ) : (
                  // Sem `onOpenTask` (ou sem a tarefa carregada) o botão viraria um alvo morto:
                  // cai para a lista de tarefas, que é onde ela pode ser encontrada.
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <Link to="/tasks">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Ir para a tarefa
                    </Link>
                  </Button>
                ))}
              {onDelete && (
                <ConfirmDeleteDialog title="Excluir este evento?" onConfirm={() => onDelete()}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </Button>
                </ConfirmDeleteDialog>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
