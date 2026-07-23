import { useEffect, Suspense } from "react"
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
import { Link, Navigate, Outlet, useLocation } from "react-router-dom"
import { Toaster } from "@/components/ui/toaster"
import { OnboardingDialog } from "@/components/OnboardingDialog"
import { GlobalSearch } from "@/components/GlobalSearch"
import { AlertsBell } from "@/components/AlertsBell"
import { MobileBottomNav } from "@/components/MobileBottomNav"
import { OfflineBanner } from "@/components/OfflineBanner"
import { BREADCRUMB_LABELS } from "@/lib/brand"
import { usePlan } from "@/hooks/usePlan"
import {
  BreadcrumbTitleProvider,
  looksLikeId,
  useBreadcrumbTitleValue,
} from "@/hooks/useBreadcrumbTitle"
import LoadingFallback from "@/components/LoadingFallback"

function breadcrumbLabel(segment: string, override: string | null): string {
  if (override) return override
  if (looksLikeId(segment)) return "…"
  return BREADCRUMB_LABELS[segment] ?? decodeURIComponent(segment)
}

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

function AdminBreadcrumb() {
  const location = useLocation()
  const crumbTitle = useBreadcrumbTitleValue()
  const pathSegments = location.pathname
    .split("/")
    .filter((segment) => segment)

  return (
    <Breadcrumb className="min-w-0 overflow-hidden">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        <BreadcrumbItem>
          <BreadcrumbLink href="/home">Início</BreadcrumbLink>
        </BreadcrumbItem>

        {pathSegments.map((segment, index) => {
          const href = `/${pathSegments.slice(0, index + 1).join("/")}`
          const isLast = index === pathSegments.length - 1
          const label = breadcrumbLabel(segment, isLast ? crumbTitle : null)

          return (
            <span key={href} className="flex items-center">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="max-w-[140px] truncate sm:max-w-none">
                    {label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    href={href}
                    className="max-w-[100px] truncate sm:max-w-none"
                  >
                    {label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export default function AdminLayout() {
  const location = useLocation()
  const {
    hasAccess,
    isTrialActive,
    trialDaysLeft,
    loading: planLoading,
    profile,
  } = usePlan()

  const onAccount = location.pathname.startsWith("/account")

  // Só bloqueia no carregamento inicial — refresh de plano não desmonta modais
  if (planLoading && !profile) {
    return <LoadingFallback />
  }

  if (!hasAccess && !onAccount) {
    return <Navigate to="/account?trial=expired" replace />
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarMobileCloser />
      <BreadcrumbTitleProvider>
        <SidebarInset>
          <OfflineBanner />
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-3 sm:px-4">
              <SidebarTrigger className="-ml-1 shrink-0" />
              <Separator
                orientation="vertical"
                className="mr-1 hidden h-4 sm:block"
              />

              <AdminBreadcrumb />
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {isTrialActive ? (
                  <Link
                    to="/account"
                    className="mr-1 hidden rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
                  >
                    Teste · {trialDaysLeft}d
                  </Link>
                ) : null}
                <GlobalSearch />
                <div className="hidden md:block">
                  <AlertsBell />
                </div>
              </div>
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-2 pb-24 sm:gap-4 md:pb-6">
            <Toaster />
            {hasAccess ? <OnboardingDialog /> : null}
            <Suspense fallback={<LoadingFallback cover="viewport" />}>
              <Outlet />
            </Suspense>
          </div>
          {hasAccess ? <MobileBottomNav /> : null}
        </SidebarInset>
      </BreadcrumbTitleProvider>
    </SidebarProvider>
  )
}
