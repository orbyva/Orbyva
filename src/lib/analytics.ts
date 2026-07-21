type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

const FUNNEL_KEY = "fintrack_funnel_v1";

function readFunnel(): Array<{ event: string; at: string; props?: AnalyticsProps }> {
  try {
    const raw = localStorage.getItem(FUNNEL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFunnel(
  events: Array<{ event: string; at: string; props?: AnalyticsProps }>
) {
  try {
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(events.slice(-100)));
  } catch {
    // ignore quota
  }
}

/** Analytics leve de funil (local + console em dev). Pronto para plugar PostHog depois. */
export function track(event: string, props?: AnalyticsProps) {
  const entry = { event, at: new Date().toISOString(), props };
  const events = readFunnel();
  events.push(entry);
  writeFunnel(events);

  if (import.meta.env.DEV) {
    console.info("[analytics]", event, props ?? {});
  }

  // Sentry breadcrumb when available
  void import("@/lib/sentry")
    .then(({ addAnalyticsBreadcrumb }) => {
      addAnalyticsBreadcrumb(event, props);
    })
    .catch(() => undefined);
}

export function getFunnelEvents() {
  return readFunnel();
}
