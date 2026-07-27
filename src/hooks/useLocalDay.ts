import { useCallback, useEffect, useState } from "react";
import { getTodayIso } from "@/domain/habits";

/**
 * Dia local (YYYY-MM-DD) que atualiza ao voltar pro app / virar a meia-noite.
 * Evita check-in de hábitos “preso” no dia anterior.
 */
export function useLocalDay(): string {
  const [day, setDay] = useState(() => getTodayIso());

  const sync = useCallback(() => {
    const next = getTodayIso();
    setDay((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    sync();

    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    const onFocus = () => sync();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    // Checa a cada minuto — barato e pega virada de dia com o app aberto.
    const id = window.setInterval(sync, 60_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [sync]);

  return day;
}
