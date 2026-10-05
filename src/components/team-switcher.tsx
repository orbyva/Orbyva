import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandWordmark } from "@/components/BrandWordmark";
import { BRAND } from "@/lib/brand";

export function TeamSwitcher() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          aria-label={BRAND.name}
          onClick={() => {
            window.location.href = "/home";
          }}
        >
          <BrandLogo
            variant="favicon"
            className="size-10 shrink-0"
            alt=""
          />
          <BrandWordmark className="grid flex-1" showSubtitle />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
