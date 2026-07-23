type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const LEGACY_FUNNEL_KEY = "fintrack_funnel_v1";
const FUNNEL_KEY = "orbyva_funnel_v1";

type FunnelEntry = { event: string; at: string; props?: AnalyticsProps };

function migrateFunnelKey() {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem(FUNNEL_KEY)) return;
    const legacy = localStorage.getItem(LEGACY_FUNNEL_KEY);
    if (legacy) {
      localStorage.setItem(FUNNEL_KEY, legacy);
      localStorage.removeItem(LEGACY_FUNNEL_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readFunnel(): FunnelEntry[] {
  migrateFunnelKey();
  try {
    const raw = localStorage.getItem(FUNNEL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as FunnelEntry[]) : [];
  } catch {
    return [];
  }
}

function writeFunnel(events: FunnelEntry[]) {
  try {
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(events.slice(-100)));
  } catch {
    // ignore quota
  }
}

function posthogDistinctId(): string {
  try {
    const existing = localStorage.getItem("orbyva_distinct_id");
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `anon_${Date.now()}`;
    localStorage.setItem("orbyva_distinct_id", id);
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
}

/** Envia para PostHog Capture API se `VITE_POSTHOG_KEY` estiver definida. */
function sendPostHog(event: string, props?: AnalyticsProps) {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  if (!apiKey || typeof window === "undefined") return;

  const host = (
    import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com"
  ).replace(/\/$/, "");

  const body = {
    api_key: apiKey,
    event,
    distinct_id: posthogDistinctId(),
    properties: {
      ...props,
      $lib: "orbyva-lite",
      path: window.location.pathname,
    },
    timestamp: new Date().toISOString(),
  };

  const url = `${host}/capture/`;
  const payload = JSON.stringify(body);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }
  } catch {
    /* fall through */
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * Analytics de funil: localStorage + PostHog (opcional) + Sentry breadcrumb.
 * Defina `VITE_POSTHOG_KEY` (e opcional `VITE_POSTHOG_HOST`) para enviar fora do browser.
 */
export function track(event: string, props?: AnalyticsProps) {
  const entry = { event, at: new Date().toISOString(), props };
  const events = readFunnel();
  events.push(entry);
  writeFunnel(events);

  if (import.meta.env.DEV) {
    console.info("[analytics]", event, props ?? {});
  }

  sendPostHog(event, props);

  void import("@/lib/sentry")
    .then(({ addAnalyticsBreadcrumb }) => {
      addAnalyticsBreadcrumb(event, props);
    })
    .catch(() => undefined);
}

export function identifyAnalytics(userId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("orbyva_distinct_id", userId);
  } catch {
    /* ignore */
  }
}

export function getFunnelEvents() {
  return readFunnel();
}
