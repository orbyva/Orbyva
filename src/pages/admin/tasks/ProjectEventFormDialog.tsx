import { useEffect, useId, useState } from "react";
import { Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormLabel,
  FORM_DIALOG_CONTENT_CLASS,
  FORM_FIELDS_CLASS,
} from "@/components/FormLabel";
import { ProjectPicker } from "./ProjectPicker";
import {
  buildProjectEventPayload,
  emptyProjectEventDraft,
  isProjectEventDraftValid,
  validateProjectEventDraft,
  type ProjectEventDraft,
  type ProjectEventFieldError,
} from "@/domain/tasks";
import type { Project, ProjectEventCreateRequest } from "@/types/tasks";
import { cn } from "@/lib/utils";

/**
 * Criar e editar um evento da agenda (feature 103) — um formulário só para os dois modos, como a
 * 042 fez para tarefa.
 *
 * Antes desta feature `project_event` só nascia **dentro do dialog de projeto**: para marcar uma
 * reunião de quinta o usuário tinha de sair da Agenda, abrir o projeto e editá-lo. E não havia
 * update nenhum — horário errado só se consertava apagando e recriando.
 *
 * A regra (payload em hora local, validação por campo) mora em `@/domain/tasks/projectEvent` de
 * propósito: o gesto de arrastar da 104 vai montar o mesmo rascunho por outro caminho.
 */

export interface ProjectEventFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Rascunho inicial. Em edição vem de `projectEventToDraft`; na criação, a data do dia clicado
   * (e, na 104, também a faixa de horário arrastada). Só é lido quando o dialog **abre** — mexer
   * nele com o dialog aberto não sobrescreve o que a pessoa já digitou.
   */
  initial?: Partial<ProjectEventDraft>;
  /** Já ordenado por atividade quando o call site tiver essa ordem — ver `rankProjectsByActivity`. */
  projects: Project[];
  mode?: "create" | "edit";
  /**
   * Cópia recebida por convite (feature 076: `project_id` nulo na agenda de quem aceitou). A linha
   * é do próprio usuário (RLS por `user_id`), então **é** editável — bloquear esconderia que a
   * cópia é dele. O que não pode é editar em silêncio e deixar parecer que o anfitrião foi avisado,
   * daí o aviso. Quem decide isso é o call site: só ele sabe de onde o evento veio.
   */
  receivedByInvite?: boolean;
  onSubmit: (payload: ProjectEventCreateRequest) => Promise<void> | void;
}

export function ProjectEventFormDialog({
  open,
  onOpenChange,
  initial,
  projects,
  mode = "create",
  receivedByInvite = false,
  onSubmit,
}: ProjectEventFormDialogProps) {
  const fieldId = useId();
  const [draft, setDraft] = useState<ProjectEventDraft>(() => emptyProjectEventDraft(initial));
  /** Campo já mexido pelo usuário — o erro só aparece depois disso. Cobrar "informe um título"
   * num formulário recém-aberto e ainda vazio é ruído, não ajuda. */
  const [touched, setTouched] = useState<Partial<Record<ProjectEventFieldError, boolean>>>({});
  /** Envio em voo: trava o botão e os campos. Enter duplo (ou clique duplo) não pode criar dois
   * eventos — mesmo cuidado do `TaskQuickAdd` (feature 098). */
  const [saving, setSaving] = useState(false);

  /** `initial` chega como objeto literal do call site; comparar por identidade reabriria o efeito a
   * cada render do pai e apagaria o que estava sendo digitado. */
  const initialKey = JSON.stringify(initial ?? {});
  useEffect(() => {
    if (!open) return;
    setDraft(emptyProjectEventDraft(initial));
    setTouched({});
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialKey]);

  const errors = validateProjectEventDraft(draft);
  const canSave = isProjectEventDraftValid(draft) && !saving;

  function update(patch: Partial<ProjectEventDraft>, field?: ProjectEventFieldError) {
    setDraft((prev) => ({ ...prev, ...patch }));
    if (field) setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function errorFor(field: ProjectEventFieldError): string | undefined {
    return touched[field] ? errors[field] : undefined;
  }

  async function handleSubmit() {
    if (!canSave) {
      // Guarda de teclado: o botão já está desabilitado, mas Enter no formulário chega aqui.
      setTouched({ title: true, date: true, startTime: true, endTime: true });
      return;
    }
    setSaving(true);
    try {
      await onSubmit(buildProjectEventPayload(draft));
    } finally {
      // Reabre os campos mesmo no erro: quem fecha o dialog no sucesso é o call site, e num erro
      // de rede o formulário tem de continuar editável com o que foi digitado.
      setSaving(false);
    }
  }

  function FieldError({ field }: { field: ProjectEventFieldError }) {
    const message = errorFor(field);
    if (!message) return null;
    return (
      <p id={`${fieldId}-${field}-erro`} className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={FORM_DIALOG_CONTENT_CLASS}>
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>

        {mode === "edit" && receivedByInvite && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Recebido por convite — a alteração vale só na sua agenda, não volta para quem convidou.
          </p>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {/* `fieldset disabled` trava tudo de uma vez — inclusive os botões do `ProjectPicker`,
              que não tem prop `disabled` própria. */}
          <fieldset disabled={saving} className={cn(FORM_FIELDS_CLASS, "min-w-0 border-0 p-0")}>
            <div className="space-y-1.5">
              <FormLabel required htmlFor={`${fieldId}-title`}>
                Título
              </FormLabel>
              <Input
                id={`${fieldId}-title`}
                value={draft.title}
                placeholder="Reunião, dentista, aniversário…"
                aria-invalid={errorFor("title") ? true : undefined}
                aria-describedby={errorFor("title") ? `${fieldId}-title-erro` : undefined}
                onChange={(e) => update({ title: e.target.value }, "title")}
                onBlur={() => setTouched((prev) => ({ ...prev, title: true }))}
              />
              <FieldError field="title" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <FormLabel required htmlFor={`${fieldId}-date`}>
                  Data
                </FormLabel>
                <Input
                  id={`${fieldId}-date`}
                  type="date"
                  value={draft.date}
                  aria-invalid={errorFor("date") ? true : undefined}
                  aria-describedby={errorFor("date") ? `${fieldId}-date-erro` : undefined}
                  onChange={(e) => update({ date: e.target.value }, "date")}
                  onBlur={() => setTouched((prev) => ({ ...prev, date: true }))}
                />
                <FieldError field="date" />
              </div>
              <div className="space-y-1.5">
                <FormLabel required htmlFor={`${fieldId}-start`}>
                  Início
                </FormLabel>
                <Input
                  id={`${fieldId}-start`}
                  type="time"
                  value={draft.startTime}
                  aria-invalid={errorFor("startTime") ? true : undefined}
                  aria-describedby={errorFor("startTime") ? `${fieldId}-startTime-erro` : undefined}
                  onChange={(e) => update({ startTime: e.target.value }, "startTime")}
                  onBlur={() => setTouched((prev) => ({ ...prev, startTime: true }))}
                />
                <FieldError field="startTime" />
              </div>
              <div className="space-y-1.5">
                <FormLabel optional htmlFor={`${fieldId}-end`}>
                  Fim
                </FormLabel>
                <Input
                  id={`${fieldId}-end`}
                  type="time"
                  value={draft.endTime}
                  aria-invalid={errorFor("endTime") ? true : undefined}
                  aria-describedby={errorFor("endTime") ? `${fieldId}-endTime-erro` : undefined}
                  onChange={(e) => update({ endTime: e.target.value }, "endTime")}
                  onBlur={() => setTouched((prev) => ({ ...prev, endTime: true }))}
                />
                <FieldError field="endTime" />
              </div>
            </div>
            {/* Sem hora de fim o bloco é desenhado com a duração padrão de 30 min
                (`DEFAULT_ITEM_DURATION_MINUTES`) — nada muda no layout da grade. */}
            {!draft.endTime && !errorFor("endTime") && (
              <p className="-mt-2 text-xs text-muted-foreground">
                Sem hora de fim, o evento ocupa 30 minutos na grade.
              </p>
            )}

            <div className="space-y-1.5">
              {/* Projeto é opcional de propósito: obrigar a escolher um para marcar "dentista às 15h"
                  é o atrito que manteve a criação de evento fora da Agenda até aqui. Sem projeto, o
                  chip cai na cor neutra (`eventProjectColor`). */}
              <FormLabel optional>Projeto</FormLabel>
              <ProjectPicker
                projects={projects}
                value={draft.projectId}
                onChange={(projectId) => update({ projectId })}
              />
            </div>

            <Button type="submit" className="w-full" disabled={!canSave}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
