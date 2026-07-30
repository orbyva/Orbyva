import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
 * no mobile só o centro — evita crop dos prints.
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

  const go = useCallback(
    (dir: -1 | 1) => {
      if (n < 1) return;
      setIndex((i) => (i + dir + n) % n);
    },
    [n]
  );

  useEffect(() => {
    if (n < 2 || intervalMs <= 0) return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      setIndex((i) => (i + 1) % n);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [n, intervalMs]);

  if (n === 0) return null;

  const left = screens[(index - 1 + n) % n]!;
  const center = screens[index]!;
  const right = screens[(index + 1) % n]!;

  return (
    <div className={cn("relative w-full select-none", className)}>
      {/* Mobile: um phone só, sem peeks que cortam */}
      <div className="relative mx-auto w-full max-w-[260px] sm:hidden">
        <div className="pointer-events-none absolute -inset-6 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative z-[1]">
          {renderPhone({ screen: center, offset: 0, index })}
        </div>
      </div>

      {/* Desktop/tablet: 3-up */}
      <div className="relative mx-auto hidden h-[560px] max-w-xl items-center justify-center sm:flex">
        <div className="pointer-events-none absolute inset-x-[8%] top-1/2 z-0 h-[55%] -translate-y-1/2 rounded-full bg-sky-500/20 blur-3xl" />

        <div className="absolute left-[6%] z-[1] w-[38%] max-w-[200px] -translate-y-1 scale-[0.82] opacity-55">
          {renderPhone({
            screen: left,
            offset: -1,
            index: (index - 1 + n) % n,
          })}
        </div>

        <div className="relative z-[2] w-[46%] max-w-[240px]">
          {renderPhone({ screen: center, offset: 0, index })}
        </div>

        <div className="absolute right-[6%] z-[1] w-[38%] max-w-[200px] -translate-y-1 scale-[0.82] opacity-55">
          {renderPhone({
            screen: right,
            offset: 1,
            index: (index + 1) % n,
          })}
        </div>
      </div>

      {center.label ? (
        <p className="mt-3 text-center text-sm font-medium text-zinc-300">
          {center.label}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-center gap-2">
        <button
          type="button"
          aria-label="Anterior"
          onClick={() => go(-1)}
          className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 transition hover:bg-white/10"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          aria-label={paused ? "Retomar" : "Pausar"}
          onClick={() => setPaused((p) => !p)}
          className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 transition hover:bg-white/10"
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
          className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-200 transition hover:bg-white/10"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
        {screens.map((s, i) => (
          <button
            key={`${s.src}-${i}`}
            type="button"
            aria-label={`Slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
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
