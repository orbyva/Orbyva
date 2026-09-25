import { Link } from "react-router-dom";
import { PLANS, TRIAL_DAYS } from "@/lib/plan";

type FaqItem = { q: string; a: string };

type PublicFaqProps = {
  items: readonly FaqItem[];
  title?: string;
  /** Se true, todas as respostas ficam no DOM (sem accordion). */
  alwaysOpen?: boolean;
};

/**
 * FAQ público com respostas no HTML (GEO). Accordion opcional só para UX;
 * com alwaysOpen=true o texto fica sempre visível para crawlers.
 */
export function PublicFaq({
  items,
  title = "Perguntas frequentes",
  alwaysOpen = true,
}: PublicFaqProps) {
  return (
    <section className="mt-14" aria-labelledby="faq-heading">
      <h2
        id="faq-heading"
        className="font-display text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl"
      >
        {title}
      </h2>
      <dl className="mt-8 divide-y divide-white/10 border-y border-white/10">
        {items.map((item) => (
          <div key={item.q} className="py-4">
            <dt className="text-sm font-medium text-zinc-100 sm:text-base">
              {item.q}
            </dt>
            <dd className="mt-2 text-sm leading-relaxed text-zinc-400">
              {alwaysOpen ? item.a : item.a}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-sm text-zinc-500">
        Quer experimentar?{" "}
        <Link
          to="/login?mode=signup"
          className="text-sky-400 underline-offset-4 hover:underline"
        >
          Comece com {TRIAL_DAYS} dias grátis
        </Link>
        ; depois Pro por {PLANS.pro.priceLabel}.
      </p>
    </section>
  );
}
