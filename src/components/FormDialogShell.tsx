import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const FORM_DIALOG_SHELL_CLASS =
  "flex w-full max-w-lg flex-col gap-0 overflow-hidden p-0 max-h-[min(92dvh,92vh)] sm:max-w-2xl";

export const FORM_DIALOG_SHELL_CLASS_WIDE =
  "flex w-full max-w-xl flex-col gap-0 overflow-hidden p-0 max-h-[min(92dvh,92vh)] sm:max-w-3xl";

interface FormDialogShellProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  errorSummary?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  wide?: boolean;
}

/** Dialog de form com header, body scrollável e footer sticky (mobile-friendly). */
export function FormDialogShell({
  title,
  description,
  errorSummary,
  children,
  footer,
  className,
  wide,
}: FormDialogShellProps) {
  return (
    <DialogContent
      className={cn(
        wide ? FORM_DIALOG_SHELL_CLASS_WIDE : FORM_DIALOG_SHELL_CLASS,
        className
      )}
    >
      <DialogHeader className="shrink-0 space-y-1.5 px-4 pb-3 pt-4 text-left sm:px-6 sm:pt-6">
        <DialogTitle className="pr-8 text-base leading-snug sm:text-lg">
          {title}
        </DialogTitle>
        {description ? (
          <DialogDescription className="text-sm leading-relaxed">
            {description}
          </DialogDescription>
        ) : null}
      </DialogHeader>

      <div className="min-h-0 flex-1 touch-pan-y space-y-5 overflow-y-auto overscroll-contain px-4 py-1 sm:px-6">
        {errorSummary ? (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {errorSummary}
          </div>
        ) : null}
        {children}
      </div>

      {footer ? (
        <div className="shrink-0 border-t bg-muted/40 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-3">
          {footer}
        </div>
      ) : null}
    </DialogContent>
  );
}

interface FormFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  submitDisabled?: boolean;
  className?: string;
}

export function FormFooter({
  onCancel,
  onSubmit,
  submitLabel,
  cancelLabel = "Cancelar",
  loading = false,
  submitDisabled = false,
  className,
}: FormFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end",
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={loading}
        className="h-11 w-full sm:h-10 sm:w-auto"
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        onClick={onSubmit}
        disabled={loading || submitDisabled}
        className="h-11 w-full sm:h-10 sm:w-auto"
      >
        {loading ? "Salvando…" : submitLabel}
      </Button>
    </div>
  );
}
