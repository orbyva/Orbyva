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

function hideBootLcp() {
  const boot = document.getElementById("boot");
  const img = document.getElementById("boot-lcp") as HTMLImageElement | null;
  boot?.setAttribute("hidden", "");
  if (!img) return;
  img.classList.remove("boot-lcp-pinned");
  img.style.visibility = "hidden";
  img.style.transform = "";
  img.style.transformOrigin = "";
  img.style.width = "";
  img.style.height = "";
  img.style.borderRadius = "";
}

/**
 * Encaixa #boot-lcp no slot só no fallback do Suspense (antes do carrossel).
 * Não esconde o overlay no cleanup — o PhoneFrame do hub faz o handoff.
 */
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
      const cs = getComputedStyle(slot);
      const bl = parseFloat(cs.borderLeftWidth) || 0;
      const bt = parseFloat(cs.borderTopWidth) || 0;
      const br = parseFloat(cs.borderRightWidth) || 0;
      const bb = parseFloat(cs.borderBottomWidth) || 0;
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      img.style.width = `${r.width - bl - br}px`;
      img.style.height = `${r.height - bt - bb}px`;
      img.style.borderRadius = `${Math.max(0, radius - Math.max(bl, bt))}px`;
      img.style.transformOrigin = "top left";
      img.style.transform = `translate3d(${r.left + bl}px, ${r.top + bt}px, 0)`;
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
    };
  }, [slotRef]);
}

function PhoneFrame({
  screen,
  className,
  lcp = false,
}: {
  screen: PhoneScreen;
  className?: string;
  lcp?: boolean;
}) {
  const webp = marketingWebp(screen.src);
  const imgRef = useRef<HTMLImageElement>(null);

  useLayoutEffect(() => {
    if (!lcp) return;
    const el = imgRef.current;
    if (!el) return;
    if (el.complete) {
      hideBootLcp();
      return;
    }
    const onLoad = () => hideBootLcp();
    el.addEventListener("load", onLoad);
    return () => el.removeEventListener("load", onLoad);
  }, [lcp]);

  return (
    <div
      className={cn(FRAME_CLASS, className)}
      style={{ width: "100%", height: "100%", aspectRatio: "390 / 843" }}
    >
      <picture>
        <source type="image/webp" srcSet={webp} />
        <img
          ref={imgRef}
          src={screen.src}
          alt={screen.alt}
          width={474}
          height={1024}
          sizes="220px"
          loading={lcp ? "eager" : "lazy"}
          decoding={lcp ? "sync" : "async"}
          fetchPriority={lcp ? "high" : "low"}
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
 * #boot-lcp só no first paint; o carrossel usa <img> normal (sem overlay).
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
          renderPhone={({ screen }) => (
            <PhoneFrame screen={screen} lcp={screen.src === HUB_SRC} />
          )}
        />
      </Suspense>
    </div>
  );
}

export { PhoneMockupBasic };
