import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lista empilhada para mobile, substitui tabelas densas.
 * Use com `divide-y` implícito; cada filho é um “card” de linha.
 */
export function MobileStackList({
  children,
  className,
  empty,
}: {
  children: ReactNode;
  className?: string;
  empty?: ReactNode;
}) {
  if (empty) return <>{empty}</>;
  return (
    <div
      className={cn(
        "divide-y divide-border/60 overflow-hidden rounded-xl border bg-card",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MobileStackRow({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-2 p-3.5 text-left sm:p-4",
        onClick && "transition-colors hover:bg-muted/40",
        className
      )}
    >
      {children}
    </Comp>
  );
}
