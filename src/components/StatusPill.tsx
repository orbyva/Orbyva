import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusPillTone =
  | "warning"
  | "success"
  | "primary"
  | "muted"
  | "destructive"
  | "cinema"
  | "life";

const TONE_CLASS: Record<StatusPillTone, string> = {
  warning: "border-warning/30 bg-warning/15 text-warning",
  success: "border-success/30 bg-success/15 text-success",
  primary: "border-primary/30 bg-primary/15 text-primary",
  muted: "border-border/60 bg-muted text-muted-foreground",
  destructive: "border-destructive/30 bg-destructive/15 text-destructive",
  cinema:
    "border-[hsl(var(--cinema))]/30 bg-[hsl(var(--cinema))]/15 text-[hsl(var(--cinema))]",
  life: "border-[hsl(var(--life))]/30 bg-[hsl(var(--life))]/15 text-[hsl(var(--life))]",
};

/** Chip de tipo no módulo cinema (filme/série/álbum). */
export const CINEMA_TYPE_TONE =
  "bg-[hsl(var(--cinema))]/15 text-[hsl(var(--cinema))]";

/** Micro-pílula de status / tipo (mesmo padrão do detalhe de lugares). */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: StatusPillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Chip de identidade (fundo tintado sem borda, ex.: tipo de lugar). */
export function ToneChip({
  toneClassName,
  children,
  className,
}: {
  toneClassName: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        toneClassName,
        className
      )}
    >
      {children}
    </span>
  );
}
