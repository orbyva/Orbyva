import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance } from "react-native";

import { secureStoreAdapter } from "@/lib/secure-store";

export type ThemeScheme = "light" | "dark";

const THEME_KEY = "orbyva.theme";

type ThemePreferenceState = {
  scheme: ThemeScheme;
  ready: boolean;
  setScheme: (scheme: ThemeScheme) => void;
  toggleScheme: () => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceState | null>(null);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ThemeScheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void secureStoreAdapter.getItem(THEME_KEY).then((stored) => {
      if (cancelled) return;
      if (stored === "dark" || stored === "light") {
        setSchemeState(stored);
        Appearance.setColorScheme(stored);
      } else {
        Appearance.setColorScheme("light");
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void secureStoreAdapter.setItem(THEME_KEY, scheme);
    Appearance.setColorScheme(scheme);
  }, [ready, scheme]);

  const setScheme = useCallback((next: ThemeScheme) => {
    setSchemeState(next);
  }, []);

  const toggleScheme = useCallback(() => {
    setSchemeState((cur) => (cur === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({ scheme, ready, setScheme, toggleScheme }),
    [ready, scheme, setScheme, toggleScheme]
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceState {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) {
    throw new Error("useThemePreference precisa do ThemePreferenceProvider.");
  }
  return ctx;
}

export function useOptionalThemeScheme(): ThemeScheme {
  const ctx = useContext(ThemePreferenceContext);
  return ctx?.scheme ?? "light";
}
