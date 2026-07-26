import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Smartphone, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { joinWaitlist } from "@/api/waitlist";
import { isBillingConfigured } from "@/api/billing";
import { track } from "@/lib/analytics";
import { useAuth } from "@/hooks/useAuth";

/**
 * Landing Orbyva — síntese UI/UX + marketing + vendas:
 * - Hero = Home (prova do produto, 1 composição)
 * - Gancho de compra = Orçamento + Parcelas (2 seções profundas)
 * - Life OS = grade sem repetir finanças
 * - CTA = teste → Pro R$19,90
 */

const NAV = [
  { href: "#controle", label: "Controle" },
  { href: "#modulos", label: "Módulos" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "Dúvidas" },
  { href: "#contato", label: "Contato" },
] as const;

/** Redução de risco — o que responde “e se eu não gostar?”. */
const GUARANTEES = [
  {
    title: "Teste sem cartão",
    body: "7 dias com tudo liberado. O cartão só entra se você quiser continuar.",
  },
  {
    title: "Cancele quando quiser",
    body: "Portal oficial do Stripe direto na sua conta. Sem multa, sem ligação.",
  },
  {
    title: "Seus dados são seus",
    body: "Export em CSV e exclusão da conta a qualquer momento (LGPD).",
  },
  {
    title: "Sem senha de banco",
    body: "Nada de Open Finance: você registra o que quiser, do seu jeito.",
  },
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

/** Ganchos de conversão — 1 print = 1 tela real. */
const MONEY_FEATURES = [
  {
    id: "orcamento",
    eyebrow: "Orçamento",
    title: "Saiba o que ainda cabe no mês",
    body: "Teto por categoria, gasto e restante. Alerta quando estoura — Moradia, Alimentação, Lazer — sem planilha.",
    points: [
      "Resumo: resultado, gasto e receita do mês",
      "Categorias com % usado e status OK / atenção / estourado",
      "Aparece no hub junto com o saldo do ledger",
    ],
    src: "/marketing/orcamento.png",
    alt: "Orçamento mensal: resultado, gasto e receita",
    reverse: false,
  },
  {
    id: "parcelas",
    eyebrow: "Parcelas",
    title: "Nunca mais esquecer o que vence",
    body: "Recorrências e 12x num só lugar: atrasadas, próximas e progresso de cada parcela. O comprometido do mês fica visível.",
    points: [
      "Alertas de contas atrasadas e vencimentos próximos",
      "Progresso do parcelamento (ex.: 3/10 pagas)",
      "Marque parcela a parcela — e veja no hub / timeline",
    ],
    src: "/marketing/parcelas.png",
    alt: "Recorrências com alertas de atrasadas e próximas",
    reverse: true,
  },
] as const;

/** Life OS — módulos além do dinheiro (prints batem com o label). */
const LIFE_MODULES = [
  {
    id: "habitos",
    label: "Hábitos",
    body: "Check-in do dia, streaks e taxa da semana.",
    src: "/marketing/habitos.png",
  },
  {
    id: "metas",
    label: "Metas",
    body: "Objetivos com progresso — metas em R$ ligadas ao ledger.",
    src: "/marketing/metas.png",
  },
  {
    id: "viagens",
    label: "Viagens",
    body: "Roteiro, orçamento e checklist. Compartilhe com amigos no Orbyva.",
    src: "/marketing/viagens.png",
  },
  {
    id: "lugares",
    label: "Lugares",
    body: "Notas de restaurantes e passeios — compartilhe a opinião.",
    src: "/marketing/lugares.png",
  },
  {
    id: "cinema",
    label: "Cinema",
    body: "Watchlist, notas e card para Stories. Importe de outros sites.",
    src: "/marketing/cinema.png",
  },
  {
    id: "veiculos",
    label: "Veículos",
    body: "Manutenção, combustível, km e documentos.",
    src: "/marketing/veiculos.png",
  },
] as const;

const FAQS = [
  {
    q: "O que é o Orbyva?",
    a: "O app do mês sob controle: orçamento, parcelas e livro-caixa — e hábitos, metas, viagens (inclusive compartilhadas), lugares, cinema e veículos na mesma órbita. Tudo liberado no primeiro acesso.",
  },
  {
    q: "Orçamento e parcelas são o quê, na prática?",
    a: "Orçamento: você define o teto e vê gasto vs. planejado por categoria. Parcelas: gerencia o que vence, o atrasado e o progresso do 12x — sem surpresa na fatura.",
  },
  {
    q: "Precisa conectar banco ou Open Finance?",
    a: "Não. Você digita (ou importa CSV onde existir). Controle consciente: cada lançamento é seu.",
  },
  {
    q: "Como funciona o teste?",
    a: `Você começa com ${PLANS.free.priceLabel} e acesso completo. Depois, Pro por ${PLANS.pro.priceLabel} no cartão — assine na Conta quando o teste acabar.`,
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Portal do Stripe pela Conta. Sem multa.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Conta autenticada, export CSV e exclusão de conta (LGPD). Não pedimos senha de banco.",
  },
  {
    q: "Como falo com vocês?",
    a: `Escreva para ${BRAND.email} ou chame no ${BRAND.instagramHandle}. Dúvida, bug ou sugestão de módulo — a gente responde.`,
  },
] as const;

const FAQ_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
});

function PhoneFrame({
  src,
  alt,
  priority,
  className = "",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[1.5rem] border border-white/12 bg-zinc-950 shadow-[0_28px_80px_-28px_rgba(14,165,233,0.45)] ring-1 ring-white/5 ${className}`}
    >
      <img
        src={src}
        alt={alt}
        width={390}
        height={844}
        className="aspect-[9/17] h-auto w-full object-cover object-top"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
      />
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
  const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0]?.q ?? null);
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

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      await joinWaitlist(email, "landing");
      track("waitlist_join", { source: "landing" });
      setStatus("ok");
      setMessage("Você entrou na lista. Avisamos por e-mail.");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  const ctaTo = !loading && user ? "/home" : "/login";
  const ctaLabel =
    !loading && user
      ? "Abrir app"
      : billingLive
        ? "Começar grátis"
        : "Entrar na lista";
  const heroSub = billingLive
    ? `7 dias grátis · depois Pro ${PLANS.pro.priceLabel}`
    : `Lista de espera · ${BRAND.wedge}`;

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
          {billingLive || (!loading && user) ? (
            <Button size="sm" className="rounded-full px-4" asChild>
              <Link to={ctaTo} onClick={() => track("landing_cta_nav")}>
                {ctaLabel}
              </Link>
            </Button>
          ) : (
            <Button size="sm" className="rounded-full px-4" asChild>
              <a href="#waitlist">{ctaLabel}</a>
            </Button>
          )}
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero — Home como prova dominante */}
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
              {billingLive || (!loading && user) ? (
                <Button size="lg" className="rounded-full px-7" asChild>
                  <Link
                    to={ctaTo}
                    onClick={() => track("landing_cta_login")}
                  >
                    {ctaLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button size="lg" className="rounded-full px-7" asChild>
                  <a
                    href="#waitlist"
                    onClick={() => track("landing_cta_waitlist")}
                  >
                    {ctaLabel}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              )}
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
            <PhoneFrame
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

        {/* Controle = o que faz pagar */}
        <section
          id="controle"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4 }}
            className="max-w-xl"
          >
            <p className="text-sm font-medium text-sky-400/90">Controle do mês</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              O que faz alguém assinar
            </h2>
            <p className="mt-3 text-zinc-400">
              Orçamento e parcelas — o diferencial. O resto do life OS vem junto.
            </p>
          </motion.div>

          <div className="mt-16 space-y-20 sm:mt-20 sm:space-y-28">
            {MONEY_FEATURES.map((feat) => (
              <motion.div
                key={feat.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.45 }}
                className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <div className={feat.reverse ? "lg:order-2" : "lg:order-1"}>
                  <p className="text-sm font-medium text-sky-400/80">
                    {feat.eyebrow}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {feat.title}
                  </h3>
                  <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
                    {feat.body}
                  </p>
                  <ul className="mt-5 space-y-2">
                    {feat.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2 text-sm text-zinc-300"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  className={`mx-auto w-full max-w-[280px] ${
                    feat.reverse ? "lg:order-1" : "lg:order-2"
                  }`}
                >
                  <PhoneFrame src={feat.src} alt={feat.alt} />
                </div>
              </motion.div>
            ))}
          </div>

          {/* Prova extra: dashboard finanças com alertas */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4 }}
            className="mt-20 grid items-center gap-10 border-t border-white/10 pt-16 lg:grid-cols-2 lg:gap-16"
          >
            <div>
              <p className="text-sm font-medium text-sky-400/80">Finanças</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                O mês inteiro, com alertas
              </h3>
              <p className="mt-3 max-w-md text-base leading-relaxed text-zinc-400">
                Receita, despesa e saldo — e as parcelas atrasadas ou próximas
                já no dashboard. Compartilhe o mês ou exporte CSV.
              </p>
            </div>
            <div className="mx-auto w-full max-w-[280px]">
              <PhoneFrame
                src="/marketing/financas.png"
                alt="Dashboard de Finanças com alertas de parcelas"
              />
            </div>
          </motion.div>
        </section>

        {/* Life OS */}
        <section
          id="modulos"
          className="scroll-mt-20 border-t border-white/8 bg-gradient-to-b from-sky-500/[0.05] to-transparent"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4 }}
              className="max-w-xl"
            >
              <p className="text-sm font-medium text-sky-400/90">Life OS</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                O resto da vida, na mesma órbita
              </h2>
              <p className="mt-3 text-zinc-400">
                Liberado desde o dia 1. Sem trocar de app — e sem gate de tour.
              </p>
            </motion.div>

            <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {LIFE_MODULES.map((mod, i) => (
                <motion.figure
                  key={mod.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{
                    delay: Math.min(i * 0.04, 0.2),
                    duration: 0.4,
                  }}
                  className="mx-auto w-full max-w-[240px] space-y-3 sm:max-w-none"
                >
                  <PhoneFrame
                    src={mod.src}
                    alt={`${mod.label} no ${BRAND.name}`}
                  />
                  <figcaption>
                    <p className="text-sm font-medium text-zinc-100">
                      {mod.label}
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-zinc-500">
                      {mod.body}
                    </p>
                  </figcaption>
                </motion.figure>
              ))}
            </div>
          </div>
        </section>

        {/* Planos */}
        <section
          id="planos"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4 }}
            className="mx-auto max-w-xl text-center"
          >
            <p className="text-sm font-medium text-sky-400/90">Planos</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Teste tudo. Depois, Pro simples.
            </h2>
            <p className="mt-3 text-zinc-400">
              Orçamento, parcelas e life OS inclusos. Sem asteriscos.
            </p>
          </motion.div>

          <div className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2">
            {([PLANS.free, PLANS.pro] as const).map((plan) => {
              const isPro = plan.id === "pro";
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4 }}
                  className={`relative rounded-2xl border p-6 sm:p-7 ${
                    isPro
                      ? "border-sky-400/40 bg-sky-500/10"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  {isPro ? (
                    <span className="absolute -top-3 left-6 rounded-full bg-sky-400 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-950">
                      Mais popular
                    </span>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    <span className="text-sm font-medium text-zinc-300">
                      {plan.priceLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-400">{plan.blurb}</p>
                  <ul className="mt-5 space-y-2.5">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm text-zinc-300"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {billingLive || (!loading && user) ? (
                    <Button
                      className={
                        isPro
                          ? "mt-6 w-full rounded-full"
                          : "mt-6 w-full rounded-full border-white/20 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"
                      }
                      variant={isPro ? "default" : "outline"}
                      asChild
                    >
                      <Link
                        to={ctaTo}
                        onClick={() =>
                          track("landing_cta_plan", { plan: plan.id })
                        }
                      >
                        {isPro ? ctaLabel : "Começar teste"}
                      </Link>
                    </Button>
                  ) : null}
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Redução de risco */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-8 sm:px-8">
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {GUARANTEES.map((item, i) => (
              <motion.li
                key={item.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <Check className="h-4 w-4 shrink-0 text-sky-400" />
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  {item.body}
                </p>
              </motion.li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          className="mt-12 scroll-mt-20 border-t border-white/8 bg-white/[0.02]"
        >
          <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="text-center">
              <p className="text-sm font-medium text-sky-400/90">Dúvidas</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                Perguntas frequentes
              </h2>
            </div>
            <div className="mt-10 space-y-2">
              {FAQS.map((item) => {
                const open = openFaq === item.q;
                return (
                  <Collapsible
                    key={item.q}
                    open={open}
                    onOpenChange={(next) => setOpenFaq(next ? item.q : null)}
                  >
                    <div className="rounded-xl border border-white/10 bg-black/20">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium text-zinc-100 sm:px-5 sm:text-base">
                        {item.q}
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <p className="border-t border-white/8 px-4 pb-4 pt-3 text-sm leading-relaxed text-zinc-400 sm:px-5">
                          {item.a}
                        </p>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          {billingLive ? (
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

              <div
                id="waitlist"
                className="mx-auto mt-12 max-w-md border-t border-white/10 pt-8 text-left"
              >
                <p className="text-sm font-medium text-zinc-300">
                  Prefere só ser avisado?
                </p>
                <form
                  onSubmit={(e) => void handleWaitlist(e)}
                  className="mt-3 flex flex-col gap-2 sm:flex-row"
                >
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="border-white/15 bg-black/30 text-zinc-100 placeholder:text-zinc-500"
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={status === "loading"}
                    className="border-white/20 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    {status === "loading" ? "Enviando..." : "Avisar-me"}
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
              </div>
            </motion.div>
          ) : (
            <motion.div
              id="waitlist"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="rounded-[1.75rem] border border-sky-400/25 bg-sky-500/10 px-6 py-12 sm:px-12"
            >
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Lista de espera do Pro
              </h2>
              <p className="mt-3 max-w-xl text-zinc-400">
                Checkout ainda fechado. Deixe o e-mail e avisamos quando o Pro (
                {PLANS.pro.priceLabel}) liberar.
              </p>
              <form
                onSubmit={(e) => void handleWaitlist(e)}
                className="mt-6 flex max-w-md flex-col gap-2 sm:flex-row"
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
            </motion.div>
          )}
        </section>

        {/* No radar — direção, não prazo */}
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

        {/* Fale conosco */}
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

      {/* CTA fixo — só mobile, depois do hero */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#070b14]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-md transition-transform duration-300 md:hidden ${
          showStickyCta ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs leading-tight text-zinc-400">{heroSub}</p>
          {billingLive || (!loading && user) ? (
            <Button size="sm" className="rounded-full px-5" asChild>
              <Link to={ctaTo} onClick={() => track("landing_cta_sticky")}>
                {ctaLabel}
              </Link>
            </Button>
          ) : (
            <Button size="sm" className="rounded-full px-5" asChild>
              <a href="#waitlist" onClick={() => track("landing_cta_sticky")}>
                {ctaLabel}
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
