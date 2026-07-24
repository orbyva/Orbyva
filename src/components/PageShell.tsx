import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { BREADCRUMB_LABELS, BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface PageShellProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Hub e telas com header próprio. */
  hideHeader?: boolean;
  /**
   * Label azul acima do título (efeito da home).
   * Padrão: módulo da rota. `null` ou `""` esconde.
   */
  eyebrow?: string | null;
  /** Classes extras na área de actions. */
  actionsClassName?: string;
}

function defaultEyebrow(pathname: string, title?: string): string {
  const root = pathname.split("/").filter(Boolean)[0];
  if (!root || root === "home") return BRAND.name;
  const label = BREADCRUMB_LABELS[root] ?? BRAND.name;
  if (title && label.toLowerCase() === title.toLowerCase()) {
    return BRAND.name;
  }
  return label;
}

export function PageShell({
  title,
  description,
  actions,
  children,
  className,
  hideHeader = false,
  eyebrow,
  actionsClassName,
}: PageShellProps) {
  const { pathname } = useLocation();
  const resolvedEyebrow =
    eyebrow === null || eyebrow === ""
      ? null
      : (eyebrow ?? defaultEyebrow(pathname, title));

  return (
    <main
      className={cn(
        "mx-auto w-full max-w-7xl overflow-x-hidden px-3 py-4 space-y-4 sm:px-6 sm:py-6 sm:space-y-6 lg:px-8",
        className
      )}
    >
      {!hideHeader && title ? (
        <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {resolvedEyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary sm:text-[11px]">
                {resolvedEyebrow}
              </p>
            ) : null}
            <h1
              className={cn(
                "text-xl font-semibold tracking-tight sm:text-2xl sm:font-bold",
                resolvedEyebrow && "mt-1"
              )}
            >
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div
              className={cn(
                "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&_button]:w-full sm:[&_button]:w-auto",
                actionsClassName
              )}
            >
              {actions}
            </div>
          ) : null}
        </section>
      ) : null}
      {children}
    </main>
  );
}
