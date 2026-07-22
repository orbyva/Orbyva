import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fetchAppAlerts, type AppAlert } from "@/api/alerts";
import {
  getEnabledAlertKinds,
  isBrowserNotifyEnabled,
  maybeNotifyCriticalAlerts,
  requestBrowserNotifyPermission,
  setBrowserNotifyEnabled,
} from "@/lib/browserNotify";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "fintrack.alerts.dismissed";

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
}

export function AlertsBell() {
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifyOn, setNotifyOn] = useState(() => isBrowserNotifyEnabled());
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const [kindTick, setKindTick] = useState(0);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    try {
      const data = await fetchAppAlerts();
      setAlerts(data);
      const enabled = getEnabledAlertKinds();
      const critical = data.filter(
        (a) => a.severity === "danger" && enabled.has(a.kind)
      ).length;
      maybeNotifyCriticalAlerts(critical);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Cache TTL ~90s; poll menos agressivo
    const id = window.setInterval(() => void load({ soft: true }), 3 * 60 * 1000);
    const syncPrefs = () => {
      setKindTick((t) => t + 1);
      setNotifyOn(isBrowserNotifyEnabled());
    };
    window.addEventListener("fintrack-alert-prefs", syncPrefs);
    window.addEventListener("storage", syncPrefs);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("fintrack-alert-prefs", syncPrefs);
      window.removeEventListener("storage", syncPrefs);
    };
  }, [load]);

  const visible = useMemo(() => {
    const enabled = getEnabledAlertKinds();
    void kindTick;
    return alerts.filter(
      (a) => enabled.has(a.kind) && !dismissed.has(a.id)
    );
  }, [alerts, dismissed, kindTick]);

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  }

  function clearDismissed() {
    setDismissed(new Set());
    writeDismissed(new Set());
  }

  async function toggleNotify() {
    if (!notifyOn) {
      const permission = await requestBrowserNotifyPermission();
      if (permission !== "granted") return;
      setBrowserNotifyEnabled(true);
      setNotifyOn(true);
      return;
    }
    setBrowserNotifyEnabled(false);
    setNotifyOn(false);
  }

  const dangerCount = visible.filter((a) => a.severity === "danger").length;
  const hasHidden = dismissed.size > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label="Alertas"
        >
          <Bell className="h-4 w-4" />
          {dangerCount > 0 ? (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {dangerCount > 9 ? "9+" : dangerCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Alertas</p>
          <div className="flex items-center gap-1">
            {hasHidden ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearDismissed}
              >
                Restaurar
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={toggleNotify}
            >
              {notifyOn ? "Notif. on" : "Ativar notif."}
            </Button>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Carregando...
            </p>
          ) : visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nada urgente por agora.
            </p>
          ) : (
            <ul className="divide-y">
              {visible.map((alert) => (
                <li key={alert.id} className="flex items-start gap-1">
                  <Link
                    to={alert.href}
                    className="min-w-0 flex-1 px-3 py-2.5 hover:bg-muted/60"
                  >
                    <p
                      className={cn(
                        "text-sm font-medium",
                        alert.severity === "danger" && "text-destructive",
                        alert.severity === "warning" && "text-warning"
                      )}
                    >
                      {alert.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {alert.message}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-1.5 mr-1 h-7 w-7 shrink-0 text-muted-foreground"
                    aria-label="Dispensar alerta"
                    onClick={() => dismiss(alert.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
