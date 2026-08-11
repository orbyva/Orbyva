import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import { invalidateAppAlertsCache } from "@/api/alerts";
import { invalidateDimensionsCache } from "@/api/finance/dimensionsCache";
import { identifyAnalytics } from "@/lib/analytics";
import { applyPendingReferral } from "@/api/referral";

type AuthState = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

function sameUser(a: User | null, b: User | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.email === b.email &&
    JSON.stringify(a.user_metadata ?? {}) ===
      JSON.stringify(b.user_metadata ?? {})
  );
}

function clearUserScopedCaches() {
  invalidateAppAlertsCache();
  invalidateDimensionsCache();
  if (typeof localStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k?.startsWith("fintrack_offline_v1:") ||
        k?.startsWith("orbyva_offline_v1:")
      ) {
        keys.push(k);
      }
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Uma única sessão auth para o app — evita N× getUser/onAuthStateChange. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUser(data.user);
      if (data.user) {
        identifyAnalytics(data.user.id);
        void applyPendingReferral().catch(() => undefined);
      }
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return;
        const next = session?.user ?? null;
        setUser((prev) => {
          if (event === "SIGNED_OUT" || (prev && next && prev.id !== next.id)) {
            clearUserScopedCaches();
          }
          if (event === "SIGNED_OUT") return null;
          return sameUser(prev, next) ? prev : next;
        });
        if (next && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
          identifyAnalytics(next.id);
          if (event === "SIGNED_IN") {
            void applyPendingReferral().catch(() => undefined);
          }
        }
        setLoading(false);
      }
    );

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook paired with provider
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return ctx;
}
