import * as React from "react"
import {
  Clapperboard,
  LayoutDashboard,
  ListTodo,
  PiggyBank,
  Target,
  type LucideIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

import { moduleColors } from "@/lib/design-tokens"
import { useAuth } from "@/hooks/useAuth"

type NavItem = {
  title: string
  url: string
  icon?: LucideIcon
  color?: string
  items?: { title: string; url: string }[]
}

const NAV_INICIO: NavItem = {
  title: "Início",
  color: moduleColors.hub,
  url: "#",
  icon: LayoutDashboard,
  items: [
    { title: "Dashboard", url: "/home" },
    { title: "Timeline", url: "/timeline" },
  ],
}

const NAV_FINANCE: NavItem = {
  title: "Finanças",
  color: moduleColors.finance,
  url: "#",
  icon: PiggyBank,
  items: [
    { title: "Dashboard", url: "/finance/dashboard" },
    { title: "Categorias", url: "/finance/categories" },
    { title: "Orçamento", url: "/finance/budget" },
    { title: "Recorrências", url: "/finance/recurring" },
    { title: "Transações", url: "/finance/transactions" },
  ],
}

const NAV_ENTRETENIMENTO: NavItem = {
  title: "Entretenimento",
  color: moduleColors.entertainment,
  url: "#",
  icon: Clapperboard,
  items: [
    { title: "Cinema", url: "/movies" },
    { title: "Livros", url: "/books" },
    { title: "Música", url: "/music" },
  ],
}

const NAV_VIDA: NavItem = {
  title: "Vida",
  color: moduleColors.life,
  url: "#",
  icon: Target,
  items: [
    { title: "Hábitos", url: "/habits" },
    { title: "Lugares", url: "/places" },
    { title: "Metas", url: "/goals" },
    { title: "Veículos", url: "/car" },
    { title: "Viagens", url: "/travel" },
  ],
}

const NAV_PRODUTIVIDADE: NavItem = {
  title: "Produtividade",
  color: moduleColors.productivity,
  url: "#",
  icon: ListTodo,
  items: [
    { title: "Tarefas", url: "/tasks" },
    { title: "Agenda", url: "/tasks/agenda" },
    { title: "Projetos", url: "/tasks/projects" },
    { title: "Gantt", url: "/tasks/gantt" },
    { title: "Live", url: "/tasks/live" },
    { title: "Tags", url: "/tasks/tags" },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()

  const navItems = React.useMemo(
    () => [NAV_INICIO, NAV_FINANCE, NAV_ENTRETENIMENTO, NAV_VIDA, NAV_PRODUTIVIDADE],
    []
  )

  const navUser = React.useMemo(
    () => ({
      name:
        (user?.user_metadata?.full_name as string | undefined) ||
        "Usuário Anônimo",
      email: user?.email || "sem-email@example.com",
      avatar:
        (user?.user_metadata?.avatar_url as string | undefined) ||
        "/default-avatar.png",
    }),
    [user?.email, user?.user_metadata?.avatar_url, user?.user_metadata?.full_name]
  )

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={navUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
