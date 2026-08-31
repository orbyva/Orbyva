import { useEffect, useState } from "react";

/**
 * `true` quando o app está no tema escuro.
 *
 * O tema do app é a classe `dark` no `<html>` (é assim que `nav-user.tsx` o guarda), sem contexto
 * de React para assinar — daí o `MutationObserver`: alternar o tema re-renderiza quem depende
 * disso, em vez de deixar um desenho claro num fundo escuro.
 *
 * Nasceu privado dentro do `MermaidBlock` (057) e virou hook quando o canvas (058) precisou do
 * mesmo sinal.
 */
export function useIsDarkTheme(): boolean {
  const [isDark, setIsDark] = useState(readDarkTheme);

  useEffect(() => {
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));
    const observer = new MutationObserver(() =>
      setIsDark(root.classList.contains("dark"))
    );
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

function readDarkTheme(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}
