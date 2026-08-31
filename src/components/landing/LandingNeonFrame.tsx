import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Moldura em duplo bisel (casca + núcleo), sem glow neon.
 */
export function LandingNeonFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div
        className={cn(
          "relative overflow-hidden rounded-[calc(2rem-0.375rem)] border border-white/[0.08] bg-sky-500/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
