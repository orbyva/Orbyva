import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FabSize } from "@/constants/theme";

type AppShellState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  alertsOpen: boolean;
  setAlertsOpen: (open: boolean) => void;
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
  bottomInset: number;
};

const AppShellContext = createContext<AppShellState | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const bottomInset = FabSize + 24 + Math.max(insets.bottom, 8);

  const value = useMemo(
    () => ({
      sidebarOpen,
      setSidebarOpen,
      alertsOpen,
      setAlertsOpen,
      quickAddOpen,
      setQuickAddOpen,
      bottomInset,
    }),
    [alertsOpen, bottomInset, quickAddOpen, sidebarOpen]
  );

  return (
    <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>
  );
}

export function useAppShell() {
  const ctx = useContext(AppShellContext);
  if (!ctx) throw new Error("useAppShell precisa do AppShellProvider.");
  return ctx;
}
