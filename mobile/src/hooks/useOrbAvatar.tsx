import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchActiveOrbAvatar } from "@/api/orbAvatars";

export type OrbAvatarState = { url: string | null; refresh: () => void };

const SEM_AVATAR: OrbAvatarState = { url: null, refresh: () => undefined };

const OrbAvatarContext = createContext<OrbAvatarState>(SEM_AVATAR);

/**
 * A versão ativa da Orb, buscada uma vez por sessão — a esfera aparece no header de toda tela.
 * Erro é silenciado de propósito: sem URL, a esfera desenhada é o fallback.
 */
export function OrbAvatarProvider({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void fetchActiveOrbAvatar()
      .then((avatar) => setUrl(avatar?.url ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ url, refresh }), [url, refresh]);
  return <OrbAvatarContext.Provider value={value}>{children}</OrbAvatarContext.Provider>;
}

export function useOrbAvatar(): OrbAvatarState {
  return useContext(OrbAvatarContext);
}
