"use client"

import { memo } from "react"
import { ChevronRight, type LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

function isNavItemActive(pathname: string, url: string): boolean {
  if (url === "/") return pathname === "/"
  if (url === "/travel") {
    return pathname === "/travel" || pathname.startsWith("/travel/")
  }
  // "/tasks" tem irmãos mais específicos ("/tasks/projects", "/tasks/live") no mesmo grupo —
  // sem isso, visitar /tasks/projects ativa "Tarefas" e "Projetos" ao mesmo tempo.
  if (url === "/tasks") return pathname === "/tasks"
  return pathname === url || pathname.startsWith(`${url}/`)
}

type NavMainItem = {
  title: string
  url: string
  icon?: LucideIcon
  color?: string
  items?: {
    title: string
    url: string
  }[]
}

function NavMainComponent({ items }: { items: NavMainItem[] }) {
  const { pathname } = useLocation()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Acesso Rápido</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const groupActive =
            item.items?.some((subItem) =>
              isNavItemActive(pathname, subItem.url)
            ) ?? false

          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={groupActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={groupActive}
                    className={cn(groupActive && "font-medium")}
                    style={
                      groupActive && item.color
                        ? {
                            backgroundColor: `color-mix(in srgb, ${item.color} 18%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    {item.icon && (
                      <item.icon
                        className="h-4 w-4"
                        style={item.color ? { color: item.color } : undefined}
                      />
                    )}
                    <span
                      style={item.color ? { color: item.color } : undefined}
                    >
                      {item.title}
                    </span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => {
                      const active = isNavItemActive(pathname, subItem.url)

                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={active}
                            className={cn(
                              active && "font-semibold border-l-2 border-current"
                            )}
                            style={
                              active && item.color
                                ? {
                                    color: item.color,
                                    borderColor: item.color,
                                  }
                                : item.color
                                  ? { color: item.color }
                                  : undefined
                            }
                          >
                            <Link to={subItem.url}>
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

export const NavMain = memo(NavMainComponent)
