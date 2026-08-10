import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingMagneticCta } from "@/components/landing/LandingMagneticCta";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { PLANS } from "@/lib/plan";
import { track } from "@/lib/analytics";
import { fadeUp, staggerDelay } from "@/components/landing/landingMotion";

/** Redução de risco — o que responde “e se eu não gostar?”. */
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
    body: "Export CSV e exclusão da conta a qualquer momento — LGPD na prática.",
  },
  {
    title: "Sem senha de banco",
    body: "Zero Open Banking. Você registra o que quiser, no seu ritmo.",
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
    <>
      <section
        id="planos"
        className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28"
      >
        <LandingSectionTitle
          align="center"
          eyebrow="Planos"
          title="7 dias para sentir o controle. Depois, Pro simples."
          description={`Tudo incluso no teste. Continue por ${PLANS.pro.priceLabel} — sem asteriscos.`}
        />

        <div className="mx-auto mt-12 grid max-w-3xl gap-5 sm:grid-cols-2 sm:items-stretch">
          {([PLANS.free, PLANS.pro] as const).map((plan) => {
            const isPro = plan.id === "pro";
            return (
              <motion.div
                key={plan.id}
                {...fadeUp}
                className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 ${
                  isPro
                    ? "border-sky-400/50 bg-sky-500/10 shadow-[0_0_40px_-12px_rgba(14,165,233,0.45)] sm:scale-[1.03]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                {isPro ? (
                  <span className="absolute -top-3 left-6 rounded-full bg-sky-400 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-950">
                    Mais popular
                  </span>
                ) : null}
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-display text-xl font-semibold">
                    {plan.name}
                  </h3>
                  <span className="text-sm font-medium text-zinc-300">
                    {plan.priceLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">{plan.blurb}</p>
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
                {showPlanCtas ? (
                  isPro ? (
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
                  ) : (
                    <Button
                      className="mt-6 w-full rounded-full border-white/20 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"
                      variant="outline"
                      asChild
                    >
                      <Link
                        to={ctaTo}
                        onClick={() =>
                          track("landing_cta_plan", { plan: plan.id })
                        }
                      >
                        Começar grátis
                      </Link>
                    </Button>
                  )
                ) : null}
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-8 sm:px-8">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {GUARANTEES.map((item, i) => (
            <motion.li
              key={item.title}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: staggerDelay(i), duration: 0.35 }}
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
    </>
  );
}
