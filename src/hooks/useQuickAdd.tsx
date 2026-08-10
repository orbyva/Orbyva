import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { QuickAddActionId } from "@/lib/quickAdd";

type QuickAddContextValue = {
  activeAction: QuickAddActionId | null;
  openAction: (id: QuickAddActionId) => void;
  closeAction: () => void;
};

const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [activeAction, setActiveAction] = useState<QuickAddActionId | null>(
    null
  );

  const openAction = useCallback((id: QuickAddActionId) => {
    setActiveAction(id);
  }, []);

  const closeAction = useCallback(() => {
    setActiveAction(null);
  }, []);

  const value = useMemo(
    () => ({ activeAction, openAction, closeAction }),
    [activeAction, openAction, closeAction]
  );

  return (
    <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook paired with provider
export function useQuickAdd(): QuickAddContextValue {
  const ctx = useContext(QuickAddContext);
  if (!ctx) {
    throw new Error("useQuickAdd must be used within QuickAddProvider");
  }
  return ctx;
}
