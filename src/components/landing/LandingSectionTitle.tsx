import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { reveal } from "@/components/landing/landingMotion";

type LandingSectionTitleProps = {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
  as?: "h2" | "h3";
};

/**
 * Título de seção com entrada animada (Framer), alinhado ao motion da landing.
 * Syne tem descendentes altos (ex.: “g”), leading + padding evitam corte.
 * Sem translateY: transform + overflow-x no ancestral costuma cortar glifos.
 */
export function LandingSectionTitle({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  as: Tag = "h2",
}: LandingSectionTitleProps) {
  const center = align === "center";

  return (
    <motion.div
      {...reveal()}
      className={cn(
        "overflow-visible",
        center ? "mx-auto max-w-xl text-center" : "max-w-xl",
        className
      )}
    >
      {eyebrow ? (
        <p className="font-display text-sm font-medium leading-normal text-sky-400/90">
          {eyebrow}
        </p>
      ) : null}
      <Tag
        className={cn(
          "block text-balance pb-[0.22em] font-display text-3xl font-semibold leading-[1.4] tracking-tighter sm:text-4xl sm:leading-[1.35]",
          eyebrow && "mt-2",
          center && "text-center"
        )}
      >
        {title}
      </Tag>
      {description ? (
        <p className="mt-3 max-w-[65ch] text-pretty leading-relaxed text-zinc-400">
          {description}
        </p>
      ) : null}
    </motion.div>
  );
}
