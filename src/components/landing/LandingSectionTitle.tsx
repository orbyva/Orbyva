import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
 * Syne tem descendentes altos (ex.: “g”) — leading + padding evitam corte.
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
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4 }}
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
          "mt-2 block pb-[0.22em] font-display text-3xl font-semibold leading-[1.4] tracking-tight sm:text-4xl sm:leading-[1.35]",
          center && "text-center"
        )}
      >
        {title}
      </Tag>
      {description ? (
        <p className="mt-3 text-zinc-400">{description}</p>
      ) : null}
    </motion.div>
  );
}
