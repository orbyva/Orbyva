import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type LandingMagneticCtaProps = {
  href: string;
  label: string;
  onClick?: () => void;
  size?: "md" | "lg";
  variant?: "primary" | "light";
};

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

  return (
    <Link
      to={href}
      onClick={onClick}
      className={cn(
        "landing-cta inline-flex items-center justify-center rounded-full font-semibold tracking-tight transition-[transform,box-shadow,background-color] duration-200",
        size === "lg" ? "px-8 py-3.5 text-base" : "px-6 py-2.5 text-sm",
        isPrimary
          ? "bg-sky-400 text-sky-950 shadow-[0_8px_24px_rgba(14,165,233,0.35)] hover:bg-sky-300 hover:shadow-[0_12px_28px_rgba(14,165,233,0.45)]"
          : "bg-white text-zinc-900 hover:bg-zinc-100",
        "active:scale-[0.98] motion-safe:hover:-translate-y-0.5"
      )}
    >
      {label}
    </Link>
  );
}
