import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Flame, Home, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { fetchAppAlerts, type AppAlert } from "@/api/alerts";
import { getEnabledAlertKinds } from "@/lib/browserNotify";
import { cn } from "@/lib/utils";

function severityDot(severity: AppAlert["severity"]) {
  if (severity === "danger") return "bg-destructive";
  if (severity === "warning") return "bg-amber-500";
  return "bg-muted-foreground";
}

export function MobileBottomNav() {
  const location = useLocation();
  const [alertsOpen, setAlertsOpen] = useState(false);
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
  const isHabits = location.pathname.startsWith("/habits");
  const isTx = location.pathname.startsWith("/finance/transactions");

  return (
    <>
      <nav
        aria-label="Atalhos do dia"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto grid h-14 max-w-lg grid-cols-4 items-end px-1">
          <Link
            to="/home"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 pb-2 pt-1.5 text-[10px] font-medium",
              isHome ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Home className="h-5 w-5" />
            Início
          </Link>

          <Link
            to="/habits"
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 pb-2 pt-1.5 text-[10px] font-medium",
              isHabits ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Flame className="h-5 w-5" />
            Hábitos
          </Link>

          <Link
            to="/finance/transactions?new=1"
            className="flex flex-col items-center justify-center gap-0.5 pb-1.5 text-[10px] font-medium text-muted-foreground"
            aria-label="Nova transação"
          >
            <span
              className={cn(
                "mb-0.5 flex h-11 w-11 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md",
                isTx && "ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
              )}
            >
              <Plus className="h-5 w-5" />
            </span>
            Nova
          </Link>

          <button
            type="button"
            onClick={() => setAlertsOpen(true)}
            className="relative flex flex-col items-center justify-center gap-0.5 pb-2 pt-1.5 text-[10px] font-medium text-muted-foreground"
          >
            <span className="relative">
              <Bell className="h-5 w-5" />
              {unread > 0 ? (
                <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-semibold text-destructive-foreground">
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </span>
            Alertas
          </button>
        </div>
      </nav>

      <Sheet open={alertsOpen} onOpenChange={setAlertsOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl md:hidden">
          <SheetHeader>
            <SheetTitle>Alertas</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2 overflow-y-auto pb-6">
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
