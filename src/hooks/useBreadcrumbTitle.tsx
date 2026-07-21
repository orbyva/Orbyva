import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

type BreadcrumbTitleContextValue = {
  title: string | null;
  setTitle: (title: string | null) => void;
};

const BreadcrumbTitleContext = createContext<BreadcrumbTitleContextValue>({
  title: null,
  setTitle: () => {},
});

export function BreadcrumbTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    setTitle(null);
  }, [location.pathname]);

  const value = useMemo(() => ({ title, setTitle }), [title]);

  return (
    <BreadcrumbTitleContext.Provider value={value}>
      {children}
    </BreadcrumbTitleContext.Provider>
  );
}

export function useBreadcrumbTitleValue() {
  return useContext(BreadcrumbTitleContext).title;
}

/** Define o rótulo do último segmento do breadcrumb (ex.: nome da viagem). */
export function useBreadcrumbTitle(title: string | null | undefined) {
  const { setTitle } = useContext(BreadcrumbTitleContext);

  useEffect(() => {
    setTitle(title?.trim() ? title.trim() : null);
    return () => setTitle(null);
  }, [title, setTitle]);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function looksLikeId(segment: string): boolean {
  return UUID_RE.test(segment);
}
