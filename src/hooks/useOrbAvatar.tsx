import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchActiveOrbAvatar } from "@/api/orbAvatars";

export type OrbAvatarState = { url: string | null; refresh: () => void };

const SEM_AVATAR: OrbAvatarState = { url: null, refresh: () => undefined };

// eslint-disable-next-line react-refresh/only-export-components -- contexto exportado para os testes injetarem a URL
export const OrbAvatarContext = createContext<OrbAvatarState>(SEM_AVATAR);

/**
 * A versão ativa da Orb (feature 154), buscada uma vez por sessão. Fica dentro do `OrbProvider`, acima
 * do `Outlet`: a esfera aparece em toda página, e buscar por render seria uma consulta por navegação.
 * Erro é silenciado de propósito — sem URL, a esfera CSS de sempre é o fallback.
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

/** Sem provider (teste solto, página pública) devolve `{ url: null }` e a esfera é a CSS. */
// eslint-disable-next-line react-refresh/only-export-components -- hook irmão do provider
export function useOrbAvatar(): OrbAvatarState {
  return useContext(OrbAvatarContext);
}
