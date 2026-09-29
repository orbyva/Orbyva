import { cn } from "@/lib/utils";

export type OrbSphereState = "idle" | "thinking";

export interface OrbSphereProps {
  state?: OrbSphereState;
  /** Lado do círculo em px. O brilho externo é desenhado por `box-shadow`, fora dessa medida. */
  size?: number;
  className?: string;
}

/**
 * A esfera da Orb — a presença dela no app (feature 100).
 *
 * Desenhada em CSS, não como imagem: ela muda de estado (parada / pensando), acompanha o tema e
 * precisa ficar nítida em qualquer densidade de tela. Um PNG custaria download, teria fundo fixo e
 * não conseguiria pulsar enquanto a Orb pensa.
 *
 * As animações vivem em `index.css` (`orb-drift`/`orb-pulse`) e já respeitam
 * `prefers-reduced-motion` lá — quem pediu menos movimento vê a esfera parada, não um substituto.
 */
export function OrbSphere({ state = "idle", size = 40, className }: OrbSphereProps) {
  const pensando = state === "thinking";
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className={cn("orb-sphere", pensando && "orb-sphere--thinking")}
        style={{ width: size, height: size }}
      >
        <span className="orb-sphere__swirl" />
        <span className="orb-sphere__shine" />
      </span>
    </span>
  );
}
