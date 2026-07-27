import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/plan";
import { track } from "@/lib/analytics";

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
                {showPlanCtas ? (
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
    </>
  );
}
