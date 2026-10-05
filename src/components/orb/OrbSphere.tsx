import { useState } from "react";

import { useOrbAvatar } from "@/hooks/useOrbAvatar";
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
 * Por padrão é desenhada em CSS: muda de estado (parada / pensando), acompanha o tema e fica nítida
 * em qualquer densidade de tela. Com uma versão gerada ativa (feature 154), o PNG dela entra aqui
 * dentro no lugar do desenho, e "pensando" vira a mesma pulsação por CSS em volta da imagem — os
 * chamadores não sabem qual dos dois está por dentro. PNG que falha ao carregar volta para o CSS.
 *
 * As animações vivem em `index.css` (`orb-drift`/`orb-pulse`) e já respeitam
 * `prefers-reduced-motion` lá — quem pediu menos movimento vê a esfera parada, não um substituto.
 */
export function OrbSphere({ state = "idle", size = 40, className }: OrbSphereProps) {
  const pensando = state === "thinking";
  const { url } = useOrbAvatar();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && url !== failedUrl;

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImage ? (
        <span
          className={cn("orb-avatar", pensando && "orb-avatar--thinking")}
          style={{ width: size, height: size }}
        >
          <img
            src={url as string}
            alt=""
            decoding="async"
            className="orb-avatar__img"
            onError={() => setFailedUrl(url)}
          />
        </span>
      ) : (
        <span
          className={cn("orb-sphere", pensando && "orb-sphere--thinking")}
          style={{ width: size, height: size }}
        >
          <span className="orb-sphere__swirl" />
          <span className="orb-sphere__shine" />
        </span>
      )}
    </span>
  );
}
