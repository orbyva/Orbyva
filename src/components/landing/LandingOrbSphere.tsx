import { cn } from "@/lib/utils";

/**
 * A esfera do app (`OrbSphere`) lê a versão gerada da Orb pelo `useOrbAvatar`, que depende de
 * sessão e do Supabase — a landing não pode importar nenhum dos dois (LCP). Aqui fica só o desenho
 * em CSS, com as mesmas classes de `index.css`. Sem framer-motion: o hero usa este arquivo no
 * first paint.
 */
export function LandingOrbSphere({ size, className }: { size: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span className="orb-sphere" style={{ width: size, height: size }}>
        <span className="orb-sphere__swirl" />
        <span className="orb-sphere__shine" />
      </span>
    </span>
  );
}
