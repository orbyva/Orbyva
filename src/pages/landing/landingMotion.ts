/** Motion compartilhado da landing — framer-motion + reduced-motion. */

export const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-40px" as const },
  transition: { duration: 0.4 },
};

export const fadeUpSlow = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-50px" as const },
  transition: { duration: 0.45 },
};

export function staggerDelay(index: number, step = 0.05, cap = 0.2) {
  return Math.min(index * step, cap);
}
