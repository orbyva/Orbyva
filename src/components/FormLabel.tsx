import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormLabelProps {
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  htmlFor?: string;
  className?: string;
}

export function FormLabel({
  children,
  required,
  optional,
  htmlFor,
  className,
}: FormLabelProps) {
  return (
    <Label htmlFor={htmlFor} className={cn(className)}>
      {children}
      {required ? <span className="text-destructive"> *</span> : null}
      {optional ? (
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          (opcional)
        </span>
      ) : null}
    </Label>
  );
}

/** Legacy full-scroll dialog body. Prefer FormDialogShell. */
export const FORM_DIALOG_CONTENT_CLASS =
  "max-w-lg sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6";

/** Legacy wide full-scroll dialog body. Prefer FormDialogShell wide. */
export const FORM_DIALOG_CONTENT_CLASS_WIDE =
  "max-w-xl sm:max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6";

/** Variante mais larga só pro dialog de criar/editar tarefa (`TaskList.tsx`) — formulário em
 * abas com mais campos que os outros 5 dialogs que usam `FORM_DIALOG_CONTENT_CLASS`. */
export const FORM_DIALOG_CONTENT_CLASS_LG =
  "max-w-md sm:max-w-2xl lg:max-w-3xl w-full p-4 sm:p-6";

export const FORM_FIELDS_CLASS = "grid grid-cols-1 gap-4";

export const FORM_MOBILE_TABS_CLASS =
  "grid w-full grid-cols-2";

/** Toggle de 2 abas em dialogs (ex.: Lugar | Visitas). */
export const FORM_SEGMENT_TABS_CLASS =
  "grid h-10 w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1";

export const FORM_SEGMENT_TRIGGER_CLASS =
  "rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

export const PAGE_HEADER_ACTIONS_CLASS =
  "flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap";

/** Icon-only edit action, muted in light/dark; pair with text-destructive on delete. */
export const ICON_EDIT_BUTTON_CLASS =
  "text-muted-foreground hover:text-foreground";
