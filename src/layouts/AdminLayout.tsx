import { useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { Outlet, useLocation } from "react-router-dom"
import { Toaster } from "@/components/ui/toaster"
import { AgentChatWidget } from "@/components/agent/AgentChatWidget"

function SidebarMobileCloser() {
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [location.pathname, isMobile, setOpenMobile])

  return null
}

export default function AdminLayout() {
  const location = useLocation();

  // Get an array of path segments
  const pathSegments = location.pathname.split("/").filter((segment) => segment);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarMobileCloser />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:px-4">
            <SidebarTrigger className="-ml-1 shrink-0" />
            <Separator orientation="vertical" className="mr-1 hidden h-4 sm:block" />

            {/* Dynamic Breadcrumb */}
            <Breadcrumb className="min-w-0 overflow-hidden">
              <BreadcrumbList className="flex-nowrap overflow-hidden">
                <BreadcrumbItem>
                  <BreadcrumbLink href="/">Home</BreadcrumbLink>
                </BreadcrumbItem>

                {pathSegments.map((segment, index) => {
                  // Build the path dynamically
                  const href = `/${pathSegments.slice(0, index + 1).join("/")}`;
                  const isLast = index === pathSegments.length - 1;

                  return (
                    <span key={href} className="flex items-center">
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage className="truncate max-w-[140px] sm:max-w-none">
                            {decodeURIComponent(segment)}
                          </BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink href={href} className="truncate max-w-[100px] sm:max-w-none">
                            {decodeURIComponent(segment)}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </span>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-2 pb-20 sm:gap-4 sm:pb-4 md:pb-6">
          <Toaster />
          <Outlet />
        </div>
        <AgentChatWidget />
      </SidebarInset>
    </SidebarProvider>
  );
}
