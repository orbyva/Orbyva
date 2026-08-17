import { lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import type { PhoneScreen } from "@/components/ui/phone-mockups-1-utils/phone-carousel";

export type { PhoneScreen };

/** Screens do hero: poucos prints distintos (sem repetir o restante da landing). */
const DEFAULT_SCREENS: PhoneScreen[] = [
  {
    src: "/marketing/hub.png",
    alt: "Início: saldo do mês, alertas e resumo do dia",
    label: "Início",
  },
  {
    src: "/marketing/financas.png",
    alt: "Dashboard de finanças com alertas e saldo",
    label: "Finanças",
  },
  {
    src: "/marketing/viagens.png",
    alt: "Viagens com roteiro e orçamento",
    label: "Viagens",
  },
];

function marketingWebp(src: string) {
  return src.replace(/\.png$/i, ".webp");
}

const PhoneCarousel = lazy(() =>
  import("@/components/ui/phone-mockups-1-utils/phone-carousel").then((m) => ({
    default: m.PhoneCarousel,
  }))
);

function PhoneFrame({
  screen,
  priority,
  className,
}: {
  screen: PhoneScreen;
  priority?: boolean;
  className?: string;
}) {
  const webp = marketingWebp(screen.src);

  return (
    <div
      className={cn(
        "relative mx-auto aspect-[9/19] w-full overflow-hidden rounded-[1.75rem] border-[3px] border-zinc-800 bg-zinc-950 shadow-[0_25px_60px_-20px_rgba(14,165,233,0.45)] ring-1 ring-white/10 sm:rounded-[2rem]",
        className
      )}
    >
      <picture>
        <source type="image/webp" srcSet={webp} />
        <img
          src={screen.src}
          alt={screen.alt}
          width={390}
          height={843}
          sizes="(max-width: 639px) 260px, 240px"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          className="h-full w-full object-contain object-top"
          draggable={false}
        />
      </picture>
    </div>
  );
}

/** Primeiro frame estático: LCP sem esperar o chunk do framer-motion. */
function HeroPhoneFallback({
  screen,
  className,
}: {
  screen: PhoneScreen;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full select-none", className)}>
      <div className="relative mx-auto w-full max-w-[260px] sm:hidden">
        <div className="pointer-events-none absolute -inset-6 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative z-[1]">
          <PhoneFrame screen={screen} priority />
        </div>
      </div>
      <div className="relative mx-auto hidden h-[560px] max-w-xl items-center justify-center sm:flex">
        <div className="pointer-events-none absolute inset-x-[8%] top-1/2 z-0 h-[55%] -translate-y-1/2 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative z-[2] aspect-[9/19] w-[46%] max-w-[240px]">
          <PhoneFrame screen={screen} priority />
        </div>
      </div>
    </div>
  );
}

/**
 * Phone Mockups 1 · réplica visual do componente 21st (solaceui):
 * 3 iPhones (centro + peeks) no desktop; 1 phone no mobile (sem corte).
 */
export default function PhoneMockupBasic({
  screens = DEFAULT_SCREENS,
  className,
  intervalMs = 4200,
}: {
  screens?: PhoneScreen[];
  className?: string;
  intervalMs?: number;
}) {
  const first = screens[0];
  if (!first) return null;

  return (
    <Suspense fallback={<HeroPhoneFallback screen={first} className={className} />}>
      <PhoneCarousel
        screens={screens}
        intervalMs={intervalMs}
        className={className}
        renderPhone={({ screen, offset }) => (
          <PhoneFrame screen={screen} priority={offset === 0} />
        )}
      />
    </Suspense>
  );
}

export { PhoneMockupBasic };
