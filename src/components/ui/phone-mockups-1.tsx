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

function marketingWebp(src: string) {
  return src.replace(/\.png$/i, ".webp");
}

const PhoneCarousel = lazy(() =>
  import("@/components/ui/phone-mockups-1-utils/phone-carousel").then((m) => ({
    default: m.PhoneCarousel,
  }))
);

const FRAME_CLASS =
  "relative mx-auto aspect-[9/19] w-full overflow-hidden rounded-[1.75rem] border-[3px] border-zinc-800 bg-zinc-950 shadow-[0_25px_60px_-20px_rgba(14,165,233,0.45)] ring-1 ring-white/10 sm:rounded-[2rem]";

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
      img.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
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
    <div className={cn(FRAME_CLASS, className)}>
      <picture>
        <source type="image/webp" srcSet={webp} />
        <img
          src={screen.src}
          alt={screen.alt}
          width={390}
          height={843}
          sizes="(max-width: 639px) 260px, 240px"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="h-full w-full object-contain object-top"
          draggable={false}
        />
      </picture>
    </div>
  );
}

/** Primeiro slide: slot vazio + #boot-lcp por cima (sem segundo <img> no LCP). */
function LcpPhoneFrame({ className }: { className?: string }) {
  const slotRef = useRef<HTMLDivElement>(null);
  useBootLcpPin(slotRef);

  return (
    <div
      ref={slotRef}
      data-lcp-slot
      className={cn(FRAME_CLASS, className)}
      style={{ aspectRatio: "390 / 843" }}
    />
  );
}

function AdoptedLcpPhone({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full select-none", className)}>
      <div className="relative mx-auto w-full max-w-[260px]">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-6 rounded-full bg-sky-500/20 blur-3xl"
        />
        <div className="relative z-[1]">
          <LcpPhoneFrame />
        </div>
      </div>
    </div>
  );
}

/**
 * Phone Mockups 1 · réplica visual do componente 21st (solaceui).
 * Centro do 1º slide reusa #boot-lcp; o chunk do carrossel entra em lazy.
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
    <Suspense fallback={<AdoptedLcpPhone className={className} />}>
      <PhoneCarousel
        screens={screens}
        intervalMs={intervalMs}
        className={className}
        renderPhone={({ screen, offset }) =>
          offset === 0 && screen.src === HUB_SRC ? (
            <LcpPhoneFrame />
          ) : (
            <PhoneFrame screen={screen} />
          )
        }
      />
    </Suspense>
  );
}

export { PhoneMockupBasic };
