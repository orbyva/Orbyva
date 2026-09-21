import { useEffect, lazy, Suspense } from "react"
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
import { QuickAddExpenseFab } from "@/components/QuickAddExpenseFab"
import { QuickAddHost } from "@/components/QuickAddHost"
import { QuickAddProvider } from "@/hooks/useQuickAdd"
import { OrbProvider, useOrbContext } from "@/hooks/useOrb"
import { GlobalSearch } from "@/components/GlobalSearch"
import { AlertsBell } from "@/components/AlertsBell"
import { MobileBottomNav } from "@/components/MobileBottomNav"
import { LiveWidget } from "@/components/LiveWidget"
import { OfflineBanner } from "@/components/OfflineBanner"
import { useOfflineOutboxSync } from "@/hooks/useOfflineOutboxSync"
import { useDocumentMeta } from "@/hooks/useDocumentMeta"
import { BREADCRUMB_LABELS } from "@/lib/brand"
import { looksLikeId } from "@/lib/ids"
import { usePlan } from "@/hooks/usePlan"
import {
  BreadcrumbTitleProvider,
  useBreadcrumbTitleValue,
} from "@/hooks/useBreadcrumbTitle"
import { ActiveTimerProvider } from "@/hooks/useActiveTimer"
import LoadingFallback from "@/components/LoadingFallback"
import { PageSkeleton } from "@/components/PageSkeleton"

/**
 * O tray de confirmação da Orb (feature 100, Onda 5) entra por `lazy`: ele arrasta o
 * `src/api/orbActions` — e com ele as funções de gravação de tarefa, nota, compra e projeto — e
 * este layout é carregado em TODA página. Enquanto não existe proposta pendente, o chunk nem é
 * baixado.
 */
const OrbProposalTray = lazy(() => import("@/components/orb/OrbProposalTray"))

function OrbProposalTrayHost() {
  const orb = useOrbContext()
  // Só a existência de proposta decide o carregamento do chunk; ONDE o tray aparece é regra dele.
  if (!orb || orb.pendingProposals.length === 0) return null
  return (
    <Suspense fallback={null}>
      <OrbProposalTray />
    </Suspense>
  )
}

function breadcrumbLabel(segment: string, override: string | null): string {
  if (override) return override
  if (looksLikeId(segment)) return "…"
  return BREADCRUMB_LABELS[segment] ?? decodeURIComponent(segment)
}

function OfflineOutboxHost() {
  const { pending } = useOfflineOutboxSync()
  return <OfflineBanner pendingCount={pending} />
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

  // Pré-carrega chunks de Conteúdo para troca Cinema↔Livros↔Música sem flash.
  useEffect(() => {
    if (!hasAccess) return

    let cancelled = false
    const prefetch = () => {
      if (cancelled) return
      void import("@/pages/admin/movies/Movies")
      void import("@/pages/admin/books/Books")
      void import("@/pages/admin/music/Music")
    }

    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(prefetch)
    } else {
      timeoutId = setTimeout(prefetch, 300)
    }

    return () => {
      cancelled = true
      if (
        idleId != null &&
        typeof window.cancelIdleCallback === "function"
      ) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId != null) clearTimeout(timeoutId)
    }
  }, [hasAccess])

  const segment =
    location.pathname.split("/").filter(Boolean).slice(-1)[0] ?? "home"
  useDocumentMeta({
    title: BREADCRUMB_LABELS[segment] ?? "App",
    description: "Orbyva · sua vida em uma só órbita.",
    path: location.pathname,
    brandSuffix: true,
  })

  // Só bloqueia no carregamento inicial; refresh de plano não desmonta modais
  if (planLoading && !profile) {
    return <LoadingFallback />
  }

  if (!hasAccess && !onAccount) {
    return <Navigate to="/account?trial=expired" replace />
  }

  return (
    <QuickAddProvider>
    {/* A conversa da Orb vive ACIMA do `Outlet` (feature 100): ela navega, e um estado dentro da
        página seria destruído pela navegação que ela mesma pediu. */}
    <OrbProvider>
    <SidebarProvider>
      <AppSidebar />
      <SidebarMobileCloser />
      <BreadcrumbTitleProvider>
      <ActiveTimerProvider>
        <SidebarInset>
          <OfflineOutboxHost />
          {isTrialActive && trialDaysLeft <= 2 && !onAccount ? (
            <div
              className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs sm:px-4 sm:text-sm ${
                trialDaysLeft <= 1
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100"
                  : "border-sky-500/20 bg-sky-500/10 text-foreground"
              }`}
            >
              <p>
                {trialDaysLeft <= 1
                  ? "Último dia do teste: assine o Pro para não perder o acesso."
                  : `Teste acaba em ${trialDaysLeft} dias. Vale ativar orçamento e recorrências agora.`}
              </p>
              <Link
                to="/account"
                className="shrink-0 font-medium underline-offset-2 hover:underline"
              >
                Ver plano
              </Link>
            </div>
          ) : null}
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 sm:h-14">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 sm:px-4">
              <SidebarTrigger className="-ml-1 shrink-0" />
              <Separator
                orientation="vertical"
                className="mr-1 hidden h-4 sm:block"
              />

              <AdminBreadcrumb />
              <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
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
          <div className="flex flex-1 flex-col gap-1.5 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] sm:gap-4 md:pb-6">
            <Toaster />
            {hasAccess ? <OnboardingDialog /> : null}
            {hasAccess ? <QuickAddExpenseFab /> : null}
            {hasAccess ? <QuickAddHost /> : null}
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
          {hasAccess ? <MobileBottomNav /> : null}
          {hasAccess ? <LiveWidget /> : null}
          {hasAccess ? <OrbProposalTrayHost /> : null}
        </SidebarInset>
      </ActiveTimerProvider>
      </BreadcrumbTitleProvider>
    </SidebarProvider>
    </OrbProvider>
    </QuickAddProvider>
  )
}
