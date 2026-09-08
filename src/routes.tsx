import { lazy, Suspense } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";

import LoadingFallback from "./components/LoadingFallback";
import Landing from "./pages/Landing";

const AuthRoot = lazy(() => import("./AuthRoot"));
const QuantoAindaCabePage = lazy(() => import("./pages/QuantoAindaCabe"));
const ProtectedRoute = lazy(() => import("./ProtectedRoute"));
const ExtensionPanel = lazy(() => import("./pages/admin/extension/ExtensionPanel"));
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const LoginEntry = lazy(() => import("./pages/admin/LoginEntry"));
const Movies = lazy(() => import("./pages/admin/movies/Movies"));
const Links = lazy(() => import("./pages/admin/content/Links"));
const Books = lazy(() => import("./pages/admin/books/Books"));
const Music = lazy(() => import("./pages/admin/music/Music"));
const Car = lazy(() => import("./pages/admin/car/Car"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LifeDashboard = lazy(() => import("./pages/admin/life/LifeDashboard"));
const Timeline = lazy(() => import("./pages/admin/life/Timeline"));
const HealthDashboard = lazy(
  () => import("./pages/admin/life/HealthDashboard")
);
const MedicationList = lazy(
  () => import("./pages/admin/health/MedicationList")
);
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
const TasksLinkIcons = lazy(() => import("./pages/admin/tasks/LinkIconRules"));
const TasksRecurrences = lazy(() => import("./pages/admin/tasks/TaskRecurrences"));
const ShoppingList = lazy(() => import("./pages/admin/shopping/ShoppingList"));
const Notes = lazy(() => import("./pages/admin/notes/Notes"));
const NoteDetail = lazy(() => import("./pages/admin/notes/NoteDetail"));

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
// Convite de evento (feature 076): rota **pública** de propósito — o link chega por e-mail para
// alguém que pode não ter sessão, e um redirect do ProtectedRoute perderia o token. A própria tela
// trata o estado deslogado e leva para `/login?next=<link do convite>`.
const EventInviteAccept = lazy(
  () => import("./pages/admin/tasks/EventInviteAccept")
);

/** Exportado para os testes conseguirem resolver uma URL sem subir o browser router. */
export const appRoutes: RouteObject[] = [
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
      // Convite de evento: dentro do AuthRoot (a tela lê `useAuth`) e **fora** do ProtectedRoute,
      // porque o link chega por e-mail para quem pode não ter sessão.
      {
        path: "/events/invite/:token",
        element: withSuspense(<EventInviteAccept />),
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
              // Sub-módulo Vida > Saúde (feature 060) — hub de primeiro nível, não uma aba do
              // dashboard de Vida, para as telas de 061-064 terem deep-link próprio.
              { path: "life/health", element: <HealthDashboard /> },
              // Gestão dos tratamentos (feature 064) — o dashboard mostra a próxima dose e a adesão;
              // cadastrar, editar e encerrar vivem aqui.
              { path: "life/health/medications", element: <MedicationList /> },
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
                  // link em nenhum lugar do app (nem sidebar — `app-sidebar.tsx` lista `/tasks`,
                  // `/tasks/agenda` e `/tasks/projects`, não esta — nem em nenhuma outra página),
                  // redundante com a aba "Gantt" já
                  // existente aqui dentro de `/tasks` (`TaskList.tsx`), e sem paridade de props
                  // interativas (sem `onOpenTask`/quick actions) — corrigir isso teria sido manter duas
                  // implementações do mesmo Gantt em paridade. `?view=gantt` seleciona a aba direto.
                  { path: "gantt", element: <Navigate to="/tasks?view=gantt" replace /> },
                  { path: "live", element: <TasksLive /> },
                  { path: "agenda", element: <TasksAgenda /> },
                  { path: "tags", element: <TasksTags /> },
                  // Fora da sidebar, como `/tasks/tags`: é configuração do módulo, alcançada pelo
                  // botão "Configurar ícones" da seção de links do formulário e pelo cabeçalho de
                  // `/tasks/tags` (feature 087).
                  { path: "link-icons", element: <TasksLinkIcons /> },
                  // Feature 101: também fora da sidebar, como `tags` e `link-icons`. Quem entra em
                  // Recorrências veio de Tarefas — o botão "Recorrências" do cabeçalho de `/tasks`
                  // é a única porta, e um item fixo na sidebar para uma leitura ocasional só
                  // engordaria o menu.
                  { path: "recurrences", element: <TasksRecurrences /> },
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
