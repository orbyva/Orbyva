import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import LoadingFallback from "@/components/LoadingFallback";
import { useAuth } from "@/hooks/useAuth";

const Login = lazy(() => import("./Login"));

export default function LoginEntry() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  if (user) return <Navigate to="/home" replace />;
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Login />
    </Suspense>
  );
}
