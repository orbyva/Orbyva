import { useCallback, useRef, useState } from "react";
import { FadeInDown, LinearTransition } from "react-native-reanimated";

/** Irmãos cedem lugar com mola quando um item muda de posição. */
export const dragListLayout = LinearTransition.springify()
  .damping(18)
  .stiffness(240)
  .mass(0.75);

/** O item solto entra no destino (queda curta). */
export const dragItemEntering = FadeInDown.springify()
  .damping(15)
  .stiffness(220)
  .mass(0.7);

/** Marca o item recém-solto para remount + entering sem animar a lista toda. */
export function useDropLanding() {
  const gen = useRef(new Map<string, number>());
  const [landedId, setLandedId] = useState<string | null>(null);

  const markLanded = useCallback((id: string) => {
    gen.current.set(id, (gen.current.get(id) ?? 0) + 1);
    setLandedId(id);
  }, []);

  const landingKey = useCallback(
    (id: string) => `${id}-${gen.current.get(id) ?? 0}`,
    [landedId]
  );

  const landingEntering = useCallback(
    (id: string) => (landedId === id ? dragItemEntering : undefined),
    [landedId]
  );

  return { markLanded, landingKey, landingEntering, landedId };
}
