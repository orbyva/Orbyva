import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({
  title,
  subtitle,
  children,
  className,
}: FormSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="space-y-0.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {subtitle ? (
          <p className="text-xs text-muted-foreground/80">{subtitle}</p>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

interface FormDisclosureProps {
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /**
   * `expand`: setinha (só mostra/esconde campos).
   * `toggle`: liga/desliga uma opção real do usuário.
   */
  variant?: "expand" | "toggle";
}

/** Bloco colapsável: expand (setinha) ou toggle (habilitar opção). */
export function FormDisclosure({
  title,
  description,
  open,
  onOpenChange,
  children,
  variant = "expand",
}: FormDisclosureProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{title}</p>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {variant === "toggle" ? (
          <span
            className={cn(
              "mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
              open ? "border-primary bg-primary" : "border-input bg-muted"
            )}
            aria-hidden
          >
            <span
              className={cn(
                "h-4 w-4 rounded-full bg-background shadow-sm transition-transform",
                open ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </span>
        ) : (
          <ChevronDown
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
            aria-hidden
          />
        )}
      </button>
      {open ? <div className="space-y-3 pt-1">{children}</div> : null}
    </div>
  );
}
