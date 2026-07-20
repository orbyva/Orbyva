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
      {required && <span className="text-destructive"> *</span>}
      {optional && (
        <span className="ml-1 text-xs font-normal text-muted-foreground">
          (opcional)
        </span>
      )}
    </Label>
  );
}

export const FORM_DIALOG_CONTENT_CLASS =
  "max-w-md sm:max-w-lg w-full p-4 sm:p-6";

export const FORM_FIELDS_CLASS = "grid grid-cols-1 gap-4";

export const PAGE_HEADER_ACTIONS_CLASS =
  "flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap";

/** Icon-only edit action — muted in light/dark; pair with text-destructive on delete. */
export const ICON_EDIT_BUTTON_CLASS =
  "text-muted-foreground hover:text-foreground";
