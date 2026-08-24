import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type OrbContextValue = {
  open: boolean;
  openOrb: () => void;
  closeOrb: () => void;
  toggleOrb: () => void;
};

const OrbContext = createContext<OrbContextValue | null>(null);

export function OrbProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openOrb = useCallback(() => setOpen(true), []);
  const closeOrb = useCallback(() => setOpen(false), []);
  const toggleOrb = useCallback(() => setOpen((prev) => !prev), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key === ".";
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ open, openOrb, closeOrb, toggleOrb }),
    [open, openOrb, closeOrb, toggleOrb]
  );

  return <OrbContext.Provider value={value}>{children}</OrbContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook paired with provider
export function useOrb(): OrbContextValue {
  const ctx = useContext(OrbContext);
  if (!ctx) throw new Error("useOrb must be used within OrbProvider");
  return ctx;
}
