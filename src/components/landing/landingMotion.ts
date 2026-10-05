/** Motion compartilhado da landing, framer-motion + reduced-motion.
 * Só opacity: translateY + overflow nos ancestrais corta descendentes (g, y).
 */

const landingEase = [0.32, 0.72, 0, 1] as const;

/**
 * O reveal dispara ANTES de o elemento entrar na tela (margem positiva embaixo). Com margem
 * negativa o bloco já estava visível, vazio, quando o fade começava — rolar a página fazia texto e
 * cards piscarem. Todo reveal da landing passa por aqui para não voltar a ter margens diferentes
 * por seção.
 */
export const REVEAL_VIEWPORT = {
  once: true,
  margin: "0px 0px 200px 0px",
} as const;

export function reveal(delay = 0, duration = 0.55) {
  return {
    initial: { opacity: 0 },
    whileInView: { opacity: 1 },
    viewport: REVEAL_VIEWPORT,
    transition: { duration, ease: landingEase, delay },
  };
}

export const fadeUp = reveal();

export const fadeUpSlow = reveal(0, 0.65);

export function staggerDelay(index: number, step = 0.05, cap = 0.2) {
  return Math.min(index * step, cap);
}
