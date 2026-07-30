import { cn } from "@/lib/utils";
import {
  PhoneCarousel,
  type PhoneScreen,
} from "@/components/ui/phone-mockups-1-utils/phone-carousel";

export type { PhoneScreen };

/** Screens do hero — troque os PNGs em /public/marketing/ quando refizer os prints. */
const DEFAULT_SCREENS: PhoneScreen[] = [
  {
    src: "/marketing/hub.png",
    alt: "Início: saldo, orçamento e resumo do dia",
    label: "Início",
  },
  {
    src: "/marketing/orcamento.png",
    alt: "Orçamento mensal com teto por categoria",
    label: "Orçamento",
  },
  {
    src: "/marketing/parcelas.png",
    alt: "Parcelas e recorrências sob controle",
    label: "Parcelas",
  },
  {
    src: "/marketing/financas.png",
    alt: "Dashboard de finanças",
    label: "Finanças",
  },
  {
    src: "/marketing/habitos.png",
    alt: "Hábitos e streaks",
    label: "Hábitos",
  },
  {
    src: "/marketing/cinema.png",
    alt: "Cinema e watchlist",
    label: "Cinema",
  },
];

function PhoneFrame({
  screen,
  priority,
  className,
}: {
  screen: PhoneScreen;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[9/19] w-full overflow-hidden rounded-[1.75rem] border-[3px] border-zinc-800 bg-zinc-950 shadow-[0_25px_60px_-20px_rgba(14,165,233,0.45)] ring-1 ring-white/10 sm:rounded-[2rem]",
        className
      )}
    >
      <div
        aria-hidden
        className="absolute left-1/2 top-2 z-10 h-4 w-20 -translate-x-1/2 rounded-full bg-zinc-950 sm:h-5 sm:w-24"
      />
      <img
        src={screen.src}
        alt={screen.alt}
        width={390}
        height={844}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-contain object-top"
        draggable={false}
      />
    </div>
  );
}

/**
 * Phone Mockups 1 — réplica visual do componente 21st (solaceui):
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
  return (
    <PhoneCarousel
      screens={screens}
      intervalMs={intervalMs}
      className={className}
      renderPhone={({ screen, offset }) => (
        <PhoneFrame screen={screen} priority={offset === 0} />
      )}
    />
  );
}

export { PhoneMockupBasic };
