import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";
import LoadingFallback from "./components/LoadingFallback";

const Login = lazy(() => import("./pages/admin/Login"));
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
const Places = lazy(() => import("./pages/admin/places/Places"));
const Transactions = lazy(() => import("./pages/admin/finance/Transactions"));
const Recurring = lazy(() => import("./pages/admin/finance/Recurring"));
const Dimensions = lazy(() => import("./pages/admin/finance/Dimensions"));
const Budget = lazy(() => import("./pages/admin/finance/Budget"));


const withSuspense = (Component: React.ReactNode) => (
  <Suspense fallback={<LoadingFallback />}>{Component}</Suspense>
);

const router = createBrowserRouter([
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: withSuspense(<LifeDashboard />) },
          { path: "timeline", element: withSuspense(<Timeline />) },

          { path: "goals", element: withSuspense(<Goals />) },
          { path: "habits", element: withSuspense(<Habits />) },
          { path: "travel", element: withSuspense(<Travel />) },
          { path: "travel/:id", element: withSuspense(<TripDetail />) },
          { path: "places", element: withSuspense(<Places />) },

          {
            path: "finance",
            children: [
              { path: "dashboard", element: withSuspense(<FinanceDashboard />) },
              { path: "recurring", element: withSuspense(<Recurring />) },
              { path: "transactions", element: withSuspense(<Transactions />) },
              { path: "dimensions", element: withSuspense(<Dimensions />) },
              { path: "budget", element: withSuspense(<Budget />) },
            ],
          },

          { path: "movies", element: withSuspense(<Movies />) },
          { path: "car", element: withSuspense(<Car />) },
        ],
      },
    ],
  },

  {
    path: "/login",
    element: withSuspense(<Login />),
  },

  {
    path: "*",
    element: withSuspense(<NotFound />),
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
