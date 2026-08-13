import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
 * Carrossel 3-up (peek | center | peek) no desktop;
 * no mobile só o centro, transição rápida sem “buraco” entre slides.
 */
export function PhoneCarousel({
  screens,
  intervalMs = 4200,
  className,
  renderPhone,
}: PhoneCarouselProps) {
  const n = screens.length;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const reduceMotion = useReducedMotion();

  // Prefetch só vizinhos (webp), não todos os slides de uma vez.
  useEffect(() => {
    const neighbors = [
      screens[(index - 1 + n) % n],
      screens[(index + 1) % n],
    ].filter(Boolean);
    for (const screen of neighbors) {
      const img = new Image();
      img.src = screen!.src.replace(/\.png$/i, ".webp");
    }
  }, [screens, index, n]);

  const go = useCallback(
    (nextDir: -1 | 1) => {
      if (n < 1) return;
      setDir(nextDir);
      setIndex((i) => (i + nextDir + n) % n);
    },
    [n]
  );

  const jump = useCallback(
    (next: number) => {
      if (n < 1) return;
      setDir(next > index || (index === n - 1 && next === 0) ? 1 : -1);
      setIndex(next);
    },
    [index, n]
  );

  useEffect(() => {
    if (n < 2 || intervalMs <= 0) return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      setDir(1);
      setIndex((i) => (i + 1) % n);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [n, intervalMs]);

  if (n === 0) return null;

  const left = screens[(index - 1 + n) % n]!;
  const center = screens[index]!;
  const right = screens[(index + 1) % n]!;

  const slideTransition = reduceMotion
    ? { duration: 0.12 }
    : { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

  const slide = {
    initial: reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, x: dir * 18 },
    animate: { opacity: 1, x: 0 },
    exit: reduceMotion
      ? { opacity: 0 }
      : { opacity: 0, x: dir * -14 },
    transition: slideTransition,
  };

  return (
    <div className={cn("relative w-full select-none", className)}>
      {/* Mobile */}
      <div className="relative mx-auto w-full max-w-[260px] sm:hidden">
        <div className="pointer-events-none absolute -inset-6 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative z-[1] aspect-[9/19]">
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={`m-${index}`}
              className="absolute inset-0"
              {...slide}
            >
              {renderPhone({ screen: center, offset: 0, index })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Desktop 3-up, peeks estáveis, só o centro faz crossfade */}
      <div className="relative mx-auto hidden h-[560px] max-w-xl items-center justify-center sm:flex">
        <div className="pointer-events-none absolute inset-x-[8%] top-1/2 z-0 h-[55%] -translate-y-1/2 rounded-full bg-sky-500/20 blur-3xl" />

        <div className="absolute left-[6%] z-[1] w-[38%] max-w-[200px] -translate-y-1 scale-[0.82] opacity-55 transition-[opacity] duration-200">
          {renderPhone({
            screen: left,
            offset: -1,
            index: (index - 1 + n) % n,
          })}
        </div>

        <div className="relative z-[2] aspect-[9/19] w-[46%] max-w-[240px]">
          <AnimatePresence initial={false}>
            <motion.div
              key={`c-${index}`}
              className="absolute inset-0"
              {...slide}
            >
              {renderPhone({ screen: center, offset: 0, index })}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="absolute right-[6%] z-[1] w-[38%] max-w-[200px] -translate-y-1 scale-[0.82] opacity-55 transition-[opacity] duration-200">
          {renderPhone({
            screen: right,
            offset: 1,
            index: (index + 1) % n,
          })}
        </div>
      </div>

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
  );
}
