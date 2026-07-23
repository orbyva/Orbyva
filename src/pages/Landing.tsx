import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { joinWaitlist } from "@/api/waitlist";
import { isBillingConfigured } from "@/api/billing";
import { track } from "@/lib/analytics";
import { useAuth } from "@/hooks/useAuth";

function HubPreview() {
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl shadow-sky-950/40"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-3 text-xs text-zinc-500">Início · {BRAND.name}</span>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100/90">
          2 alertas · 1 parcela próxima
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { label: "Metas ativas", value: "3" },
            { label: "Hábitos hoje", value: "4/5" },
            { label: "Para assistir", value: "7" },
            { label: "Lugares", value: "12" },
            { label: "Viagens", value: "1" },
            { label: "Saldo do mês", value: "R$ 2.480" },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/8 bg-white/[0.04] p-3"
            >
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                {card.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">
                {card.value}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/8 bg-gradient-to-r from-sky-500/15 to-emerald-500/10 px-3 py-3">
          <p className="text-[10px] uppercase tracking-wide text-sky-200/80">
            Ledger
          </p>
          <p className="mt-1 text-sm text-zinc-200">
            Receitas R$ 8.200 · Despesas R$ 5.720 · um livro-caixa no centro do
            life OS
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { user, loading } = useAuth();
  const billingLive = isBillingConfigured();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    track("landing_view", { billing_live: billingLive });
  }, [billingLive]);

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      await joinWaitlist(email, "landing");
      track("waitlist_join", { source: "landing" });
      setStatus("ok");
      setMessage(
        billingLive
          ? "Você entrou na lista."
          : "Você entrou na lista. Avisamos quando o Pro abrir."
      );
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  const ctaTo = !loading && user ? "/home" : "/login";
  const ctaLabel = !loading && user
    ? "Abrir app"
    : billingLive
      ? "Começar grátis"
      : "Entrar na lista";
  const heroSub = billingLive
    ? `7 dias grátis · depois Pro · ${BRAND.wedge}`
    : `Lista de espera do Pro · ${BRAND.wedge}`;

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#0c1222] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.22),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(16,185,129,0.12),_transparent_45%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label={BRAND.name} className="inline-flex">
          <BrandLogo
            variant="mark"
            className="size-10 rounded-xl bg-white"
            alt={BRAND.name}
          />
        </Link>
        <Button variant="ghost" className="text-zinc-200 hover:text-white" asChild>
          <Link to="/login">Entrar</Link>
        </Button>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-5 pb-20 pt-6 sm:px-8 sm:pt-10">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <BrandLogo
              variant="full"
              className="mb-6 h-auto w-full max-w-[280px] rounded-2xl bg-white p-4 sm:max-w-[320px]"
            />
            <h1 className="font-sans text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              {BRAND.tagline}
            </h1>
            <p className="mt-5 max-w-md text-base text-zinc-400 sm:text-lg">
              {BRAND.heroSupport}
            </p>
            <div className="mt-8">
              {billingLive || (!loading && user) ? (
                <Button size="lg" asChild>
                  <Link
                    to={ctaTo}
                    onClick={() => track("landing_cta_login")}
                  >
                    {ctaLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button
                  size="lg"
                  asChild
                >
                  <a href="#waitlist" onClick={() => track("landing_cta_waitlist")}>
                    {ctaLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
              <p className="mt-3 text-xs text-zinc-500">{heroSub}</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.55 }}
            className="lg:pt-2"
          >
            <HubPreview />
          </motion.div>
        </div>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.45 }}
          className="mt-20 max-w-2xl"
        >
          <p className="text-sm font-medium text-sky-300/80">{BRAND.wedge}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Não é mais um app de hábitos. Não é só uma planilha.
          </h2>
          <p className="mt-3 text-zinc-400">
            {BRAND.name} começa pelo livro-caixa — saldo, gastos e orçamento.
            Metas, cinema, viagens e o resto da vida entram na mesma órbita
            depois que o ledger gruda.
          </p>
        </motion.section>

        <motion.section
          id="planos"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.45 }}
          className="mt-16 grid gap-4 sm:grid-cols-2"
        >
          {([PLANS.free, PLANS.pro] as const).map((plan) => (
            <div
              key={plan.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <span className="text-sm text-zinc-400">{plan.priceLabel}</span>
              </div>
              <p className="mt-2 text-sm text-zinc-400">{plan.blurb}</p>
              <ul className="mt-5 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </motion.section>

        {billingLive ? (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45 }}
            className="mt-12 rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/10 to-emerald-500/5 p-6 sm:p-8"
          >
            <h2 className="text-xl font-semibold">Pronto para começar</h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              7 dias grátis com acesso completo. Depois, Pro por{" "}
              {PLANS.pro.priceLabel} — assine na Conta quando o teste acabar.
            </p>
            <Button className="mt-5" size="lg" asChild>
              <Link to={ctaTo} onClick={() => track("landing_cta_trial")}>
                {ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </motion.section>
        ) : (
          <motion.section
            id="waitlist"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45 }}
            className="mt-12 rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/10 to-emerald-500/5 p-6 sm:p-8"
          >
            <h2 className="text-xl font-semibold">Lista de espera do Pro</h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              O checkout ainda não está aberto. Deixe seu e-mail e avisamos
              quando o Pro ({PLANS.pro.priceLabel}) liberar.
            </p>
            <form
              onSubmit={(e) => void handleWaitlist(e)}
              className="mt-5 flex max-w-md flex-col gap-2 sm:flex-row"
            >
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="border-white/15 bg-black/30 text-zinc-100 placeholder:text-zinc-500"
              />
              <Button type="submit" disabled={status === "loading"}>
                {status === "loading" ? "Enviando..." : "Quero o Pro"}
              </Button>
            </form>
            {message ? (
              <p
                className={`mt-3 text-sm ${
                  status === "error" ? "text-red-300" : "text-emerald-300"
                }`}
              >
                {message}
              </p>
            ) : null}
            <p className="mt-4 text-xs text-zinc-500">
              Já tem conta?{" "}
              <Link to="/login" className="underline hover:text-zinc-300">
                Entrar
              </Link>
            </p>
          </motion.section>
        )}
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-6 text-sm text-zinc-500 sm:px-8">
        <span>
          © {new Date().getFullYear()} {BRAND.name} · {BRAND.wedge}
        </span>
        <div className="flex gap-4">
          <Link to="/about" className="hover:text-zinc-300">
            Sobre
          </Link>
          <Link to="/terms" className="hover:text-zinc-300">
            Termos
          </Link>
          <Link to="/privacy" className="hover:text-zinc-300">
            Privacidade
          </Link>
          <Link to="/login" className="hover:text-zinc-300">
            Entrar
          </Link>
        </div>
      </footer>
    </div>
  );
}
