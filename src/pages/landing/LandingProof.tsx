import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { track } from "@/lib/analytics";
import { fadeUp, staggerDelay } from "@/components/landing/landingMotion";

/**
 * Depoimentos reais — preencha quando tiver (Fase I ops).
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
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-24"
    >
      <LandingSectionTitle
        align="center"
        eyebrow="Prova"
        title={
          TESTIMONIALS.length > 0
            ? "Quem já está na órbita"
            : "Entre cedo. Sem risco."
        }
        description={
          TESTIMONIALS.length > 0
            ? "Feedback de quem está usando o Orbyva de verdade."
            : "Teste sem cartão, privacidade na mão e controle do mês desde o dia 1. Early access com as regras certas."
        }
      />

      {TESTIMONIALS.length > 0 ? (
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.li
              key={`${t.name}-${i}`}
              {...fadeUp}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
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
        <ul className="mt-12 grid gap-5 sm:grid-cols-3">
          {SOCIAL_SIGNALS.map((item, i) => (
            <motion.li
              key={item.title}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: staggerDelay(i), duration: 0.35 }}
              className="rounded-2xl border border-sky-400/15 bg-sky-500/[0.04] p-5 text-center sm:text-left"
            >
              <p className="text-sm font-medium text-zinc-100">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {item.body}
              </p>
            </motion.li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-center text-sm text-zinc-500">
        Quer entrar cedo e ajudar a moldar o produto?{" "}
        <Link
          to={ctaTo}
          className="font-medium text-sky-400 hover:text-sky-300"
          onClick={() => track("landing_cta_social_proof")}
        >
          Comece o teste grátis
        </Link>
        .
      </p>
    </section>
  );
}
