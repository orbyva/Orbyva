/** Transição de reordenação (DnD) — respeitar reduced-motion no call site. */
export const LIST_LAYOUT_TRANSITION = {
  type: "spring" as const,
  stiffness: 420,
  damping: 36,
  mass: 0.85,
};
