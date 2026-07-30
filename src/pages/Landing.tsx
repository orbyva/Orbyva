import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandWordmark } from "@/components/BrandWordmark";
import PhoneMockupBasic from "@/components/ui/phone-mockups-1";
import { LandingBeams } from "@/components/landing/LandingBeams";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { isBillingConfigured } from "@/lib/billing-config";
import { track } from "@/lib/analytics";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { FAQ_JSON_LD } from "@/pages/landing/LandingFaq";

const LandingCompare = lazy(() =>
  import("@/pages/landing/LandingCompare").then((m) => ({
    default: m.LandingCompare,
  }))
);
const LandingFeatures = lazy(() =>
  import("@/pages/landing/LandingFeatures").then((m) => ({
    default: m.LandingFeatures,
  }))
);
const LandingProof = lazy(() =>
  import("@/pages/landing/LandingProof").then((m) => ({
    default: m.LandingProof,
  }))
);
const LandingPricing = lazy(() =>
  import("@/pages/landing/LandingPricing").then((m) => ({
    default: m.LandingPricing,
  }))
);
const LandingFaq = lazy(() =>
  import("@/pages/landing/LandingFaq").then((m) => ({
    default: m.LandingFaq,
  }))
);

/**
 * Landing Orbyva — conversão trial → Pro (Awwwards × 21st):
 * Hero produto dominante → trust → comparação → controle → prova → planos → CTA.
 */

const NAV = [
  { href: "#comparar", label: "Uma órbita" },
  { href: "#controle", label: "Controle" },
  { href: "#modulos", label: "Módulos" },
  { href: "#prova", label: "Prova" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Dúvidas" },
] as const;

const TRUST = [
  "Um app, não sete",
  "Teto do mês",
  "Sem senha de banco",
] as const;

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

const SECTION_IDS = ["controle", "planos"] as const;

export default function Landing() {
  const { user, loading } = useAuth();
  useDocumentMeta({
    title: "Orbyva — Saiba o que cabe no mês",
    description:
      "O que você espalha em vários apps — orçamento, parcelas, hábitos, viagens e cinema — numa só órbita. 7 dias grátis.",
    path: "/",
    image: "https://orbyva.app/marketing/hub.png",
    brandSuffix: false,
  });
  const billingLive = isBillingConfigured();
  const [showStickyCta, setShowStickyCta] = useState(false);
  const seenSections = useRef(new Set<string>());

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

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let raf = 0;

    const attach = () => {
      if (cancelled) return;
      const nodes = SECTION_IDS.map((id) =>
        document.getElementById(id)
      ).filter((el): el is HTMLElement => Boolean(el));
      if (nodes.length < SECTION_IDS.length) {
        raf = requestAnimationFrame(attach);
        return;
      }

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const id = entry.target.id;
            if (!id || seenSections.current.has(id)) continue;
            seenSections.current.add(id);
            track("landing_section_view", { section: id });
          }
        },
        { threshold: 0.35 }
      );

      for (const node of nodes) observer.observe(node);
    };

    attach();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);

  const ctaTo = !loading && user ? "/home" : "/login?mode=signup";
  const ctaLabel = !loading && user ? "Abrir app" : "Começar grátis";
  const heroSub = `7 dias grátis · depois Pro ${PLANS.pro.priceLabel}`;

  return (
    <div className="relative min-h-svh overflow-x-hidden bg-[var(--landing-bg)] pb-16 text-zinc-100 md:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }}
      />
      <LandingBeams />

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
        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-12 pt-6 sm:px-8 sm:pt-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 lg:pb-20">
          <div className="landing-hero-copy">
            <BrandWordmark size="lg" showSubtitle={false} />
            <h1 className="mt-4 max-w-xl font-display text-4xl font-semibold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-[3.25rem]">
              Saiba o que cabe no mês.
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-zinc-400 sm:text-lg">
              Em vez de planilha + hábitos + cinema + viagem em apps
              separados: orçamento, parcelas e o resto da vida — tudo no
              Orbyva, desde o primeiro dia.
            </p>
            <div className="mt-8">
              <Button size="lg" className="rounded-full px-7" asChild>
                <Link to={ctaTo} onClick={() => track("landing_cta_hero")}>
                  {ctaLabel}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-zinc-500">{heroSub}</p>
          </div>

          <div className="landing-hero-visual relative w-full min-w-0">
            <PhoneMockupBasic />
          </div>
        </section>

        <section className="border-y border-white/8 bg-white/[0.02]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-5 py-5 text-sm text-zinc-400 sm:px-8">
            {TRUST.map((item, i) => (
              <span key={item} className="contents">
                {i > 0 ? (
                  <span
                    aria-hidden
                    className="hidden h-1 w-1 rounded-full bg-zinc-600 sm:block"
                  />
                ) : null}
                <span>{item}</span>
              </span>
            ))}
          </div>
        </section>

        <Suspense fallback={null}>
          <LandingCompare />
          <LandingFeatures />
          <LandingProof ctaTo={ctaTo} />
          <LandingPricing
            ctaTo={ctaTo}
            ctaLabel={ctaLabel}
            showPlanCtas
          />
          <LandingFaq />
        </Suspense>

        <section className="relative mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-sky-400/25 px-6 py-14 text-center sm:px-12">
            <LandingBeams className="opacity-80" />
            <div className="relative z-10">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Pronto para juntar tudo numa órbita?
              </h2>
              <p className="mx-auto mt-3 max-w-md text-zinc-400">
                7 dias grátis com orçamento, parcelas e life OS no mesmo app.
                Depois, Pro por {PLANS.pro.priceLabel}.
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
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="font-display text-sm font-medium text-sky-400/90">
              No radar
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold tracking-tight sm:text-2xl">
              O que vem depois
            </h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {ROADMAP.map((item) => (
                <li key={item.title} className="flex gap-3">
                  <item.icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-sky-400"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div id="contato" className="scroll-mt-20">
            <p className="font-display text-sm font-medium text-sky-400/90">
              Contato
            </p>
            <p className="mt-2 text-sm text-zinc-400">
              Dúvida ou feedback? A gente responde.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={`mailto:${BRAND.email}?subject=${encodeURIComponent(
                  `Contato ${BRAND.name}`
                )}`}
                className="text-sm text-zinc-300 underline-offset-4 hover:text-white hover:underline"
                onClick={() => track("landing_contact", { channel: "email" })}
              >
                {BRAND.email}
              </a>
              <a
                href={BRAND.instagramUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-300 underline-offset-4 hover:text-white hover:underline"
                onClick={() =>
                  track("landing_contact", { channel: "instagram" })
                }
              >
                {BRAND.instagramHandle}
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-white/8 px-5 py-8 text-sm text-zinc-500 sm:px-8">
          <span>
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.domain}
          </span>
          <div className="flex flex-wrap gap-4">
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
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[var(--landing-bg)]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-md transition-transform duration-300 md:hidden ${
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
