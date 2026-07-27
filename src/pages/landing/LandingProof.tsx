import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { track } from "@/lib/analytics";

/**
 * Depoimentos reais — preencha quando tiver (Fase I ops).
 * Enquanto vazio, a landing mostra sinais honestos de early access.
 */
const TESTIMONIALS: { quote: string; name: string; role: string }[] = [
  // Ex.: { quote: "…", name: "Ana", role: "Early access" },
];

const SOCIAL_SIGNALS = [
  {
    title: "Sem senha de banco",
    body: "Você registra o que quiser. Sem Open Finance.",
  },
  {
    title: "7 dias, tudo liberado",
    body: "Orçamento, parcelas e life OS — sem cartão no início.",
  },
  {
    title: "Seus dados são seus",
    body: "Export CSV e exclusão da conta quando quiser (LGPD).",
  },
] as const;

export function LandingProof({ ctaTo }: { ctaTo: string }) {
  return (
    <section
      id="prova"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-24"
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-xl text-center"
      >
        <p className="text-sm font-medium text-sky-400/90">Prova</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {TESTIMONIALS.length > 0
            ? "Quem já está na órbita"
            : "Early access — com as regras certas"}
        </h2>
        <p className="mt-3 text-zinc-400">
          {TESTIMONIALS.length > 0
            ? "Feedback de quem está usando o Orbyva de verdade."
            : "Ainda estamos no começo. O que não negociamos: privacidade, teste sem cartão e controle do mês."}
        </p>
      </motion.div>

      {TESTIMONIALS.length > 0 ? (
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <motion.li
              key={`${t.name}-${i}`}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
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
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.35 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center sm:text-left"
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
        Quer entrar cedo e deixar seu feedback?{" "}
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
