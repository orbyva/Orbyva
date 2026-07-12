import * as React from "react"
import {
  LayoutDashboard,
  PiggyBank,
  Target,
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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();

const data = {
  user: {
    name: user?.user_metadata?.full_name || "Usuário Anônimo",
    email: user?.email || "sem-email@example.com",
    avatar: user?.user_metadata?.avatar_url || "/default-avatar.png",
  },
  navMain: [
    {
      title: "Início",
      color: moduleColors.finance,
      url: "#",
      icon: LayoutDashboard,
      isActive: true,
      items: [
        { title: "Dashboard", url: "/" },
        { title: "Timeline", url: "/timeline" },
      ],
    },
    {
      title: "Finanças",
      color: moduleColors.finance,
      url: "#",
      icon: PiggyBank,
      isActive: true,
      items: [
        { title: "Dashboard", url: "/finance/dashboard" },
        { title: "Dimensões", url: "/finance/dimensions" },
        { title: "Orçamento", url: "/finance/budget" },
        { title: "Parcelas", url: "/finance/recurring" },
        { title: "Transações", url: "/finance/transactions" },
      ],
    },
    {
      title: "Vida",
      color: moduleColors.life,
      url: "#",
      icon: Target,
      isActive: true,
      items: [
        { title: "Casa", url: "/home" },
        { title: "Filmes", url: "/movies" },
        { title: "Hábitos", url: "/habits" },
        { title: "Lugares", url: "/places" },
        { title: "Metas", url: "/goals" },
        { title: "Meu Carro", url: "/car" },
        { title: "Viagens", url: "/travel" },
      ],
    },
  ],
}


  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
