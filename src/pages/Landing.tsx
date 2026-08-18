import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Smartphone, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { BrandWordmark } from "@/components/BrandWordmark";
import PhoneMockupBasic from "@/components/ui/phone-mockups-1";
import { LandingAtmosphere } from "@/components/landing/LandingAtmosphere";
import { LandingMagneticCta } from "@/components/landing/LandingMagneticCta";
import { LandingNeonFrame } from "@/components/landing/LandingNeonFrame";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingTrustMarquee } from "@/components/landing/LandingTrustMarquee";
import { Link001 } from "@/components/ui/skiper-ui/skiper40";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { isBillingConfigured } from "@/lib/billing-config";
import { track } from "@/lib/analytics";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { FAQ_JSON_LD } from "@/pages/landing/landingFaqData";

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
 * Landing Orbyva, conversão trial → Pro.
 * Motion: OriginKit + Cult UI + Skiper UI (free).
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
  "Parece 5 apps. Custa 1.",
  "Está dentro do orçamento?",
  "7 dias grátis",
  "Life OS incluso",
  "Cancele em 1 clique",
  "Cronômetro flutuante",
] as const;

const ROADMAP = [
  {
    icon: Smartphone,
    title: "App nas lojas",
    body: "Em breve na App Store e Play Store. O mesmo Orbyva, no bolso, com um toque.",
  },
  {
    icon: Sparkles,
    title: "Assistente com IA",
    body: "Insights do mês, lembretes e atalhos, e cadastrar dados por você quando fizer sentido.",
  },
] as const;

const SECTION_IDS = ["controle", "planos"] as const;

export default function Landing() {
  const navigate = useNavigate();
  useDocumentMeta({
    title: "Orbyva · Tudo da sua vida em uma só órbita",
    description:
      "Pare de espalhar a vida em 5 apps. Organize finanças, hábitos, viagens e cinema numa só órbita. 7 dias grátis.",
    path: "/",
    image: "https://orbyva.app/marketing/hub.png",
    brandSuffix: false,
  });
  const billingLive = isBillingConfigured();
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [belowFold, setBelowFold] = useState(false);
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

  useLayoutEffect(() => {
    document.getElementById("boot")?.setAttribute("hidden", "");
    return () => {
      document.getElementById("boot")?.setAttribute("hidden", "");
    };
  }, []);

  useEffect(() => {
    let idle = 0;
    let timeout = 0;
    const show = () => setBelowFold(true);
    const arm = () => {
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(show, { timeout: 4000 });
      } else {
        timeout = window.setTimeout(show, 1500);
      }
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      if (idle) window.cancelIdleCallback(idle);
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      void import("@/lib/supabase").then(({ supabase }) =>
        supabase.auth.getSession().then(({ data }) => {
          if (!cancelled && data.session?.user) {
            navigate("/home", { replace: true });
          }
        })
      );
    };
    let idle = 0;
    let timeout = 0;
    const arm = () => {
      if (typeof window.requestIdleCallback === "function") {
        idle = window.requestIdleCallback(run, { timeout: 4000 });
      } else {
        timeout = window.setTimeout(run, 2500);
      }
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(idle);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [navigate]);

  const ctaTo = "/login?mode=signup";
  const ctaLabel = "Começar grátis";
  const heroSub = `7 dias grátis · depois Pro ${PLANS.pro.priceLabel}`;

  return (
    <div className="relative min-h-svh bg-[var(--landing-bg)] pb-16 text-zinc-100 md:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: FAQ_JSON_LD }}
      />
      <LandingAtmosphere />

      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link to="/" aria-label={BRAND.name} className="inline-flex shrink-0">
          <BrandLogo
            variant="mark"
            className="size-9 rounded-lg bg-white sm:size-10 sm:rounded-xl"
            alt={BRAND.name}
          />
        </Link>

        <LandingNav items={NAV} />

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="inline-flex h-8 items-center rounded-md px-3 text-xs text-zinc-300 hover:text-white"
          >
            Entrar
          </Link>
          <Link
            to={ctaTo}
            onClick={() => track("landing_cta_nav")}
            className="inline-flex h-8 items-center rounded-full bg-sky-400 px-4 text-xs font-medium text-sky-950 hover:bg-sky-300"
          >
            {ctaLabel}
          </Link>
        </div>
      </header>

      <main className="relative z-10">
        <section className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-12 pt-6 sm:px-8 sm:pt-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 lg:pb-20">
          <div className="landing-hero-copy">
            <BrandWordmark size="lg" showSubtitle={false} />
            <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              <span className="block overflow-visible bg-gradient-to-br from-sky-300 via-white to-sky-200 bg-clip-text pb-[0.2em] leading-[1.35] text-transparent">
                {BRAND.tagline}.
              </span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-zinc-400 sm:text-lg">
              {BRAND.heroSupport}
            </p>
            <div className="mt-8">
              <LandingMagneticCta
                href={ctaTo}
                label={ctaLabel}
                onClick={() => track("landing_cta_hero")}
              />
            </div>
            <p className="mt-3 text-xs text-zinc-500">{heroSub}</p>
            <p className="mt-2 text-xs text-zinc-500">
              <Link
                to="/dentro-do-orcamento"
                onClick={() => track("landing_cta_cabe_no_mes")}
                className="text-sky-300/90 underline-offset-2 hover:text-sky-200 hover:underline"
              >
                Ou veja se está dentro do orçamento, sem cadastro
              </Link>
            </p>
          </div>

          <div className="landing-hero-visual relative w-full min-w-0">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_50%_40%,rgba(14,165,233,0.28),transparent_65%)] blur-2xl"
            />
            <PhoneMockupBasic />
          </div>
        </section>

        <LandingTrustMarquee items={TRUST} />

        {belowFold ? (
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
        ) : null}

        <section className="relative mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <LandingNeonFrame className="px-6 py-14 text-center sm:px-12">
            <h2 className="font-display text-3xl font-semibold leading-[1.4] tracking-tight sm:text-4xl sm:leading-[1.35]">
              Comece grátis. Organize o mês e o resto da vida hoje.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-zinc-400">
              7 dias com tudo liberado. Depois, Pro por {PLANS.pro.priceLabel},
              sem pegadinha.
            </p>
            <div className="mt-8 flex justify-center">
              <LandingMagneticCta
                href={ctaTo}
                label={ctaLabel}
                onClick={() => track("landing_cta_trial")}
              />
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Cadastro em minutos · cartão só se assinar o Pro
            </p>
          </LandingNeonFrame>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="font-display text-sm font-medium text-sky-400/90">
              No radar
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold tracking-tight sm:text-2xl">
              O que vem a seguir
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
              Dúvida, ideia ou feedback? Resposta humana, de verdade.
            </p>
            <div className="mt-4 flex flex-wrap gap-5">
              <Link001
                href={`mailto:${BRAND.email}?subject=${encodeURIComponent(
                  `Contato ${BRAND.name}`
                )}`}
                className="text-sm text-zinc-300"
                onClick={() => track("landing_contact", { channel: "email" })}
              >
                {BRAND.email}
              </Link001>
              <Link001
                href={BRAND.instagramUrl}
                className="text-sm text-zinc-300"
                onClick={() =>
                  track("landing_contact", { channel: "instagram" })
                }
              >
                {BRAND.instagramHandle}
              </Link001>
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-white/8 px-5 py-8 text-sm text-zinc-500 sm:px-8">
          <span>
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.domain}
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/dentro-do-orcamento" className="hover:text-zinc-300">
              Está dentro do orçamento?
            </Link>
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
            <a
              href="https://skiper-ui.com"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-600 hover:text-zinc-400"
            >
              UI: Skiper UI
            </a>
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
          <Link
            to={ctaTo}
            onClick={() => track("landing_cta_sticky")}
            className="inline-flex h-8 shrink-0 items-center rounded-full bg-sky-400 px-5 text-xs font-medium text-sky-950 hover:bg-sky-300"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
