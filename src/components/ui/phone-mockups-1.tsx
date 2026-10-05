import { lazy, Suspense, useLayoutEffect, useRef } from "react";
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

const HUB_SRC = DEFAULT_SCREENS[0]!.src;

/** Altura do chrome (label + setas + dots), inline para não depender do Tailwind. */
const CHROME_H = 102;

const SLOT_STYLE = {
  width: "min(220px, 62vw)",
  aspectRatio: "390 / 843",
  margin: "0 auto",
} as const;

function marketingWebp(src: string) {
  return src.replace(/\.png$/i, ".webp");
}

const PhoneCarousel = lazy(() =>
  import("@/components/ui/phone-mockups-1-utils/phone-carousel").then((m) => ({
    default: m.PhoneCarousel,
  }))
);

const FRAME_CLASS =
  "relative mx-auto overflow-hidden rounded-[1.75rem] border-[3px] border-zinc-800 bg-zinc-950 ring-1 ring-white/10 sm:rounded-[2rem]";

function hideBoot() {
  document.getElementById("boot")?.setAttribute("hidden", "");
}

function PhoneFrame({
  screen,
  className,
  priority = false,
}: {
  screen: PhoneScreen;
  className?: string;
  priority?: boolean;
}) {
  const webp = marketingWebp(screen.src);

  return (
    <div
      className={cn(FRAME_CLASS, className)}
      style={{ width: "100%", height: "100%", aspectRatio: "390 / 843" }}
    >
      <picture>
        <source type="image/webp" srcSet={webp} />
        <img
          src={screen.src}
          alt={screen.alt}
          width={474}
          height={1024}
          sizes="220px"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "low"}
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "top",
            backgroundColor: "#09090b",
          }}
        />
      </picture>
    </div>
  );
}

/**
 * O hub já pinta aqui: esperar o chunk do carrossel (+ framer-motion) para mostrar o <img>
 * empurrava o LCP em ~6s de render delay no Lighthouse mobile.
 */
function PhoneSlotFallback({ screen }: { screen: PhoneScreen }) {
  return (
    <div className="relative w-full select-none">
      <div className="relative" style={SLOT_STYLE}>
        <PhoneFrame screen={screen} priority={screen.src === HUB_SRC} />
      </div>
      <div style={{ height: CHROME_H }} aria-hidden />
    </div>
  );
}

/**
 * Phone Mockups 1 · réplica visual do componente 21st (solaceui).
 * O print do hub vem do <img> do carrossel (hub.webp em preload no HTML).
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
  const hiddenBoot = useRef(false);

  useLayoutEffect(() => {
    if (hiddenBoot.current) return;
    hiddenBoot.current = true;
    hideBoot();
  }, []);

  const first = screens[0];
  if (!first) return null;

  return (
    <div className={cn("relative w-full", className)}>
      <Suspense fallback={<PhoneSlotFallback screen={first} />}>
        <PhoneCarousel
          screens={screens}
          intervalMs={intervalMs}
          renderPhone={({ screen, offset }) => (
            <PhoneFrame
              screen={screen}
              priority={offset === 0 && screen.src === HUB_SRC}
            />
          )}
        />
      </Suspense>
    </div>
  );
}

export { PhoneMockupBasic };
