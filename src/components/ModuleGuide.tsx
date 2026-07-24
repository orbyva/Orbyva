import { useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { isModuleGuideSeen, markModuleGuideSeen } from "@/lib/onboarding";
import { getModuleGuide, type ModuleGuideId } from "@/lib/moduleGuides";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

function useModuleGuideDialog(moduleId: ModuleGuideId) {
  const { user } = useAuth();
  const guide = getModuleGuide(moduleId);
  const [dialogOpen, setDialogOpen] = useState(false);

  function persistSeen() {
    if (user?.id) markModuleGuideSeen(user.id, moduleId);
  }

  function openDialog(source: "callout" | "button") {
    track("module_guide_open", { module: moduleId, source });
    setDialogOpen(true);
  }

  function closeDialog(outcome: "complete" | "close") {
    setDialogOpen(false);
    const wasNew = Boolean(user?.id && !isModuleGuideSeen(user.id, moduleId));
    persistSeen();
    if (outcome === "complete" && wasNew) {
      track("module_guide_complete", { module: moduleId });
    }
  }

  return { user, guide, dialogOpen, setDialogOpen, openDialog, closeDialog, persistSeen };
}

function ModuleGuideDialog({
  moduleId,
  open,
  onOpenChange,
  onComplete,
}: {
  moduleId: ModuleGuideId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}) {
  const guide = getModuleGuide(moduleId);
  const Icon = guide.icon;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            {guide.title}
          </DialogTitle>
          <DialogDescription>{guide.hook}</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          {guide.steps.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <DialogFooter>
          <Button onClick={onComplete}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ModuleGuideProps {
  moduleId: ModuleGuideId;
  className?: string;
}

/**
 * Callout dispensável só na 1ª visita ao módulo (não é modal forçado).
 * Depois de visto/dispensado some — use `ModuleGuideButton` para reabrir.
 */
export function ModuleGuide({ moduleId, className }: ModuleGuideProps) {
  const { user, guide, dialogOpen, openDialog, closeDialog, persistSeen } =
    useModuleGuideDialog(moduleId);
  const [visible, setVisible] = useState(false);
  const shownTracked = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    if (isModuleGuideSeen(userId, moduleId)) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (!shownTracked.current) {
      shownTracked.current = true;
      track("module_guide_shown", { module: moduleId });
    }

    function onSeen(event: Event) {
      const detail = (event as CustomEvent<{ userId: string; moduleId: string }>)
        .detail;
      if (detail?.userId === userId && detail.moduleId === moduleId) {
        setVisible(false);
      }
    }
    window.addEventListener("orbyva:module-guide-seen", onSeen);
    return () => window.removeEventListener("orbyva:module-guide-seen", onSeen);
  }, [user?.id, moduleId]);

  function dismiss() {
    track("module_guide_dismiss", { module: moduleId });
    persistSeen();
    setVisible(false);
  }

  function finish(outcome: "complete" | "close") {
    closeDialog(outcome);
    setVisible(false);
  }

  if (!visible) return null;

  const Icon = guide.icon;

  return (
    <>
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4",
          className
        )}
      >
        <div className="mt-0.5 shrink-0 rounded-full bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Novo por aqui?</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{guide.hook}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => openDialog("callout")}>
              Ver como funciona
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Agora não
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ModuleGuideDialog
        moduleId={moduleId}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) finish("close");
        }}
        onComplete={() => finish("complete")}
      />
    </>
  );
}

/** Botão permanente para reabrir o guia a qualquer momento. */
export function ModuleGuideButton({ moduleId }: { moduleId: ModuleGuideId }) {
  const { dialogOpen, openDialog, closeDialog } = useModuleGuideDialog(moduleId);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => openDialog("button")}
      >
        <CircleHelp className="h-4 w-4" />
        Como funciona?
      </Button>
      <ModuleGuideDialog
        moduleId={moduleId}
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog("close");
        }}
        onComplete={() => closeDialog("complete")}
      />
    </>
  );
}
