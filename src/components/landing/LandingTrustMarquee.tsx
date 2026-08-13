import { cn } from "@/lib/utils";

/** Marquee no espírito Cult UI, faixa de confiança sem cards. */
export function LandingTrustMarquee({
  items,
  className,
}: {
  items: readonly string[];
  className?: string;
}) {
  const loop = [...items, ...items];

  return (
    <div
      className={cn(
        "landing-marquee relative overflow-hidden border-y border-white/8 bg-white/[0.02]",
        className
      )}
    >
      <div className="landing-marquee-track flex w-max items-center gap-10 py-6 pr-10">
        {loop.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="flex shrink-0 items-center gap-10 text-sm text-zinc-400"
          >
            <span className="whitespace-nowrap">{item}</span>
            <span
              aria-hidden
              className="h-1 w-1 rounded-full bg-sky-400/60"
            />
          </span>
        ))}
      </div>
    </div>
  );
}
