import { BrandLogo } from "@/components/BrandLogo";
import { BrandWordmark } from "@/components/BrandWordmark";
import { BRAND } from "@/lib/brand";

type LoadingFallbackProps = {
  /** `viewport` = cobre app inteiro (inclui sidebar). */
  cover?: "viewport" | "parent";
};

export default function LoadingFallback({
  cover = "viewport",
}: LoadingFallbackProps) {
  return (
    <div
      className={
        cover === "viewport"
          ? "fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[#0c1222]"
          : "relative flex min-h-svh items-center justify-center overflow-hidden bg-[#0c1222]"
      }
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(14,165,233,0.22),_transparent_55%)]"
      />

      <div className="relative z-10 flex flex-col items-center px-6">
        <div className="relative flex size-[5.5rem] items-center justify-center">
          <span
            aria-hidden
            className="orbyva-orbit absolute inset-0 rounded-full border border-sky-400/15 border-t-sky-400/90"
          />
          <span
            aria-hidden
            className="orbyva-orbit-slow absolute inset-2 rounded-full border border-dashed border-sky-500/25"
          />
          <BrandLogo
            variant="mark"
            className="size-14 rounded-2xl bg-white shadow-[0_0_40px_-8px_rgba(14,165,233,0.55)]"
            alt={BRAND.name}
          />
        </div>

        <div className="orbyva-fade mt-8">
          <BrandWordmark
            showSubtitle={false}
            size="md"
            className="text-center [&_p]:text-zinc-100"
          />
        </div>

        <p className="orbyva-fade-delay mt-3 text-xs tracking-wide text-zinc-500">
          Entrando na órbita…
        </p>
      </div>

      <style>{`
        @keyframes orbyva-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes orbyva-spin-rev {
          to { transform: rotate(-360deg); }
        }
        @keyframes orbyva-fade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .orbyva-orbit {
          animation: orbyva-spin 1.35s linear infinite;
        }
        .orbyva-orbit-slow {
          animation: orbyva-spin-rev 2.6s linear infinite;
        }
        .orbyva-fade {
          animation: orbyva-fade 0.5s ease-out both;
        }
        .orbyva-fade-delay {
          animation: orbyva-fade 0.55s ease-out 0.12s both;
        }
      `}</style>
    </div>
  );
}
