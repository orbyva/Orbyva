import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { fadeUp, reveal, staggerDelay } from "@/components/landing/landingMotion";

/**
 * Depoimentos reais, preencha quando tiver (Fase I ops).
 * Enquanto vazio, a landing mostra sinais honestos de early access.
 */
const TESTIMONIALS: { quote: string; name: string; role: string }[] = [];

const SOCIAL_SIGNALS = [
  {
    title: "Você no controle",
    body: "Registre o que importa no seu ritmo. Sem fricção desnecessária.",
  },
  {
    title: "7 dias, tudo liberado",
    body: "Controle do mês + vida organizada, sem cartão no começo.",
  },
  {
    title: "Seus dados são seus",
    body: "Export CSV e exclusão da conta quando quiser. LGPD de verdade.",
  },
] as const;

export function LandingProof({ ctaTo }: { ctaTo: string }) {
  return (
    <section
      id="prova"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28"
    >
      <LandingSectionTitle
        title={
          TESTIMONIALS.length > 0
            ? "Quem já está na órbita"
            : "Entre cedo. Sem risco."
        }
        description={
          TESTIMONIALS.length > 0
            ? "Feedback de quem está usando o Orbyva de verdade."
            : "Teste sem cartão, privacidade na mão e controle do mês desde o dia 1."
        }
      />

      {TESTIMONIALS.length > 0 ? (
        <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-0">
          {TESTIMONIALS.map((t, i) => (
            <motion.li
              key={`${t.name}-${i}`}
              {...fadeUp}
              className={cn("sm:px-8", i > 0 && "lg:border-l lg:border-white/10")}
            >
              <p className="text-sm leading-relaxed text-zinc-200">
                “{t.quote}”
              </p>
              <p className="mt-4 text-sm font-medium text-zinc-100">{t.name}</p>
              <p className="text-xs text-zinc-500">{t.role}</p>
            </motion.li>
          ))}
        </ul>
      ) : (
        <ul className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-0">
          {SOCIAL_SIGNALS.map((item, i) => (
            <motion.li
              key={item.title}
              {...reveal(staggerDelay(i), 0.4)}
              className={cn(
                i > 0 && "sm:border-l sm:border-white/10 sm:pl-8",
                i < SOCIAL_SIGNALS.length - 1 && "sm:pr-8"
              )}
            >
              <p className="font-display text-lg font-semibold tracking-tight text-zinc-100">
                {item.title}
              </p>
              <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-zinc-400">
                {item.body}
              </p>
            </motion.li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-sm text-zinc-500">
        Quer entrar cedo e ajudar a moldar o produto?{" "}
        <Link
          to={ctaTo}
          className="font-medium text-sky-400 hover:text-sky-300"
          onClick={() => track("landing_cta_social_proof")}
        >
          Começar grátis
        </Link>.
      </p>
    </section>
  );
}
