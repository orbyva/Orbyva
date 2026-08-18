import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import LoadingFallback from "./components/LoadingFallback";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading)
    return <LoadingFallback />

  if (!user) {
    const next =
      location.pathname === "/ext" ? "/login?next=/ext" : "/login";
    return <Navigate to={next} replace />;
  }

  return <Outlet />;
}
