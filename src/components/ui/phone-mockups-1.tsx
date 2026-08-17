import { lazy, Suspense, useLayoutEffect, useRef, type RefObject } from "react";
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
  "relative mx-auto overflow-hidden rounded-[1.75rem] border-[3px] border-zinc-800 bg-zinc-950 shadow-[0_25px_60px_-20px_rgba(14,165,233,0.45)] ring-1 ring-white/10 sm:rounded-[2rem]";

function useBootLcpPin(slotRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const img = document.getElementById("boot-lcp") as HTMLImageElement | null;
    const slot = slotRef.current;
    if (!img || !slot) return;

    document.getElementById("boot")?.removeAttribute("hidden");
    document.getElementById("boot-wordmark")?.setAttribute("hidden", "");
    img.style.visibility = "visible";
    img.classList.add("boot-lcp-pinned");

    const place = () => {
      const r = slot.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      const base = Math.min(220, window.innerWidth * 0.62) || r.width;
      const scale = r.width / base;
      img.style.transformOrigin = "top left";
      img.style.transform = `translate3d(${r.left}px, ${r.top}px, 0) scale(${scale})`;
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(slot);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
      img.classList.remove("boot-lcp-pinned");
      img.style.transform = "";
      img.style.transformOrigin = "";
      img.style.visibility = "hidden";
    };
  }, [slotRef]);
}

function PhoneFrame({
  screen,
  className,
}: {
  screen: PhoneScreen;
  className?: string;
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
          width={390}
          height={843}
          sizes="220px"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "top",
          }}
        />
      </picture>
    </div>
  );
}

function LcpPhoneFrame({ className }: { className?: string }) {
  const slotRef = useRef<HTMLDivElement>(null);
  useBootLcpPin(slotRef);

  return (
    <div
      ref={slotRef}
      data-lcp-slot
      className={cn(FRAME_CLASS, className)}
      style={{ width: "100%", height: "100%", aspectRatio: "390 / 843" }}
    />
  );
}

function AdoptedLcpPhone() {
  return (
    <div className="relative w-full select-none">
      <div className="relative" style={SLOT_STYLE}>
        <LcpPhoneFrame />
      </div>
      <div style={{ height: CHROME_H }} aria-hidden />
    </div>
  );
}

/**
 * Phone Mockups 1 · réplica visual do componente 21st (solaceui).
 * Slot com tamanho inline (CLS); 1º slide reusa #boot-lcp.
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
    <div className={cn("relative w-full", className)}>
      <Suspense fallback={<AdoptedLcpPhone />}>
        <PhoneCarousel
          screens={screens}
          intervalMs={intervalMs}
          renderPhone={({ screen, offset }) =>
            offset === 0 && screen.src === HUB_SRC ? (
              <LcpPhoneFrame />
            ) : (
              <PhoneFrame screen={screen} />
            )
          }
        />
      </Suspense>
    </div>
  );
}

export { PhoneMockupBasic };
