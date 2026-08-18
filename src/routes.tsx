import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import LoadingFallback from "./components/LoadingFallback";
import Landing from "./pages/Landing";

const AuthRoot = lazy(() => import("./AuthRoot"));
const QuantoAindaCabePage = lazy(() => import("./pages/QuantoAindaCabe"));
const ProtectedRoute = lazy(() => import("./ProtectedRoute"));
const ExtensionPanel = lazy(() => import("./pages/admin/extension/ExtensionPanel"));
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const LoginEntry = lazy(() => import("./pages/admin/LoginEntry"));
const Movies = lazy(() => import("./pages/admin/movies/Movies"));
const Books = lazy(() => import("./pages/admin/books/Books"));
const Music = lazy(() => import("./pages/admin/music/Music"));
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
const Categories = lazy(() => import("./pages/admin/finance/Categories"));
const Budget = lazy(() => import("./pages/admin/finance/Budget"));
const Account = lazy(() => import("./pages/admin/Account"));

const withSuspense = (Component: React.ReactNode) => (
  <Suspense fallback={<LoadingFallback />}>{Component}</Suspense>
);

/** Landing anônima sem AuthProvider no grafo (LCP). */
function LandingEntry() {
  return <Landing />;
}

const OpsConsole = lazy(() => import("./pages/ops/OpsConsole"));
const TermsPage = lazy(() =>
  import("./pages/legal/LegalPages").then((m) => ({ default: m.TermsPage }))
);
const PrivacyPage = lazy(() =>
  import("./pages/legal/LegalPages").then((m) => ({ default: m.PrivacyPage }))
);
const AboutPage = lazy(() => import("./pages/About"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));

const router = createBrowserRouter([
  {
    path: "/",
    element: <LandingEntry />,
  },
  {
    path: "/invite/:code",
    element: withSuspense(<InviteAccept />),
  },
  {
    path: "/dentro-do-orcamento",
    element: withSuspense(<QuantoAindaCabePage />),
  },
  {
    path: "/quanto-ainda-cabe",
    element: <Navigate to="/dentro-do-orcamento" replace />,
  },
  {
    path: "/cabe-no-mes",
    element: <Navigate to="/dentro-do-orcamento" replace />,
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
    element: withSuspense(<AuthRoot />),
    children: [
      {
        path: "login",
        element: withSuspense(<LoginEntry />),
      },
      {
        element: withSuspense(<ProtectedRoute />),
        children: [
          {
            path: "ops",
            element: withSuspense(<OpsConsole />),
          },
          {
            path: "ext",
            element: withSuspense(<ExtensionPanel />),
          },
          {
            element: withSuspense(<AdminLayout />),
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
              { path: "categories", element: <Categories /> },
              {
                path: "dimensions",
                element: <Navigate to="/finance/categories" replace />,
              },
              { path: "budget", element: <Budget /> },
            ],
          },

          { path: "movies", element: <Movies /> },
          { path: "books", element: <Books /> },
          { path: "music", element: <Music /> },
          { path: "car", element: <Car /> },
        ],
          },
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
