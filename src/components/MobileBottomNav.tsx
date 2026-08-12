import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { QuickAddMenu } from "@/components/QuickAddMenu";
import { QuickAddToggleIcon } from "@/components/QuickAddToggleIcon";
import { fetchAppAlerts, APP_ALERTS_UPDATED_EVENT, type AppAlert } from "@/api/alerts";
import { getEnabledAlertKinds } from "@/lib/browserNotify";
import { resolveAppArea, type AppArea } from "@/lib/quickAdd";
import { cn } from "@/lib/utils";

function severityDot(severity: AppAlert["severity"]) {
  if (severity === "danger") return "bg-destructive";
  if (severity === "warning") return "bg-amber-500";
  return "bg-muted-foreground";
}

const AREA_PLUS_CLASS: Record<AppArea, string> = {
  finance: "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
  entertainment:
    "bg-[hsl(var(--cinema))] text-[hsl(var(--cinema-foreground))]",
  life: "bg-[hsl(var(--life))] text-[hsl(var(--life-foreground))]",
  home: "bg-[hsl(var(--hub))] text-[hsl(var(--hub-foreground))]",
};

/**
 * Barra mobile: Início · Nova tx · Alertas.
 * Hábitos ficam no hub, aqui só o atalho diário de ledger + atenção.
 */
export function MobileBottomNav() {
  const location = useLocation();
  const area = resolveAppArea(location.pathname);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      setAlerts(await fetchAppAlerts());
    } finally {
      setLoadingAlerts(false);
    }
  }, []);

  useEffect(() => {
    void fetchAppAlerts().then(setAlerts).catch(() => undefined);
    const onAlertsUpdated = () => {
      void fetchAppAlerts().then(setAlerts).catch(() => undefined);
    };
    window.addEventListener(APP_ALERTS_UPDATED_EVENT, onAlertsUpdated);
    return () => {
      window.removeEventListener(APP_ALERTS_UPDATED_EVENT, onAlertsUpdated);
    };
  }, []);

  useEffect(() => {
    if (alertsOpen) void loadAlerts();
  }, [alertsOpen, loadAlerts]);

  const visibleAlerts = useMemo(() => {
    const enabled = getEnabledAlertKinds();
    return alerts.filter((a) => enabled.has(a.kind));
  }, [alerts]);

  const unread = visibleAlerts.length;

  const isHome =
    location.pathname === "/home" || location.pathname === "/";
  const isTx = location.pathname.startsWith("/finance/transactions");

  return (
    <>
      <nav
        aria-label="Atalhos do dia"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        style={{
          // Safari iOS: safe-area + folga extra (barra do browser sobrescreve o inset às vezes)
          paddingBottom:
            "max(8px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div className="mx-auto grid h-12 max-w-lg grid-cols-3 items-center px-1">
          <Link
            to="/home"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 py-0.5 text-[10px] font-medium",
              isHome ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Home className="h-4 w-4" />
            Início
          </Link>

          <QuickAddMenu
            open={quickAddOpen}
            onOpenChange={setQuickAddOpen}
            area={area}
            source="mobile_nav"
            side="top"
            align="center"
          >
            <button
              type="button"
              className="flex flex-col items-center justify-center gap-0.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              aria-label={quickAddOpen ? "Fechar" : "Adicionar"}
              aria-expanded={quickAddOpen}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full transition-transform duration-200 ease-out",
                  AREA_PLUS_CLASS[area],
                  quickAddOpen && "scale-95",
                  isTx &&
                    "ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                )}
              >
                <QuickAddToggleIcon
                  open={quickAddOpen}
                  iconClassName="h-4 w-4"
                />
              </span>
              <span className="transition-opacity duration-200">
                {quickAddOpen ? "Fechar" : "Nova"}
              </span>
            </button>
          </QuickAddMenu>

          <button
            type="button"
            onClick={() => setAlertsOpen(true)}
            className="relative flex flex-col items-center justify-center gap-0.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            <span className="relative">
              <Bell className="h-4 w-4" />
              {unread > 0 ? (
                <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-semibold text-destructive-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </span>
            Alertas
          </button>
        </div>
      </nav>

      <Sheet open={alertsOpen} onOpenChange={setAlertsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[75vh] rounded-t-2xl md:hidden"
          style={{
            paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <SheetHeader>
            <SheetTitle>Alertas</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2 overflow-y-auto pb-2">
            {loadingAlerts ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : visibleAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum alerta no momento.
              </p>
            ) : (
              visibleAlerts.map((a) => (
                <Link
                  key={a.id}
                  to={a.href}
                  onClick={() => setAlertsOpen(false)}
                  className="flex gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-accent/40"
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      severityDot(a.severity)
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.message}
                    </span>
                  </span>
                </Link>
              ))
            )}
            <Button variant="outline" className="mt-2 w-full" asChild>
              <Link to="/home" onClick={() => setAlertsOpen(false)}>
                Ver painel do dia
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
