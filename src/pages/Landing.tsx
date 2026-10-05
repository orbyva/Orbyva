import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Smartphone, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import LoadingFallback from "@/components/LoadingFallback";
import PhoneMockupBasic from "@/components/ui/phone-mockups-1";
import { LandingAtmosphere } from "@/components/landing/LandingAtmosphere";
import { LandingMagneticCta } from "@/components/landing/LandingMagneticCta";
import { LandingNeonFrame } from "@/components/landing/LandingNeonFrame";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingTrustMarquee } from "@/components/landing/LandingTrustMarquee";
import { Link001 } from "@/components/ui/skiper-ui/skiper40";
import { JsonLd } from "@/components/seo/JsonLd";
import { PublicInternalNav } from "@/components/seo/PublicInternalNav";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { isBillingConfigured } from "@/lib/billing-config";
import { track } from "@/lib/analytics";
import { landingShouldDeferToApp } from "@/lib/landingAuthHint";
import { isPrerenderMode } from "@/lib/prerender";
import {
  buildFaqPageJsonLd,
  buildOrganizationJsonLd,
  buildWebApplicationJsonLd,
  HOME_META,
} from "@/lib/seo";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { FAQS } from "@/pages/landing/landingFaqData";

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
  const prerender = isPrerenderMode();
  useDocumentMeta({
    title: HOME_META.title,
    description: HOME_META.description,
    path: "/",
    image: "https://orbyva.app/marketing/hub.png",
    brandSuffix: false,
  });
  const billingLive = isBillingConfigured();
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [belowFold, setBelowFold] = useState(prerender);
  const [handoff, setHandoff] = useState(
    () => !prerender && landingShouldDeferToApp()
  );
  const seenSections = useRef(new Set<string>());
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.getElementById("seo-noscript")?.remove();
  }, []);

  useEffect(() => {
    if (handoff) return;
    track("landing_view", {
      billing_live: billingLive,
      channel: "instagram",
    });
  }, [billingLive, handoff]);

  useEffect(() => {
    if (handoff) return;
    const hero = heroRef.current;
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyCta(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [handoff]);

  useEffect(() => {
    if (handoff) return;
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
  }, [handoff]);

  useLayoutEffect(() => {
    document.getElementById("boot")?.setAttribute("hidden", "");
    return () => {
      document.getElementById("boot")?.setAttribute("hidden", "");
    };
  }, []);

  useEffect(() => {
    if (handoff || prerender) return;
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
  }, [handoff, prerender]);

  /**
   * Quem já tem sessão (ou OAuth na hash) não espera o idle: a landing está fora do AuthRoot
   * de propósito (LCP), mas pintar o marketing e só então mandar para `/home` parece um flash.
   * Visitante anônimo continua sem importar o Supabase.
   */
  useEffect(() => {
    if (!handoff) return;
    let cancelled = false;
    void import("@/lib/supabase")
      .then(({ supabase }) => supabase.auth.getSession())
      .then(({ data }) => {
        if (cancelled) return;
        if (data.session?.user) {
          navigate("/home", { replace: true });
          return;
        }
        const url = new URL(window.location.href);
        if (url.searchParams.has("code") || url.searchParams.has("state")) {
          url.searchParams.delete("code");
          url.searchParams.delete("state");
          const next = `${url.pathname}${url.search}${url.hash}`;
          window.history.replaceState({}, "", next);
        }
        setHandoff(false);
      })
      .catch(() => {
        if (!cancelled) setHandoff(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handoff, navigate]);

  const ctaTo = "/login?mode=signup";
  const ctaLabel = "Começar grátis";
  const heroSub = `7 dias grátis · depois Pro ${PLANS.pro.priceLabel}`;

  if (handoff) {
    return <LoadingFallback />;
  }

  return (
    <div className="relative min-h-svh bg-[var(--landing-bg)] pb-16 text-zinc-100 md:pb-0">
      <JsonLd
        data={[
          buildOrganizationJsonLd(),
          buildWebApplicationJsonLd(),
          buildFaqPageJsonLd(FAQS),
        ]}
      />
      <a
        href="#conteudo"
        className="absolute left-4 top-4 z-50 -translate-y-16 rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-sky-950 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:translate-y-0"
      >
        Ir para o conteúdo
      </a>
      <LandingAtmosphere />

      {/* Mesmo header-pílula do `/login`: o logo do app leva para `/` sem sair do PWA instalado,
          então esta tela também precisa descontar o inset de topo. O inset SOMA ao `pt-4`. */}
      <header className="relative z-20 px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full border border-white/10 bg-[var(--landing-bg)]/80 px-2 pl-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:px-3">
          <Link to="/" aria-label={BRAND.name} className="inline-flex shrink-0">
            <BrandLogo
              variant="favicon"
              className="size-8 sm:size-9"
              alt={BRAND.name}
            />
          </Link>

          <LandingNav items={NAV} />

          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              to="/login"
              className="inline-flex h-8 items-center rounded-full px-3 text-xs text-zinc-300 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white"
            >
              Entrar
            </Link>
            <Link
              to={ctaTo}
              onClick={() => track("landing_cta_nav")}
              className="inline-flex h-8 items-center rounded-full bg-sky-400 px-4 text-xs font-medium text-sky-950 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-sky-300 active:scale-[0.98]"
            >
              {ctaLabel}
            </Link>
          </div>
        </div>
      </header>

      <main id="conteudo" className="relative z-10">
        <section
          ref={heroRef}
          className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-14 pt-8 sm:px-8 sm:pt-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 lg:pb-20"
        >
          <div className="landing-hero-copy">
            <h1 className="text-balance font-display text-4xl font-semibold tracking-tighter text-zinc-50 sm:text-5xl lg:text-6xl lg:leading-[1.12]">
              {BRAND.tagline}
            </h1>
            <p className="mt-5 max-w-[65ch] text-pretty text-base leading-relaxed text-zinc-400 sm:text-lg">
              {BRAND.heroSupport}
            </p>
            <PublicInternalNav className="mt-6" />
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <LandingMagneticCta
                href={ctaTo}
                label={ctaLabel}
                onClick={() => track("landing_cta_hero")}
              />
              <Link
                to="/dentro-do-orcamento"
                onClick={() => track("landing_cta_cabe_no_mes")}
                className="text-sm text-zinc-400 underline-offset-4 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-zinc-200 hover:underline"
              >
                Está dentro do orçamento?
              </Link>
            </div>
          </div>

          <div className="landing-hero-visual relative w-full min-w-0">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_50%_40%,rgba(14,165,233,0.18),transparent_65%)] blur-2xl"
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

        <section className="relative mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <LandingNeonFrame className="px-6 py-14 text-center sm:px-12">
            <h2 className="text-balance font-display text-3xl font-semibold leading-[1.4] tracking-tighter sm:text-4xl sm:leading-[1.35]">
              Comece grátis. Organize o mês e o resto da vida hoje.
            </h2>
            <p className="mx-auto mt-3 max-w-[65ch] text-pretty text-zinc-400">
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
              Cadastro em minutos, cartão só se assinar o Pro
            </p>
          </LandingNeonFrame>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tighter sm:text-2xl">
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

          <div id="contato" className="scroll-mt-24">
            <h2 className="font-display text-xl font-semibold tracking-tighter sm:text-2xl">
              Contato
            </h2>
            <p className="mt-2 max-w-[65ch] text-sm text-zinc-400">
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
            <Link to="/life-os" className="hover:text-zinc-300">
              Life OS
            </Link>
            <Link to="/financas-pessoais" className="hover:text-zinc-300">
              Finanças
            </Link>
            <Link to="/metas" className="hover:text-zinc-300">
              Metas
            </Link>
            <Link to="/blog" className="hover:text-zinc-300">
              Blog
            </Link>
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
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[var(--landing-bg)]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-md transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
          showStickyCta ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs leading-tight text-zinc-400">{heroSub}</p>
          <Link
            to={ctaTo}
            onClick={() => track("landing_cta_sticky")}
            className="inline-flex h-8 shrink-0 items-center rounded-full bg-sky-400 px-5 text-xs font-medium text-sky-950 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-sky-300 active:scale-[0.98]"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
