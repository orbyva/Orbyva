import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";

import ProtectedRoute from "./ProtectedRoute";
import LoadingFallback from "./components/LoadingFallback";
import { useAuth } from "@/hooks/useAuth";

const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const Login = lazy(() => import("./pages/admin/Login"));
const Landing = lazy(() => import("./pages/Landing"));
const Movies = lazy(() => import("./pages/admin/movies/Movies"));
const Links = lazy(() => import("./pages/admin/content/Links"));
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
const TaskList = lazy(() => import("./pages/admin/tasks/TaskList"));
const TaskProjects = lazy(() => import("./pages/admin/tasks/Projects"));
const TaskProjectDetail = lazy(() => import("./pages/admin/tasks/ProjectDetail"));
const TasksLive = lazy(() => import("./pages/admin/tasks/Live"));
const TasksAgenda = lazy(() => import("./pages/admin/tasks/AgendaCalendar"));
const TasksTags = lazy(() => import("./pages/admin/tasks/Tags"));
const ShoppingList = lazy(() => import("./pages/admin/shopping/ShoppingList"));
const Notes = lazy(() => import("./pages/admin/notes/Notes"));
const NoteDetail = lazy(() => import("./pages/admin/notes/NoteDetail"));

const withSuspense = (Component: React.ReactNode) => (
  <Suspense fallback={<LoadingFallback />}>{Component}</Suspense>
);

/** Não bloqueia o first paint anônimo esperando auth. */
function LandingEntry() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/home" replace />;
  return withSuspense(<Landing />);
}

function LoginEntry() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  if (user) return <Navigate to="/home" replace />;
  return withSuspense(<Login />);
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

/** Exportado para os testes conseguirem resolver uma URL sem subir o browser router. */
export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <LandingEntry />,
  },
  {
    path: "/login",
    element: <LoginEntry />,
  },
  {
    path: "/invite/:code",
    element: withSuspense(<InviteAccept />),
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
        path: "ops",
        element: withSuspense(<OpsConsole />),
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
            path: "tasks",
            children: [
              { index: true, element: <TaskList /> },
              { path: "projects", element: <TaskProjects /> },
              { path: "projects/:id", element: <TaskProjectDetail /> },
              // `/tasks/gantt` (`TasksGantt.tsx`) foi removida na feature 044: rota separada, sem
              // link em nenhum lugar do app (nem sidebar — `app-sidebar.tsx` só lista `/tasks` e
              // `/tasks/projects` — nem em nenhuma outra página), redundante com a aba "Gantt" já
              // existente aqui dentro de `/tasks` (`TaskList.tsx`), e sem paridade de props
              // interativas (sem `onOpenTask`/quick actions) — corrigir isso teria sido manter duas
              // implementações do mesmo Gantt em paridade. `?view=gantt` seleciona a aba direto.
              { path: "gantt", element: <Navigate to="/tasks?view=gantt" replace /> },
              { path: "live", element: <TasksLive /> },
              { path: "agenda", element: <TasksAgenda /> },
              { path: "tags", element: <TasksTags /> },
            ],
          },

          { path: "shopping-list", element: <ShoppingList /> },

          {
            path: "notes",
            children: [
              { index: true, element: <Notes /> },
              { path: ":id", element: <NoteDetail /> },
            ],
          },

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
          { path: "links", element: <Links /> },
          { path: "car", element: <Car /> },
        ],
      },
    ],
  },

  {
    path: "*",
    element: withSuspense(<NotFound />),
  },
];

const router = createBrowserRouter(appRoutes);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
