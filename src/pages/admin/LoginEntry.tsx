import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import LoadingFallback from "@/components/LoadingFallback";
import { useAuth } from "@/hooks/useAuth";
import { safePostAuthPath } from "@/lib/authRedirect";

const Login = lazy(() => import("./Login"));

export default function LoginEntry() {
  const { user, loading } = useAuth();
  const [searchParams] = useSearchParams();
  if (loading) return <LoadingFallback />;
  if (user) {
    return <Navigate to={safePostAuthPath(searchParams.get("next"))} replace />;
  }
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Login />
    </Suspense>
  );
}
