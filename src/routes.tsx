import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";
import LoadingFallback from "./components/LoadingFallback";
import { useAuth } from "@/hooks/useAuth";

const Login = lazy(() => import("./pages/admin/Login"));
const Landing = lazy(() => import("./pages/Landing"));
const Movies = lazy(() => import("./pages/admin/movies/Movies"));
const Car = lazy(() => import("./pages/admin/car/Car"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LifeDashboard = lazy(() => import("./pages/admin/life/LifeDashboard"));
const Timeline = lazy(() => import("./pages/admin/life/Timeline"));
const FinanceDashboard = lazy(() => import("./pages/admin/home/FinanceDashboard"));
const Goals = lazy(() => import("./pages/admin/goals/Goals"));
const Habits = lazy(() => import("./pages/admin/habits/Habits"));
const Travel = lazy(() => import("./pages/admin/travel/Travel"));
const TripDetail = lazy(() => import("./pages/admin/travel/TripDetail"));
const TripInviteAccept = lazy(
  () => import("./pages/admin/travel/TripInviteAccept")
);
const Places = lazy(() => import("./pages/admin/places/Places"));
const Transactions = lazy(() => import("./pages/admin/finance/Transactions"));
const Recurring = lazy(() => import("./pages/admin/finance/Recurring"));
const Dimensions = lazy(() => import("./pages/admin/finance/Dimensions"));
const Budget = lazy(() => import("./pages/admin/finance/Budget"));
const Account = lazy(() => import("./pages/admin/Account"));

const withSuspense = (Component: React.ReactNode) => (
  <Suspense fallback={<LoadingFallback />}>{Component}</Suspense>
);

function LandingEntry() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  if (user) return <Navigate to="/home" replace />;
  return withSuspense(<Landing />);
}

function LoginEntry() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  if (user) return <Navigate to="/home" replace />;
  return withSuspense(<Login />);
}

const TermsPage = lazy(() =>
  import("./pages/legal/LegalPages").then((m) => ({ default: m.TermsPage }))
);
const PrivacyPage = lazy(() =>
  import("./pages/legal/LegalPages").then((m) => ({ default: m.PrivacyPage }))
);
const AboutPage = lazy(() => import("./pages/About"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingEntry />,
  },
  {
    path: "/login",
    element: <LoginEntry />,
  },
  {
    path: "/about",
    element: withSuspense(<AboutPage />),
  },
  {
    path: "/terms",
    element: withSuspense(<TermsPage />),
  },
  {
    path: "/privacy",
    element: withSuspense(<PrivacyPage />),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: "home", element: <LifeDashboard /> },
          { path: "timeline", element: <Timeline /> },
          { path: "account", element: <Account /> },

          { path: "goals", element: <Goals /> },
          { path: "habits", element: <Habits /> },
          { path: "travel", element: <Travel /> },
          {
            path: "travel/invite/:token",
            element: <TripInviteAccept />,
          },
          { path: "travel/:id", element: <TripDetail /> },
          { path: "places", element: <Places /> },

          {
            path: "finance",
            children: [
              { path: "dashboard", element: <FinanceDashboard /> },
              { path: "recurring", element: <Recurring /> },
              { path: "transactions", element: <Transactions /> },
              { path: "dimensions", element: <Dimensions /> },
              { path: "budget", element: <Budget /> },
            ],
          },

          { path: "movies", element: <Movies /> },
          { path: "car", element: <Car /> },
        ],
      },
    ],
  },

  {
    path: "*",
    element: withSuspense(<NotFound />),
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
