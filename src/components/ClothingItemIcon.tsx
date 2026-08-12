import type { ReactElement, SVGProps } from "react";
import type {
  ClothingFabric,
  ClothingIconKey,
  ClothingItem,
} from "@/domain/travel/clothing";
import { CLOTHING_META, fabricTraitsLine } from "@/domain/travel/clothing";
import { cn } from "@/lib/utils";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

function garmentSvg(props: IconProps) {
  const { className, ...rest } = props;
  return {
    className: cn("h-5 w-5 shrink-0", className),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    ...rest,
  };
}

/** Regata, sem mangas, alças. */
function TankIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      <path d="M9 4 7 7v13h10V7l-2-3" />
      <path d="M9 4c0 1.6 1.2 2.6 3 2.6S15 5.6 15 4" />
      <path d="M9 4 7.5 2.5M15 4l1.5-1.5" />
    </svg>
  );
}

/** Camiseta manga curta. */
function ShirtIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      <path d="M9 3.5 5.5 6.2l2 2.6V20.5h9V8.8l2-2.6L15 3.5" />
      <path d="M9 3.5c0 1.8 1.3 2.9 3 2.9s3-1.1 3-2.9" />
      <path d="M12 6.4v2.4" />
    </svg>
  );
}

/**
 * Manga longa, mangas descem quase até a barra da peça
 * (bem distintas da manga curta).
 */
function LongSleeveIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      {/* torso */}
      <path d="M9 3.5c0 1.7 1.3 2.8 3 2.8s3-1.1 3-2.8" />
      <path d="M9 3.5 15 3.5" />
      {/* body */}
      <path d="M8.2 8.2V20.5h7.6V8.2" />
      {/* left long sleeve: shoulder → cuff near hem */}
      <path d="M9 3.5 3.2 6.2v11.8h2.4V8.6L8.2 7.2" />
      {/* right long sleeve */}
      <path d="M15 3.5 20.8 6.2v11.8h-2.4V8.6L15.8 7.2" />
      <path d="M12 6.3v2.2" />
    </svg>
  );
}

/** Casaco leve, jaqueta curta com zíper/fechamento. */
function JacketIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      <path d="M9 4.5 5 7.2l1.6 2.2V18h10.8V9.4L19 7.2 15 4.5" />
      <path d="M9 4.5c0.5 1.5 1.7 2.4 3 2.4s2.5-.9 3-2.4" />
      <path d="M12 6.9V18" />
      <path d="M8.8 11.5h2.2M13 11.5h2.2" />
    </svg>
  );
}

/**
 * Casaco quente, sobretudo longo: gola/lapela, mangas longas, barra baixa.
 * Bem distinto da jaqueta curta.
 */
function CoatIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      {/* gola / lapela em V */}
      <path d="M9.2 3.2 12 6.8 14.8 3.2" />
      <path d="M9.2 3.2c-0.2 1.4 0.6 2.6 1.4 3.2M14.8 3.2c0.2 1.4-0.6 2.6-1.4 3.2" />
      {/* corpo longo até a base */}
      <path d="M8 7.8V21.5h8V7.8" />
      {/* abertura central */}
      <path d="M12 6.8V21.5" />
      {/* manga esquerda longa */}
      <path d="M8 7.8 3.5 10.2v8.8h2.3V12L8 10.5" />
      {/* manga direita longa */}
      <path d="M16 7.8 20.5 10.2v8.8h-2.3V12L16 10.5" />
      {/* botões */}
      <circle cx="10.4" cy="11.5" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="14.5" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="10.4" cy="17.5" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}

function RaincoatIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      <path d="M9 5 4.2 8l1.8 2V20.5h12V10l1.8-2L15 5" />
      <path d="M9 5c0.6 1.7 1.8 2.6 3 2.6s2.4-.9 3-2.6" />
      <path d="M8 2.5v2.2M12 2v2.2M16 2.5v2.2" />
      <path d="M12 7.6V20.5" />
    </svg>
  );
}

function PantsIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      <path d="M8 3h8l-1 18h-2.6L12 11.2 11.6 21H9L8 3Z" />
      <path d="M8.2 7h7.6" />
    </svg>
  );
}

function WarmPantsIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      <path d="M7.5 3h9l-1.1 18H12.8L12 11.5 11.2 21H8.6L7.5 3Z" />
      <path d="M7.7 7.5h8.6" />
      <path d="M9.2 13h2M12.8 13h2" />
    </svg>
  );
}

/**
 * Shorts / bermuda, pernas curtas e abertas, cintura marcada.
 */
function ShortsIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      {/* waistband */}
      <path d="M6.5 6h11" />
      <path d="M6.5 6v1.2c0 .4.2.8.5 1L8.5 14.5h2.4L12 10.8l1.1 3.7h2.4l1.5-6.3c.3-.2.5-.6.5-1V6" />
      {/* center seam hint */}
      <path d="M12 7.2v3.2" />
    </svg>
  );
}

function ShoeIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      <path d="M3.5 15h11l4.5 2.2v2.3H3.5v-2.3l1.5-1.2" />
      <path d="M5.8 15V11c0-1.5 1-2.6 2.6-2.6H12" />
    </svg>
  );
}

function UmbrellaIcon(props: IconProps) {
  return (
    <svg {...garmentSvg(props)}>
      <path d="M12 4v13.5a1.8 1.8 0 0 0 3.6 0" />
      <path d="M4 12a8 8 0 0 1 16 0H4Z" />
    </svg>
  );
}

const ICON_BY_KEY: Record<ClothingIconKey, (p: IconProps) => ReactElement> = {
  tank: TankIcon,
  shirt: ShirtIcon,
  "long-sleeve": LongSleeveIcon,
  jacket: JacketIcon,
  coat: CoatIcon,
  raincoat: RaincoatIcon,
  pants: PantsIcon,
  "warm-pants": WarmPantsIcon,
  shorts: ShortsIcon,
  shoe: ShoeIcon,
  umbrella: UmbrellaIcon,
};

type Props = {
  item: ClothingItem;
  className?: string;
};

export function ClothingItemIcon({ item, className }: Props) {
  const Icon = ICON_BY_KEY[CLOTHING_META[item].icon] ?? ShirtIcon;
  return <Icon className={className} />;
}

/** Rótulo de tecido por escrito (propriedades que eram ícones). */
export function FabricMarks({
  fabric,
  className,
}: {
  fabric: ClothingFabric;
  className?: string;
}) {
  return (
    <span className={cn("capitalize text-foreground/85", className)}>
      {fabricTraitsLine(fabric)}
    </span>
  );
}
