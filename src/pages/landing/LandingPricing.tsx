import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { LandingMagneticCta } from "@/components/landing/LandingMagneticCta";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { PLANS } from "@/lib/plan";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { fadeUp, reveal, staggerDelay } from "@/components/landing/landingMotion";

/** Redução de risco: o que responde “e se eu não gostar?”. */
const GUARANTEES = [
  {
    title: "Teste sem cartão",
    body: "7 dias com tudo liberado. O cartão só entra se você quiser o Pro.",
  },
  {
    title: "Cancele em 1 clique",
    body: "Portal oficial do Stripe na Conta. Sem multa, sem ligação, sem drama.",
  },
  {
    title: "Seus dados são seus",
    body: "Export CSV e exclusão da conta a qualquer momento. LGPD na prática.",
  },
  {
    title: "Cronômetro flutuante",
    body: "Timer sempre à mão enquanto você navega entre módulos e tarefas.",
  },
] as const;

export function LandingPricing({
  ctaTo,
  ctaLabel,
  showPlanCtas,
}: {
  ctaTo: string;
  ctaLabel: string;
  showPlanCtas: boolean;
}) {
  return (
    <section
      id="planos"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28"
    >
      <LandingSectionTitle
        title="7 dias para sentir o controle. Depois, Pro simples."
        description={`Tudo incluso no teste. Continue por ${PLANS.pro.priceLabel}, sem asteriscos.`}
      />

      <div className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2 sm:items-stretch">
        {([PLANS.free, PLANS.pro] as const).map((plan) => {
          const isPro = plan.id === "pro";
          return (
            <motion.div
              key={plan.id}
              {...fadeUp}
              className={cn(
                "relative flex flex-col rounded-[1.75rem] border p-1.5",
                isPro
                  ? "border-sky-400/35 bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : "border-white/10 bg-white/[0.03]"
              )}
            >
              <div
                className={cn(
                  "flex flex-1 flex-col rounded-[calc(1.75rem-0.375rem)] p-6 sm:p-7",
                  isPro
                    ? "border border-sky-400/20 bg-sky-500/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : "bg-transparent"
                )}
              >
                {isPro ? (
                  <span className="mb-3 self-start rounded-full bg-sky-400 px-2.5 py-0.5 text-[11px] font-semibold text-sky-950">
                    Mais popular
                  </span>
                ) : null}
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-xl font-semibold tracking-tight">
                    {plan.name}
                  </h3>
                  <span className="text-sm font-medium tabular-nums text-zinc-300">
                    {plan.priceLabel}
                  </span>
                </div>
                <p className="mt-2 min-h-[2.5rem] text-sm text-zinc-400">
                  {plan.blurb}
                </p>
                <ul className="mt-5 flex-1 space-y-2.5">
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
                {showPlanCtas && isPro ? (
                  <div className="mt-6 flex w-full justify-center">
                    <LandingMagneticCta
                      href={ctaTo}
                      label={ctaLabel}
                      size="md"
                      onClick={() =>
                        track("landing_cta_plan", { plan: plan.id })
                      }
                    />
                  </div>
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </div>

      <ul className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
        {GUARANTEES.map((item, i) => (
          <motion.li
            key={item.title}
            {...reveal(staggerDelay(i), 0.4)}
            className={cn(
              i > 0 && "lg:border-l lg:border-white/10 lg:pl-6",
              i < GUARANTEES.length - 1 && "lg:pr-6"
            )}
          >
            <p className="text-sm font-medium text-zinc-100">{item.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-500">
              {item.body}
            </p>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
