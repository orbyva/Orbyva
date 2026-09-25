import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as Linking from "expo-linking";
import type { User } from "@supabase/supabase-js";

import { createSessionFromUrl } from "@/lib/auth-session";
import { supabase } from "@/lib/supabase";

type AuthState = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.email === b.email;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (cancelled) return;
        const next = session?.user ?? null;
        setUser((prev) => (sameUser(prev, next) ? prev : next));
        setLoading(false);
      }
    );

    const linking = Linking.addEventListener("url", ({ url }) => {
      void createSessionFromUrl(url).catch(() => undefined);
    });

    void Linking.getInitialURL().then((url) => {
      if (url) void createSessionFromUrl(url).catch(() => undefined);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      linking.remove();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return ctx;
}
