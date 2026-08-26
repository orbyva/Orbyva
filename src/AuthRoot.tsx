import { Outlet } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";

/** Auth só nas rotas que precisam — fora da landing, para não competir com LCP. */
export default function AuthRoot() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
