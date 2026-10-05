import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bell, CreditCard, Download, LogOut, Sparkles, Trash2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { normalizeAvatarUrl } from "@/lib/avatar";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { deleteOwnAccount, wipeOwnData } from "@/api/account";
import {
  createCheckoutSession,
  createPortalSession,
  ensureProfile,
  isBillingConfigured,
  applyEmailPrefsPatch,
  updateEmailPrefs,
  type EmailPrefsPatch,
  type UserProfile,
} from "@/api/billing";
import { BILLING_ERROR_CODES } from "@/lib/billing-guard";
import {
  exportFinanceCsv,
  exportGoalsCsv,
  exportHabitsCsv,
  exportMoviesCsv,
  exportPlacesCsv,
  exportTripsCsv,
  exportVehiclesCsv,
} from "@/api/export";
import { resetOnboarding } from "@/lib/onboarding";
import {
  ALERT_KIND_OPTIONS,
  getEnabledAlertKinds,
  isBrowserNotifyEnabled,
  requestBrowserNotifyPermission,
  setAlertKindEnabled,
  setBrowserNotifyEnabled,
} from "@/lib/browserNotify";
import type { AppAlertKind } from "@/api/alerts";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { InviteFriendsCard } from "@/components/InviteFriendsCard";
import { OrbAvatarSection } from "@/pages/admin/account/OrbAvatarSection";

export default function Account() {
  const { user } = useAuth();
  const { isPro, isTrialActive, trialDaysLeft, hasAccess, accessBlockReason, loading: planLoading, refresh } = usePlan();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    void ensureProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [user?.id]);
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmText, setConfirmText] = useState("");
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [notifyOn, setNotifyOn] = useState(() => isBrowserNotifyEnabled());
  const [enabledKinds, setEnabledKinds] = useState<Set<AppAlertKind>>(
    () => getEnabledAlertKinds()
  );

  const name =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    "Usuário";
  const email = user?.email ?? "";
  const avatar = normalizeAvatarUrl(
    (user?.user_metadata?.avatar_url as string | undefined) ||
      (user?.user_metadata?.picture as string | undefined) ||
      ""
  );

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const trial = searchParams.get("trial");
    if (checkout === "success") {
      track("checkout_success");
      toast({
        title: "Assinatura confirmada",
        description: "Seu plano Pro será ativado em instantes.",
        duration: 3000,
      });
      void refresh();
      setSearchParams({}, { replace: true });
      return;
    }
    if (checkout === "cancel") {
      track("checkout_cancel");
      setSearchParams({}, { replace: true });
      return;
    }
    if (trial === "expired") {
      track("trial_expired_view");
    }
  }, [searchParams, setSearchParams, toast, refresh]);

  function saveEmailPref(patch: EmailPrefsPatch) {
    const previous = profile;
    setProfile((p) => (p ? applyEmailPrefsPatch(p, patch) : p));
    void updateEmailPrefs(patch)
      .then((saved) => {
        setProfile((p) => (p ? { ...p, ...saved } : p));
        toast({ title: "Preferência salva", duration: 2000 });
      })
      .catch((err) => {
        setProfile(previous);
        toast({
          title: "Erro",
          description: getErrorMessage(err, "Não foi possível salvar a preferência."),
          variant: "destructive",
        });
      });
  }

  async function handleLogout() {
    track("logout");
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function handleDeleteAccount() {
    if (confirmText.trim().toUpperCase() !== "EXCLUIR") return;
    setDeleting(true);
    try {
      track("account_delete");
      await deleteOwnAccount();
      window.location.href = "/";
    } catch (error) {
      toast({
        title: "Não foi possível excluir a conta",
        description: getErrorMessage(
          error,
          "Não foi possível excluir a conta. Tente de novo em instantes."
        ),
        variant: "destructive",
      });
      setDeleting(false);
    }
  }

  async function handleWipeData() {
    if (wipeConfirm.trim().toUpperCase() !== "LIMPAR") return;
    setWiping(true);
    try {
      track("account_wipe_data");
      await wipeOwnData();
      setWipeConfirm("");
      toast({
        title: "Dados apagados",
        description: "Sua conta continua ativa; os registros do app foram removidos.",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Não foi possível limpar os dados",
        description: getErrorMessage(
          error,
          "Não foi possível limpar os dados. Tente de novo em instantes."
        ),
        variant: "destructive",
      });
    } finally {
      setWiping(false);
    }
  }

  async function runExport(
    key: string,
    fn: () => Promise<void>,
    success: string
  ) {
    setExporting(key);
    try {
      await fn();
      track("export_csv", { kind: key });
      toast({ title: success, duration: 2000 });
    } catch (error) {
      toast({
        title: "Falha no export",
        description: getErrorMessage(
          error,
          "Não foi possível exportar. Tente de novo."
        ),
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  }

  async function handleUpgrade() {
    if (!isBillingConfigured()) {
      track("checkout_blocked_no_stripe");
      toast({
        title: "Checkout ainda não disponível",
        description:
          "Assinatura ainda não está disponível neste ambiente. Fale conosco se precisar.",
        variant: "destructive",
      });
      return;
    }
    setBillingBusy(true);
    try {
      track("checkout_start");
      const { url } = await createCheckoutSession();
      window.location.href = url;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";
      if (code === BILLING_ERROR_CODES.ALREADY_SUBSCRIBED) {
        void refresh();
      }
      toast({
        title: "Checkout indisponível",
        description: getErrorMessage(
          error,
          "Não foi possível abrir o checkout. Tente de novo."
        ),
        variant: "destructive",
      });
      setBillingBusy(false);
    }
  }

  async function handlePortal() {
    setBillingBusy(true);
    try {
      track("billing_portal");
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (error) {
      toast({
        title: "Portal indisponível",
        description: getErrorMessage(
          error,
          "Não foi possível abrir o portal de assinatura. Tente de novo."
        ),
        variant: "destructive",
      });
      setBillingBusy(false);
    }
  }

  const canDelete = confirmText.trim().toUpperCase() === "EXCLUIR";
  const canWipe = wipeConfirm.trim().toUpperCase() === "LIMPAR";
  const planMeta = isPro ? PLANS.pro : PLANS.free;
  const accessBlocked = !hasAccess && !isPro;
  const blockedTitle =
    accessBlockReason === "payment_failed"
      ? "Pagamento pendente"
      : accessBlockReason === "canceled"
        ? "Assinatura cancelada"
        : "Seu teste de 7 dias terminou";
  const blockedBody =
    accessBlockReason === "payment_failed"
      ? `Não conseguimos renovar o Pro. Atualize o cartão no portal ou assine de novo (${PLANS.pro.priceLabel}) para voltar a escrever no app.`
      : accessBlockReason === "canceled"
        ? `Sua assinatura foi encerrada. Seus dados continuam salvos, reative o Pro (${PLANS.pro.priceLabel}) quando quiser.`
        : `Seus dados continuam salvos na órbita. Com o Pro (${PLANS.pro.priceLabel}) você volta a usar finanças, hábitos, cinema e o resto do life OS sem limite de tempo.`;
  const blockedCta =
    accessBlockReason === "payment_failed"
      ? "Atualizar pagamento"
      : `Continuar com Pro · ${PLANS.pro.priceLabel}`;

  return (
    <PageShell
      title="Conta"
      description={`${BRAND.tagline}, perfil, plano, export e exclusão.`}
    >
      {accessBlocked ? (
        <div className="overflow-hidden rounded-2xl border border-amber-500/40 bg-gradient-to-b from-amber-500/10 via-background to-background p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="size-7 text-primary" />
          </div>
          <p className="text-lg font-semibold tracking-tight">{blockedTitle}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {blockedBody}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {isBillingConfigured() ? (
              <Button
                size="lg"
                disabled={billingBusy}
                onClick={() =>
                  void (accessBlockReason === "payment_failed"
                    ? handlePortal()
                    : handleUpgrade())
                }
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {billingBusy ? "Abrindo..." : blockedCta}
              </Button>
            ) : (
              <Button size="lg" asChild>
                <a
                  href={`mailto:${BRAND.email}?subject=${encodeURIComponent(`${BRAND.name} Pro`)}`}
                  onClick={() => track("paywall_contact_cta")}
                >
                  Falar conosco
                </a>
              </Button>
            )}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Nada foi apagado. Quando assinar, tudo volta exatamente como
            deixou.
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar className="h-12 w-12 rounded-xl sm:h-14 sm:w-14">
            <AvatarImage src={avatar} alt={name} />
            <AvatarFallback className="rounded-xl text-base sm:text-lg">
              {name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold sm:text-lg">{name}</p>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            {user?.id ? (
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                ID: {user.id}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
          <Button variant="outline" asChild disabled={accessBlocked}>
            <Link to="/home">Voltar ao início</Link>
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              resetOnboarding(user?.id);
              toast({
                title: "Onboarding resetado",
                description: "Recarregue a página para ver o tour e o checklist de novo.",
                duration: 2500,
              });
            }}
          >
            Refazer tour
          </Button>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Preferências de alerta
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Escolha o que aparece no sino e se o navegador pode notificar
              (no máx. 1 aviso por dia).
            </p>
          </div>
          <Button
            variant={notifyOn ? "default" : "outline"}
            size="sm"
            onClick={() => void (async () => {
              if (!notifyOn) {
                const permission = await requestBrowserNotifyPermission();
                if (permission !== "granted") {
                  toast({
                    title: "Permissão negada",
                    description: "Ative notificações nas configurações do navegador.",
                    variant: "destructive",
                  });
                  return;
                }
                setBrowserNotifyEnabled(true);
                setNotifyOn(true);
                track("notify_pref_toggle", { enabled: true });
                return;
              }
              setBrowserNotifyEnabled(false);
              setNotifyOn(false);
              track("notify_pref_toggle", { enabled: false });
            })()}
          >
            {notifyOn ? "Notificações on" : "Ativar notificações"}
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {ALERT_KIND_OPTIONS.map((opt) => {
            const on = enabledKinds.has(opt.kind);
            return (
              <li
                key={opt.kind}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => {
                    setAlertKindEnabled(opt.kind, !on);
                    setEnabledKinds(getEnabledAlertKinds());
                    track("alert_kind_toggle", {
                      kind: opt.kind,
                      enabled: !on,
                    });
                  }}
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                    on ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                      on ? "left-5" : "left-0.5"
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {hasAccess ? <OrbAvatarSection /> : null}

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Plano</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {planLoading
                ? "Carregando..."
                : accessBlockReason === "payment_failed"
                  ? "Pagamento pendente, atualize o cartão para voltar ao Pro."
                  : accessBlockReason === "canceled"
                    ? "Assinatura cancelada. Reative o Pro quando quiser."
                    : accessBlocked
                      ? "Seu teste de 7 dias acabou. Assine o Pro para continuar."
                      : isTrialActive
                        ? `Teste ativo, ${trialDaysLeft} dia${trialDaysLeft === 1 ? "" : "s"} restante${trialDaysLeft === 1 ? "" : "s"}.`
                        : `${planMeta.name}, ${planMeta.blurb}`}
            </p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide">
            {isPro
              ? "pro"
              : isTrialActive
                ? "teste"
                : accessBlockReason === "payment_failed"
                  ? "pagamento"
                  : "expirado"}
          </span>
        </div>
        {isTrialActive && trialDaysLeft <= 2 ? (
          <div
            className={`mt-4 space-y-2 rounded-lg border p-4 text-sm ${
              trialDaysLeft <= 1
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-sky-500/30 bg-sky-500/5"
            }`}
          >
            <p className="font-medium text-foreground">
              {trialDaysLeft <= 1
                ? "Último dia do teste"
                : "Seu teste acaba em 2 dias"}
            </p>
            <p className="text-muted-foreground">
              {trialDaysLeft <= 1
                ? `Amanhã o acesso grátis termina. Assine o Pro (${PLANS.pro.priceLabel}) para continuar com orçamento, recorrências e o life OS.`
                : `Faltam ${trialDaysLeft} dias. Vale montar o orçamento e as recorrências agora, e decidir com calma se o Pro faz sentido.`}
            </p>
            {isBillingConfigured() ? (
              <Button
                size="sm"
                className="mt-1"
                disabled={billingBusy}
                onClick={() => void handleUpgrade()}
              >
                Assinar Pro · {PLANS.pro.priceLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
        <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
          {planMeta.features.slice(0, 4).map((f) => (
            <li key={f}>· {f}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          {isPro ? (
            <>
              <Button
                variant="outline"
                disabled={billingBusy || !isBillingConfigured()}
                onClick={() => void handlePortal()}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Gerenciar assinatura
              </Button>
              <Button
                variant="ghost"
                disabled={billingBusy || !isBillingConfigured()}
                onClick={() => {
                  track("billing_invoices");
                  void handlePortal();
                }}
              >
                Faturas e recibos
              </Button>
            </>
          ) : isBillingConfigured() ? (
            <Button
              disabled={billingBusy}
              onClick={() => void handleUpgrade()}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {billingBusy
                ? "Abrindo..."
                : accessBlocked
                  ? `Continuar com Pro · ${PLANS.pro.priceLabel}`
                  : `Assinar Pro · ${PLANS.pro.priceLabel}`}
            </Button>
          ) : (
            <Button asChild>
              <a
                href={`mailto:${BRAND.email}?subject=${encodeURIComponent(`${BRAND.name} Pro`)}`}
                onClick={() => track("paywall_contact_cta")}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Falar sobre o Pro
              </a>
            </Button>
          )}
          <Button variant="ghost" asChild>
            <Link to="/about">Sobre</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/terms">Termos</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/privacy">Privacidade</Link>
          </Button>
        </div>
        {!isBillingConfigured() && !isPro ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Assinatura ainda não está disponível neste ambiente. Fale conosco se
            precisar.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">E-mails</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Digest, alertas e lembrete de hábitos. Login, confirmação e reset
          sempre são enviados.
        </p>
        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Digest semanal</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={profile?.email_digest_enabled !== false}
              disabled={!profile || Boolean(profile.email_unsubscribed_at)}
              onChange={(e) =>
                saveEmailPref({ email_digest_enabled: e.target.checked })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Alertas por e-mail (parcelas / orçamento)</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={Boolean(profile?.email_alerts_enabled)}
              disabled={!profile || Boolean(profile.email_unsubscribed_at)}
              onChange={(e) =>
                saveEmailPref({ email_alerts_enabled: e.target.checked })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Lembrete diário de hábitos</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={Boolean(profile?.email_habit_reminder_enabled)}
              disabled={!profile || Boolean(profile.email_unsubscribed_at)}
              onChange={(e) =>
                saveEmailPref({ email_habit_reminder_enabled: e.target.checked })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Pausar todos os e-mails de produto</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={Boolean(profile?.email_unsubscribed_at)}
              disabled={!profile}
              onChange={(e) =>
                saveEmailPref({ unsubscribed: e.target.checked })
              }
            />
          </label>
        </div>
      </section>

      <InviteFriendsCard />

      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Exportar dados (CSV)</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Baixe uma cópia dos seus registros (LGPD). Veículos gera 3 arquivos;
          hábitos gera cadastro + logs.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!!exporting}
            onClick={() =>
              void runExport("finance", exportFinanceCsv, "Finanças exportadas")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === "finance" ? "Exportando..." : "Finanças"}
          </Button>
          <Button
            variant="outline"
            disabled={!!exporting}
            onClick={() =>
              void runExport("goals", exportGoalsCsv, "Metas exportadas")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === "goals" ? "Exportando..." : "Metas"}
          </Button>
          <Button
            variant="outline"
            disabled={!!exporting}
            onClick={() =>
              void runExport("habits", exportHabitsCsv, "Hábitos exportados")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === "habits" ? "Exportando..." : "Hábitos"}
          </Button>
          <Button
            variant="outline"
            disabled={!!exporting}
            onClick={() =>
              void runExport("places", exportPlacesCsv, "Lugares exportados")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === "places" ? "Exportando..." : "Lugares"}
          </Button>
          <Button
            variant="outline"
            disabled={!!exporting}
            onClick={() =>
              void runExport("trips", exportTripsCsv, "Viagens exportadas")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === "trips" ? "Exportando..." : "Viagens"}
          </Button>
          <Button
            variant="outline"
            disabled={!!exporting}
            onClick={() =>
              void runExport("movies", exportMoviesCsv, "Cinema exportado")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === "movies" ? "Exportando..." : "Cinema"}
          </Button>
          <Button
            variant="outline"
            disabled={!!exporting}
            onClick={() =>
              void runExport("vehicles", exportVehiclesCsv, "Veículos exportados")
            }
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting === "vehicles" ? "Exportando..." : "Veículos"}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-amber-500/30 bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold">Limpar dados do app</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Apaga finanças, cinema, viagens, veículos, hábitos, metas e lugares,
          mas mantém o login. Exporte antes se quiser um backup.
        </p>
        <div className="mt-4 max-w-sm space-y-3">
          <Input
            value={wipeConfirm}
            onChange={(e) => setWipeConfirm(e.target.value)}
            placeholder="Digite LIMPAR para confirmar"
            autoComplete="off"
          />
          <ConfirmDeleteDialog
            title="Limpar todos os dados?"
            description="Os registros do app serão apagados. Sua conta permanece ativa."
            loading={wiping}
            confirmLabel="Limpar"
            onConfirm={handleWipeData}
          >
            <Button variant="outline" disabled={!canWipe || wiping}>
              <Trash2 className="mr-2 h-4 w-4" />
              {wiping ? "Limpando..." : "Limpar dados"}
            </Button>
          </ConfirmDeleteDialog>
        </div>
      </section>

      <section className="rounded-xl border border-destructive/30 bg-card p-5 sm:p-6">
        <h2 className="text-base font-semibold text-destructive">Zona de perigo</h2>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Exclui permanentemente sua conta e todos os dados (finanças, cinema,
          viagens, veículos, hábitos, metas e lugares). Esta ação não pode ser
          desfeita.
        </p>
        <div className="mt-4 max-w-sm space-y-3">
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Digite EXCLUIR para confirmar"
            autoComplete="off"
          />
          <ConfirmDeleteDialog
            title="Excluir conta?"
            description="Todos os seus dados serão apagados e você será desconectado."
            loading={deleting}
            onConfirm={handleDeleteAccount}
          >
            <Button variant="destructive" disabled={!canDelete || deleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir conta e dados
            </Button>
          </ConfirmDeleteDialog>
        </div>
      </section>
    </PageShell>
  );
}
