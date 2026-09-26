import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type LandingMagneticCtaProps = {
  href: string;
  label: string;
  onClick?: () => void;
  size?: "md" | "lg";
  variant?: "primary" | "light";
};

const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

/**
 * CTA da landing, hover/press leves em CSS (sem listener global de pointer).
 */
export function LandingMagneticCta({
  href,
  label,
  onClick,
  size = "lg",
  variant = "primary",
}: LandingMagneticCtaProps) {
  const isPrimary = variant === "primary";
  const iconWrap =
    size === "lg" ? "size-8" : "size-7";

  return (
    <Link
      to={href}
      onClick={onClick}
      className={cn(
        "landing-cta group inline-flex items-center justify-center gap-3 rounded-full font-semibold tracking-tight",
        "transition-[transform,background-color] duration-300",
        EASE,
        size === "lg" ? "py-2 pl-6 pr-2 text-base" : "py-1.5 pl-5 pr-1.5 text-sm",
        isPrimary
          ? "bg-sky-400 text-sky-950 hover:bg-sky-300"
          : "bg-white text-zinc-900 hover:bg-zinc-100",
        "active:scale-[0.98]"
      )}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full transition-transform duration-300",
          EASE,
          iconWrap,
          isPrimary ? "bg-sky-950/15" : "bg-zinc-900/10",
          "group-hover:translate-x-0.5"
        )}
        aria-hidden
      >
        <ArrowRight className={size === "lg" ? "size-4" : "size-3.5"} strokeWidth={2} />
      </span>
    </Link>
  );
}
