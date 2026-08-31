import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type PhoneScreen = {
  src: string;
  alt: string;
  label?: string;
};

type PhoneCarouselProps = {
  screens: PhoneScreen[];
  /** ms entre slides; 0 = sem autoplay */
  intervalMs?: number;
  className?: string;
  /** Renderiza o frame do telefone para um screen + posição relativa (-1|0|1). */
  renderPhone: (args: {
    screen: PhoneScreen;
    offset: -1 | 0 | 1;
    index: number;
  }) => ReactNode;
};

/**
 * Só o slide atual (e o que está saindo) ficam no DOM. Montar os 3 no first paint, mesmo
 * com `loading=lazy`, dispara download no viewport e rouba o LCP do hub.
 */
function CenterStack({
  screens,
  index,
  renderPhone,
  reduceMotion,
  className,
  style,
}: {
  screens: PhoneScreen[];
  index: number;
  renderPhone: PhoneCarouselProps["renderPhone"];
  reduceMotion: boolean | null;
  className?: string;
  style?: CSSProperties;
}) {
  const prevIndex = useRef(index);
  const [leaving, setLeaving] = useState<number | null>(null);

  useEffect(() => {
    const from = prevIndex.current;
    if (from === index) return;
    prevIndex.current = index;
    setLeaving(from);
    const t = window.setTimeout(() => setLeaving(null), 300);
    return () => window.clearTimeout(t);
  }, [index]);

  const shown = new Set<number>([index]);
  if (leaving !== null) shown.add(leaving);

  return (
    <div className={cn("relative overflow-hidden", className)} style={style}>
      {[...shown].map((i) => {
        const screen = screens[i]!;
        return (
          <div
            key={screen.src}
            className="absolute inset-0"
            style={{
              opacity: i === index ? 1 : 0,
              transition: reduceMotion ? "none" : "opacity 0.28s ease",
              zIndex: i === index ? 1 : 0,
            }}
            aria-hidden={i !== index}
          >
            {renderPhone({ screen, offset: 0, index: i })}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Carrossel 3-up (peek | center | peek) no desktop;
 * no mobile só o centro.
 */
export function PhoneCarousel({
  screens,
  intervalMs = 4200,
  className,
  renderPhone,
}: PhoneCarouselProps) {
  const n = screens.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const reduceMotion = useReducedMotion();
  const [showPeeks, setShowPeeks] = useState(false);
  const [autoplayOn, setAutoplayOn] = useState(false);
  const [desktop, setDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 640px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const enable = () => setShowPeeks(true);
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(enable, { timeout: 1600 });
      return () => window.cancelIdleCallback(idle);
    }
    const t = window.setTimeout(enable, 400);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showPeeks) return;
    const neighbors = [
      screens[(index - 1 + n) % n],
      screens[(index + 1) % n],
    ].filter(Boolean);
    for (const screen of neighbors) {
      const img = new Image();
      img.src = screen!.src.replace(/\.png$/i, ".webp");
    }
  }, [screens, index, n, showPeeks]);

  const go = useCallback(
    (nextDir: -1 | 1) => {
      if (n < 1) return;
      setIndex((i) => (i + nextDir + n) % n);
    },
    [n]
  );

  const jump = useCallback(
    (next: number) => {
      if (n < 1) return;
      setIndex(next);
    },
    [n]
  );

  useEffect(() => {
    const start = () => setAutoplayOn(true);
    const t = window.setTimeout(start, 8000);
    window.addEventListener("pointerdown", start, { once: true, passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", start);
    };
  }, []);

  useEffect(() => {
    if (!autoplayOn || n < 2 || intervalMs <= 0) return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => (i + 1) % n);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [autoplayOn, n, intervalMs]);

  if (n === 0) return null;

  const left = screens[(index - 1 + n) % n]!;
  const center = screens[index]!;
  const right = screens[(index + 1) % n]!;
  const stackStyle = { aspectRatio: "390 / 843" } as const;

  return (
    <div className={cn("relative w-full select-none", className)}>
      {!desktop ? (
        <div
          className="relative mx-auto"
          style={{
            width: "min(220px, 62vw)",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div className="pointer-events-none absolute -inset-6 rounded-full bg-sky-500/20 blur-3xl" />
          <CenterStack
            screens={screens}
            index={index}
            renderPhone={renderPhone}
            reduceMotion={reduceMotion}
            className="z-[1] w-full"
            style={stackStyle}
          />
        </div>
      ) : (
        <div className="relative mx-auto flex h-[480px] max-w-lg items-center justify-center">
          <div className="pointer-events-none absolute inset-x-[8%] top-1/2 z-0 h-[55%] -translate-y-1/2 rounded-full bg-sky-500/20 blur-3xl" />

          <div className="absolute left-[8%] z-[1] w-[36%] max-w-[168px] -translate-y-1 scale-[0.9] opacity-55 transition-[opacity] duration-200">
            {showPeeks
              ? renderPhone({
                  screen: left,
                  offset: -1,
                  index: (index - 1 + n) % n,
                })
              : null}
          </div>

          <CenterStack
            screens={screens}
            index={index}
            renderPhone={renderPhone}
            reduceMotion={reduceMotion}
            className="z-[2]"
            style={{ ...stackStyle, width: "42%", maxWidth: 200 }}
          />

          <div className="absolute right-[8%] z-[1] w-[36%] max-w-[168px] -translate-y-1 scale-[0.9] opacity-55 transition-[opacity] duration-200">
            {showPeeks
              ? renderPhone({
                  screen: right,
                  offset: 1,
                  index: (index + 1) % n,
                })
              : null}
          </div>
        </div>
      )}
      <div style={{ minHeight: 102 }}>
        {center.label ? (
          <div className="relative mt-3 h-5 overflow-hidden text-center">
            <AnimatePresence initial={false}>
              <motion.p
                key={center.label}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-x-0 text-sm font-medium text-zinc-300"
              >
                {center.label}
              </motion.p>
            </AnimatePresence>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => go(-1)}
            className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 transition hover:bg-white/10 active:scale-95"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            aria-label={paused ? "Retomar" : "Pausar"}
            onClick={() => setPaused((p) => !p)}
            className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 transition hover:bg-white/10 active:scale-95"
          >
            {paused ? (
              <Play className="size-3.5" />
            ) : (
              <Pause className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => go(1)}
            className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 transition hover:bg-white/10 active:scale-95"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div
          className="mt-3 flex justify-center gap-1.5"
          role="tablist"
          aria-label="Slides do app"
        >
          {screens.map((s, i) => (
            <button
              key={`${s.src}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={s.label ?? `Slide ${i + 1}`}
              onClick={() => jump(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index
                  ? "w-5 bg-sky-400"
                  : "w-1.5 bg-white/25 hover:bg-white/40"
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
