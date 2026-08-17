import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

export type LandingNavItem = {
  href: string;
  label: string;
};

type LandingNavProps = {
  items: readonly LandingNavItem[];
  className?: string;
};

const SCROLL_MS = 1100;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function scrollToY(targetY: number, durationMs: number, signal: { cancelled: boolean }) {
  const startY = window.scrollY;
  const delta = targetY - startY;
  if (Math.abs(delta) < 2) return;
  const start = performance.now();

  const tick = (now: number) => {
    if (signal.cancelled) return;
    const t = Math.min(1, (now - start) / durationMs);
    window.scrollTo(0, startY + delta * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

/**
 * Nav pill da landing: indicador CSS + scroll suave ao clicar.
 * Sem framer-motion no first paint (LCP da home).
 */
export function LandingNav({ items, className }: LandingNavProps) {
  const [active, setActive] = useState(items[0]?.href ?? "");
  const scrollSignal = useRef({ cancelled: false });

  useEffect(() => {
    const ids = items
      .map((item) => item.href.replace(/^#/, ""))
      .filter(Boolean);
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0)
          );
        const top = visible[0]?.target.id;
        if (top) setActive(`#${top}`);
      },
      { rootMargin: "-28% 0px -55% 0px", threshold: [0.15, 0.35, 0.55] }
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    return () => {
      scrollSignal.current.cancelled = true;
    };
  }, []);

  const onNavClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const id = href.replace(/^#/, "");
    const el = document.getElementById(id);
    if (!el) return;
    setActive(href);
    history.replaceState(null, "", href);

    const headerOffset = 72;
    const top =
      el.getBoundingClientRect().top + window.scrollY - headerOffset;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion) {
      window.scrollTo(0, top);
      return;
    }

    scrollSignal.current.cancelled = true;
    scrollSignal.current = { cancelled: false };
    scrollToY(top, SCROLL_MS, scrollSignal.current);
  };

  return (
    <nav
      className={cn(
        "hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur-md md:flex",
        className
      )}
      aria-label="Seções"
    >
      {items.map((item) => {
        const isActive = active === item.href;
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavClick(item.href)}
            className={cn(
              "relative rounded-full px-3.5 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-white/10 text-white ring-1 ring-white/10"
                : "text-zinc-400 hover:text-zinc-100"
            )}
            aria-current={isActive ? "true" : undefined}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
