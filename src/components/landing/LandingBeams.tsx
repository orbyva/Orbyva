import { cn } from "@/lib/utils";

/**
 * Background Beams light (Aceternity / 21st), CSS beams sky Orbyva.
 * Sem Three.js; respeita prefers-reduced-motion via `.landing-beams`.
 */
export function LandingBeams({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden landing-beams",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,_rgba(14,165,233,0.22),_transparent_55%),radial-gradient(ellipse_45%_35%_at_90%_15%,_rgba(14,165,233,0.1),_transparent_50%)]" />
      <svg
        className="absolute inset-0 h-full w-full opacity-70"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="orbyva-beam" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0" />
            <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          className="landing-beam-path landing-beam-path--a"
          d="M -5 30 C 25 10, 45 55, 70 25 S 110 40, 120 20"
          fill="none"
          stroke="url(#orbyva-beam)"
          strokeWidth="0.35"
        />
        <path
          className="landing-beam-path landing-beam-path--b"
          d="M -10 60 C 20 40, 50 80, 75 50 S 105 70, 125 45"
          fill="none"
          stroke="url(#orbyva-beam)"
          strokeWidth="0.28"
        />
        <path
          className="landing-beam-path landing-beam-path--c"
          d="M 0 85 C 30 65, 55 95, 85 70 S 115 90, 130 75"
          fill="none"
          stroke="url(#orbyva-beam)"
          strokeWidth="0.22"
        />
        <path
          className="landing-beam-path landing-beam-path--d"
          d="M 5 15 C 35 45, 60 5, 90 35 S 120 10, 135 40"
          fill="none"
          stroke="url(#orbyva-beam)"
          strokeWidth="0.3"
        />
      </svg>
    </div>
  );
}
