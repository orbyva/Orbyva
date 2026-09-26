import { useEffect, useState } from "react";

/**
 * `true` enquanto a media query casar — reagindo a redimensionamento, rotação e mudança de janela.
 *
 * Irmão genérico do `useIsMobile` (que fixa um breakpoint só). Existe desde a 068, onde o modo
 * "Dividido" do editor de notas **não pode** ser só `hidden lg:block`: a aba precisa não existir
 * abaixo de `lg`, senão ela continua navegável por teclado e selecionável, mostrando duas colunas
 * espremidas numa tela onde a decisão da feature diz que elas não cabem.
 *
 * Ambiente sem `matchMedia` (jsdom sem stub, SSR) devolve `false` em vez de quebrar: o caminho
 * seguro é o layout de tela pequena.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
