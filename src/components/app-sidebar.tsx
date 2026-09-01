import * as React from "react"
import {
  Bookmark,
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
    { title: "Transações", url: "/finance/transactions" },
    { title: "Recorrências", url: "/finance/recurring" },
    { title: "Orçamento", url: "/finance/budget" },
    { title: "Categorias", url: "/finance/categories" },
  ],
}

const NAV_CONTEUDO: NavItem = {
  title: "Conteúdo",
  color: moduleColors.entertainment,
  url: "#",
  icon: Bookmark,
  items: [
    { title: "Cinema", url: "/movies" },
    { title: "Livros", url: "/books" },
    { title: "Música", url: "/music" },
    { title: "Links", url: "/links" },
  ],
}

const NAV_VIDA: NavItem = {
  title: "Vida",
  color: moduleColors.life,
  url: "#",
  icon: Target,
  items: [
    { title: "Hábitos", url: "/habits" },
    // Feature 071: até aqui só se chegava em `/life/health` pelo card do hub ou pela URL — trocar a
    // criação de medicação de lugar sem isto seria trocar um lugar ruim por um lugar escondido. A
    // posição (logo depois de Hábitos) é a mesma que `HOME_MODULES` já usa no hub.
    { title: "Saúde", url: "/life/health" },
    { title: "Metas", url: "/goals" },
    { title: "Lugares", url: "/places" },
    { title: "Viagens", url: "/travel" },
    { title: "Veículos", url: "/car" },
  ],
}

const NAV_PRODUTIVIDADE: NavItem = {
  title: "Produtividade",
  color: moduleColors.productivity,
  url: "#",
  icon: ListTodo,
  items: [
    { title: "Tarefas", url: "/tasks" },
    { title: "Projetos", url: "/tasks/projects" },
    { title: "Notas", url: "/notes" },
    { title: "Lista de Compras", url: "/shopping-list" },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()

  const navItems = React.useMemo(
    () => [NAV_INICIO, NAV_FINANCE, NAV_PRODUTIVIDADE, NAV_VIDA, NAV_CONTEUDO],
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
