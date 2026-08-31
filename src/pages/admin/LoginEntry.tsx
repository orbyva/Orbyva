import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import LoadingFallback from "@/components/LoadingFallback";
import { useAuth } from "@/hooks/useAuth";
import { safeNextPath } from "@/lib/nextPath";

const Login = lazy(() => import("./Login"));

export default function LoginEntry() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  if (loading) return <LoadingFallback />;
  // Quem já está logado e cai em `/login?next=...` (link de convite aberto numa aba com sessão)
  // vai direto para o destino, em vez de perder o link no dashboard. `safeNextPath` barra open
  // redirect e, ao contrário da lista fixa `/home`|`/ext`, deixa passar os deep-links de
  // convite (`/events/invite/<token>`) que a 076 depende.
  if (user) {
    return <Navigate to={safeNextPath(searchParams.get("next"))} replace />;
  }
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Login />
    </Suspense>
  );
}
