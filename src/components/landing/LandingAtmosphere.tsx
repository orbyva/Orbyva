import { useEffect, useState } from "react";
import { LandingBeams } from "@/components/landing/LandingBeams";

/**
 * Atmosfera leve: beams + glow CSS.
 * (Canvas stardust + gradient Framer no documento inteiro travavam a landing.)
 */
export function LandingAtmosphere({ className }: { className?: string }) {
  const [allowMotion, setAllowMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setAllowMotion(!mq.matches);
    const onChange = () => setAllowMotion(!mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div
      aria-hidden
      className={
        className ??
        "pointer-events-none fixed inset-0 z-0 overflow-hidden"
      }
    >
      <LandingBeams className="opacity-90" />
      <div
        className={`landing-atmosphere-glow absolute inset-0 ${
          allowMotion ? "landing-atmosphere-glow--live" : ""
        }`}
      />
    </div>
  );
}
