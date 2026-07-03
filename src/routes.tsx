import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";
import AdminLayout from "./layouts/AdminLayout";
import LoadingFallback from "./components/LoadingFallback";

const Login = lazy(() => import("./pages/admin/Login"));
const Movies = lazy(() => import("./pages/admin/movies/Movies"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Dashboard = lazy(() => import("./pages/admin/home/Dashboard"));
const Transactions = lazy(() => import("./pages/admin/finance/Transactions"));
const Recurring = lazy(() => import("./pages/admin/finance/Recurring"));
const Dimensions = lazy(() => import("./pages/admin/finance/Dimensions"));
const Budget = lazy(() => import("./pages/admin/finance/Budget"));
const Assistant = lazy(() => import("./pages/admin/finance/Assistant"));


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
          { index: true, element: withSuspense(<Dashboard />) },

          {
            path: "finance",
            children: [
              { path: "dashboard", element: withSuspense(<Dashboard />) },
              { path: "recurring", element: withSuspense(<Recurring />) },
              { path: "transactions", element: withSuspense(<Transactions />) },
              { path: "dimensions", element: withSuspense(<Dimensions />) },
              { path: "budget", element: withSuspense(<Budget />) },
              { path: "assistant", element: withSuspense(<Assistant />) },
            ],
          },

          { path: "movies", element: withSuspense(<Movies />) },
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
