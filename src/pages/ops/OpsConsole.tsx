/**
 * Console interno (/ops), NÃO é feature de produto.
 * Fora do AdminLayout; allowlist no Edge (OPS_ADMIN_EMAILS).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search } from "lucide-react";
import {
  opsExtendTrial,
  opsGrantPro,
  opsListUsers,
  opsPing,
  opsRevokePro,
  type OpsListUser,
  type OpsProfile,
} from "@/api/ops";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type Gate = "loading" | "denied" | "ok" | "misconfigured";

type AccessKind = "pro" | "trial" | "expired" | "unknown";

function formatTs(value: string | null | undefined): string {
  if (!value) return "·";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function accessKind(u: OpsListUser): AccessKind {
  if (u.plan === "pro") return "pro";
  if (!u.trial_ends_at) return "unknown";
  return new Date(u.trial_ends_at).getTime() > Date.now() ? "trial" : "expired";
}

function accessMeta(u: OpsListUser): { kind: AccessKind; label: string } {
  const kind = accessKind(u);
  if (kind === "pro") return { kind, label: "Pro" };
  if (kind === "unknown") return { kind, label: "Sem data" };
  if (kind === "expired") return { kind, label: "Expirado" };
  const end = new Date(u.trial_ends_at!);
  const days = Math.max(
    1,
    Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  return {
    kind,
    label: days === 1 ? "1 dia" : `${days} dias`,
  };
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "?";
  const parts = local.split(/[._+-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

const badgeStyles: Record<AccessKind, string> = {
  pro: "bg-sky-500/12 text-sky-800 ring-sky-500/25 dark:text-sky-200",
  trial: "bg-emerald-500/12 text-emerald-800 ring-emerald-500/25 dark:text-emerald-200",
  expired: "bg-rose-500/12 text-rose-800 ring-rose-500/25 dark:text-rose-200",
  unknown: "bg-muted text-muted-foreground ring-border",
};

const avatarStyles: Record<AccessKind, string> = {
  pro: "bg-sky-600/90 text-white",
  trial: "bg-emerald-700/85 text-white",
  expired: "bg-stone-400 text-white dark:bg-stone-600",
  unknown: "bg-muted-foreground/40 text-background",
};

export default function OpsConsole() {
  const { user } = useAuth();
  const [gate, setGate] = useState<Gate>("loading");
  const [actor, setActor] = useState<string>("");
  const [users, setUsers] = useState<OpsListUser[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => users.find((u) => u.id === selectedId) ?? null,
    [users, selectedId]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.plan.toLowerCase().includes(q) ||
        (u.subscription_status ?? "").toLowerCase().includes(q)
    );
  }, [users, filter]);

  const stats = useMemo(() => {
    let pro = 0;
    let trial = 0;
    let expired = 0;
    for (const u of users) {
      const k = accessKind(u);
      if (k === "pro") pro += 1;
      else if (k === "trial") trial += 1;
      else if (k === "expired") expired += 1;
    }
    return { pro, trial, expired, total: users.length };
  }, [users]);

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const data = await opsListUsers();
      setUsers(data.users);
      setSelectedId((prev) =>
        prev && data.users.some((u) => u.id === prev) ? prev : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ping = await opsPing();
        if (cancelled) return;
        setActor(ping.actor);
        setGate("ok");
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (/OPS_ADMIN_EMAILS/i.test(msg)) setGate("misconfigured");
        else if (/negado|403|Acesso/i.test(msg)) setGate("denied");
        else {
          setGate("denied");
          setError(msg);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (gate !== "ok") return;
    void loadUsers();
  }, [gate, loadUsers]);

  function applyProfile(email: string, profile: OpsProfile | null) {
    if (!profile) return;
    setUsers((prev) =>
      prev.map((u) =>
        u.email.toLowerCase() === email.toLowerCase()
          ? {
              ...u,
              plan: profile.plan,
              subscription_status: profile.subscription_status,
              trial_ends_at: profile.trial_ends_at,
              profile_created_at: profile.created_at,
              stripe_subscription_id: profile.stripe_subscription_id ?? null,
            }
          : u
      )
    );
  }

  async function run(
    fn: () => Promise<{ ok: boolean; profile: OpsProfile }>,
    okMsg: string
  ) {
    if (!selected?.email) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await fn();
      applyProfile(selected.email, data.profile);
      setMessage(okMsg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (gate === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[hsl(40_20%_97%)] text-sm text-muted-foreground dark:bg-background">
        Verificando acesso…
      </div>
    );
  }

  if (gate === "misconfigured") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[hsl(40_20%_97%)] p-6 dark:bg-background">
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <h1 className="font-display text-lg font-semibold">Ops indisponível</h1>
          <p className="text-sm text-muted-foreground">
            Configure o secret <code className="font-mono">OPS_ADMIN_EMAILS</code>{" "}
            na Edge Function <code className="font-mono">ops-admin</code> e
            aplique a migration <code className="font-mono">trial_ends_at</code>.
          </p>
          <Button asChild variant="outline">
            <Link to="/home">Voltar</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[hsl(40_20%_97%)] p-6 dark:bg-background">
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <h1 className="font-display text-lg font-semibold">Acesso negado</h1>
          <p className="text-sm text-muted-foreground">
            Esta rota é só para operadores. Conta: {user?.email ?? "·"}.
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button asChild variant="outline">
            <Link to="/home">Voltar</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[hsl(40_20%_97%)] text-foreground dark:bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,_hsl(199_89%_45%_/_0.12),_transparent_60%)]"
      />

      <div className="relative mx-auto max-w-2xl space-y-5 px-4 py-8 sm:px-6">
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
              <Link to="/home">
                <ArrowLeft className="h-4 w-4" />
                App
              </Link>
            </Button>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Interno
            </p>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight">
                Ops
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {actor}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 bg-card/80"
              disabled={listLoading || busy}
              onClick={() => void loadUsers()}
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", listLoading && "animate-spin")}
              />
              Atualizar
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-card px-2.5 py-1 ring-1 ring-border/60">
              {stats.total} usuários
            </span>
            <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-sky-800 ring-1 ring-sky-500/20 dark:text-sky-200">
              {stats.pro} Pro
            </span>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-800 ring-1 ring-emerald-500/20 dark:text-emerald-200">
              {stats.trial} em teste
            </span>
            <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-800 ring-1 ring-rose-500/20 dark:text-rose-200">
              {stats.expired} expirados
            </span>
          </div>
        </header>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="ops-filter"
            autoComplete="off"
            placeholder="Filtrar por e-mail ou plano…"
            className="h-11 rounded-xl border-border/70 bg-card/90 pl-9 shadow-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="max-h-[min(52vh,440px)] overflow-y-auto">
            {listLoading && users.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Nenhum usuário encontrado.
              </p>
            ) : (
              <ul>
                {filtered.map((u, index) => {
                  const active = u.id === selectedId;
                  const meta = accessMeta(u);
                  return (
                    <li
                      key={u.id}
                      className={cn(
                        index > 0 && "border-t border-border/50"
                      )}
                    >
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors",
                          "hover:bg-muted/40",
                          active && "bg-sky-500/[0.07] ring-inset ring-1 ring-sky-500/20"
                        )}
                        onClick={() => setSelectedId(u.id)}
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold tracking-wide",
                            avatarStyles[meta.kind]
                          )}
                        >
                          {initialsFromEmail(u.email)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold tracking-tight">
                            {u.email}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            Desde {formatTs(u.auth_created_at)}
                            {u.trial_ends_at
                              ? ` · teste até ${formatTs(u.trial_ends_at)}`
                              : null}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
                            badgeStyles[meta.kind]
                          )}
                        >
                          {meta.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {selected ? (
          <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  avatarStyles[accessKind(selected)]
                )}
              >
                {initialsFromEmail(selected.email)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold tracking-tight">
                  {selected.email}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {selected.id}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Plano <span className="font-medium text-foreground">{selected.plan}</span>
                  {selected.subscription_status
                    ? ` · ${selected.subscription_status}`
                    : ""}
                  {" · "}
                  fim do teste {formatTs(selected.trial_ends_at)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(() => opsGrantPro(selected.email), "Pro concedido")
                }
              >
                Tornar Pro
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(() => opsRevokePro(selected.email), "Pro removido")
                }
              >
                Remover Pro
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-4">
              <div className="space-y-1">
                <Label htmlFor="ops-days" className="text-xs">
                  + dias de teste
                </Label>
                <Input
                  id="ops-days"
                  type="number"
                  min={1}
                  max={365}
                  className="h-9 w-24"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value) || 1)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => opsExtendTrial(selected.email, days),
                    `Teste +${days} dia(s)`
                  )
                }
              >
                Estender
              </Button>
            </div>
          </section>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">
            Selecione um usuário na lista para gerenciar.
          </p>
        )}

        {message ? (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
