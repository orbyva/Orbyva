import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Moldura do CTA final — CSS neon leve (sem RAF contínuo do OriginKit).
 */
export function LandingNeonFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "landing-neon-frame relative rounded-[1.75rem] border border-sky-400/30 bg-sky-500/[0.04]",
        className
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}
