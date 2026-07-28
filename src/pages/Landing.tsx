import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { isBillingConfigured } from "@/api/billing";
import { track } from "@/lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { LandingPhoneFrame } from "@/pages/landing/LandingPhoneFrame";
import { LandingFeatures } from "@/pages/landing/LandingFeatures";
import { LandingProof } from "@/pages/landing/LandingProof";
import { LandingPricing } from "@/pages/landing/LandingPricing";
import { LandingFaq, FAQ_JSON_LD } from "@/pages/landing/LandingFaq";

/**
 * Landing Orbyva — síntese UI/UX + marketing + vendas:
 * - Hero = Home (prova do produto, 1 composição)
 * - Gancho de compra = Orçamento + Parcelas (2 seções profundas)
 * - Life OS = grade sem repetir finanças
 * - CTA = teste → Pro
 */

const NAV = [
  { href: "#controle", label: "Controle" },
  { href: "#modulos", label: "Módulos" },
  { href: "#prova", label: "Prova" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Dúvidas" },
  { href: "#contato", label: "Contato" },
] as const;

/** Direção do produto — sem data, sem promessa de prazo. */
const ROADMAP = [
  {
    icon: Smartphone,
    title: "App nas lojas",
    body: "iOS e Android — o mesmo Orbyva, instalável pela App Store e Play Store.",
  },
  {
    icon: Sparkles,
    title: "Assistente com IA",
    body: "Insights do mês, lembretes, atalhos — e também cadastrar dados por você.",
  },
] as const;

export default function Landing() {
  const { user, loading } = useAuth();
  useDocumentMeta({
    title: "Orbyva — Saiba o que cabe no mês",
    description:
      "Orçamento com teto, parcelas sob controle e livro-caixa — com hábitos, metas, viagens e cinema. 7 dias grátis.",
    path: "/",
    image: "https://orbyva.app/marketing/hub.png",
    brandSuffix: false,
  });
  const billingLive = isBillingConfigured();
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    track("landing_view", {
      billing_live: billingLive,
      channel: "instagram",
    });
  }, [billingLive]);

  useEffect(() => {
    const onScroll = () => setShowStickyCta(window.scrollY > 640);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const ctaTo = !loading && user ? "/home" : "/login?mode=signup";
  const ctaLabel = !loading && user ? "Abrir app" : "Começar grátis";
  const heroSub = `7 dias grátis · depois Pro ${PLANS.pro.priceLabel}`;

  return (
    <div className="relative min-h-svh overflow-x-hidden bg-[#070b14] pb-16 text-zinc-100 md:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,_rgba(14,165,233,0.22),_transparent_55%),radial-gradient(ellipse_50%_40%_at_100%_20%,_rgba(14,165,233,0.08),_transparent_50%)]"
      />

      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" aria-label={BRAND.name} className="inline-flex shrink-0">
          <BrandLogo
            variant="mark"
            className="size-9 rounded-lg bg-white sm:size-10 sm:rounded-xl"
            alt={BRAND.name}
          />
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1.5 backdrop-blur-md md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-zinc-300 hover:text-white"
            asChild
          >
            <Link to="/login">Entrar</Link>
          </Button>
          <Button size="sm" className="rounded-full px-4" asChild>
            <Link to={ctaTo} onClick={() => track("landing_cta_nav")}>
              {ctaLabel}
            </Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-16 pt-6 sm:px-8 sm:pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="font-sans text-2xl font-semibold tracking-tight text-sky-400 sm:text-3xl">
              {BRAND.name}
            </p>
            <h1 className="mt-3 max-w-xl font-sans text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.15rem]">
              {BRAND.tagline}.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-zinc-400 sm:text-lg">
              {BRAND.heroSupport}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" className="rounded-full px-7" asChild>
                <Link to={ctaTo} onClick={() => track("landing_cta_login")}>
                  {ctaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <a
                href={BRAND.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center text-sm text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline sm:justify-start"
                onClick={() => track("landing_instagram", { source: "hero" })}
              >
                {BRAND.instagramHandle}
              </a>
            </div>
            <p className="mt-3 text-xs text-zinc-500">{heroSub}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.55 }}
            className="relative mx-auto w-full max-w-[280px] lg:max-w-[300px]"
          >
            <div
              aria-hidden
              className="absolute -inset-8 rounded-full bg-sky-500/15 blur-3xl"
            />
            <LandingPhoneFrame
              src="/marketing/hub.png"
              alt={`Início do ${BRAND.name}: saldo, orçamento, parcelas e resumo do dia`}
              priority
              className="relative"
            />
          </motion.div>
        </section>

        <section className="border-y border-white/8 bg-white/[0.02]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-5 text-sm text-zinc-400 sm:px-8">
            <span>Orçamento com teto</span>
            <span className="hidden h-1 w-1 rounded-full bg-zinc-600 sm:block" />
            <span>Parcelas sob controle</span>
            <span className="hidden h-1 w-1 rounded-full bg-zinc-600 sm:block" />
            <span>Life OS no mesmo app</span>
          </div>
        </section>

        <LandingFeatures />
        <LandingProof ctaTo={ctaTo} />
        <LandingPricing
          ctaTo={ctaTo}
          ctaLabel={ctaLabel}
          showPlanCtas
        />
        <LandingFaq />

        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="rounded-[1.75rem] border border-sky-400/25 bg-gradient-to-br from-sky-500/15 to-transparent px-6 py-12 text-center sm:px-12"
          >
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Pronto para organizar o mês?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-zinc-400">
              7 dias grátis com orçamento, parcelas e life OS. Depois, Pro por{" "}
              {PLANS.pro.priceLabel}.
            </p>
            <Button size="lg" className="mt-8 rounded-full px-8" asChild>
              <Link to={ctaTo} onClick={() => track("landing_cta_trial")}>
                {ctaLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <p className="mt-3 text-xs text-zinc-500">
              Cadastro rápido · cartão só quando assinar o Pro
            </p>
          </motion.div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="max-w-xl"
          >
            <p className="text-sm font-medium text-sky-400/90">No radar</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              O que vem depois
            </h2>
            <p className="mt-3 text-zinc-400">
              Estamos evoluindo o Orbyva para acompanhar sua vida de forma
              ainda mais completa.
            </p>
          </motion.div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {ROADMAP.map((item, i) => (
              <motion.li
                key={item.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.35 }}
                className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <item.icon
                  className="mt-0.5 h-5 w-5 shrink-0 text-sky-400"
                  aria-hidden
                />
                <div>
                  <p className="font-medium text-zinc-100">{item.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                    {item.body}
                  </p>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>

        <section
          id="contato"
          className="scroll-mt-20 border-t border-white/8 bg-white/[0.02]"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-sky-400/90">Contato</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Fale conosco!
              </h2>
              <p className="mt-3 max-w-md text-zinc-400">
                Dúvida, sugestão de módulo ou problema na assinatura? A gente
                responde — e leva feedback a sério para o que vem depois.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="rounded-full px-7" asChild>
                <a
                  href={`mailto:${BRAND.email}?subject=${encodeURIComponent(
                    `Contato ${BRAND.name}`
                  )}`}
                  onClick={() => track("landing_contact", { channel: "email" })}
                >
                  {BRAND.email}
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-white/20 bg-white px-7 text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"
                asChild
              >
                <a
                  href={BRAND.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() =>
                    track("landing_contact", { channel: "instagram" })
                  }
                >
                  {BRAND.instagramHandle}
                </a>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-zinc-500 sm:px-8">
          <span>
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.domain}
          </span>
          <div className="flex flex-wrap gap-4">
            <a
              href={BRAND.instagramUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-zinc-300"
            >
              {BRAND.instagramHandle}
            </a>
            <a href={`mailto:${BRAND.email}`} className="hover:text-zinc-300">
              {BRAND.email}
            </a>
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
        </div>
      </footer>

      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#070b14]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-md transition-transform duration-300 md:hidden ${
          showStickyCta ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs leading-tight text-zinc-400">{heroSub}</p>
          <Button size="sm" className="rounded-full px-5" asChild>
            <Link to={ctaTo} onClick={() => track("landing_cta_sticky")}>
              {ctaLabel}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
