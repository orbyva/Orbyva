/** Motion compartilhado da landing, framer-motion + reduced-motion.
 * Só opacity: translateY + overflow nos ancestrais corta descendentes (g, y).
 */

const landingEase = [0.32, 0.72, 0, 1] as const;

export const fadeUp = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, margin: "-40px" as const },
  transition: { duration: 0.55, ease: landingEase },
};

export const fadeUpSlow = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true, margin: "-50px" as const },
  transition: { duration: 0.65, ease: landingEase },
};

export function staggerDelay(index: number, step = 0.05, cap = 0.2) {
  return Math.min(index * step, cap);
}
