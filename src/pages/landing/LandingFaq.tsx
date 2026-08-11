import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "O que é o Orbyva?",
    a: "Um life OS: teto de gastos, contas e parcelas, e o resto da vida no mesmo lugar (hábitos, metas, viagens, lugares, cinema, livros, música e veículos). Tudo liberado no primeiro acesso.",
  },
  {
    q: "Como o Orbyva ajuda no dinheiro do mês?",
    a: "Você define um teto por categoria e vê o que ainda dá para gastar. Contas fixas e parceladas ficam listadas com alertas; na Projeção você vê a receber × a pagar e pode simular uma compra antes de comprometer o mês.",
  },
  {
    q: "O que tem além das finanças?",
    a: "Hábitos, metas, viagens com roteiro, lugares, cinema, livros, música, veículos e um cronômetro flutuante para acompanhar o tempo nas tarefas, tudo no mesmo login.",
  },
  {
    q: "Como funciona o teste?",
    a: `Você começa com ${PLANS.free.priceLabel} e acesso completo, sem cartão. Depois, Pro por ${PLANS.pro.priceLabel}; assine na Conta quando quiser continuar.`,
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Portal do Stripe pela Conta, em poucos cliques. Sem multa e sem ligação.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Conta autenticada, export CSV e exclusão de conta (LGPD). Seus dados são seus.",
  },
  {
    q: "Como falo com vocês?",
    a: `Escreva para ${BRAND.email} ou chame no ${BRAND.instagramHandle}. Dúvida, bug ou ideia de módulo: a gente responde.`,
  },
] as const;

export const FAQ_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
});

export function LandingFaq() {
  const [openFaq, setOpenFaq] = useState<string | null>(FAQS[0]?.q ?? null);
  const reduceMotion = useReducedMotion();

  return (
    <section
      id="faq"
      className="mt-12 scroll-mt-20 border-t border-white/8 bg-white/[0.02]"
    >
      <div className="mx-auto w-full max-w-3xl px-5 py-20 sm:px-8 sm:py-24">
        <LandingSectionTitle
          align="center"
          eyebrow="Dúvidas"
          title="Perguntas frequentes"
        />
        <div className="mt-10 space-y-2">
          {FAQS.map((item) => {
            const open = openFaq === item.q;
            return (
              <div
                key={item.q}
                className="rounded-xl border border-white/10 bg-black/20"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? null : item.q)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium text-zinc-100 sm:px-5 sm:text-base"
                >
                  {item.q}
                  <motion.span
                    animate={{ rotate: open ? 180 : 0 }}
                    transition={
                      reduceMotion ? { duration: 0 } : { duration: 0.2 }
                    }
                    className="shrink-0 text-zinc-500"
                  >
                    <ChevronDown className="size-4" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open ? (
                    <motion.div
                      key="content"
                      initial={
                        reduceMotion ? false : { height: 0, opacity: 0 }
                      }
                      animate={{ height: "auto", opacity: 1 }}
                      exit={
                        reduceMotion
                          ? { opacity: 0 }
                          : { height: 0, opacity: 0 }
                      }
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p
                        className={cn(
                          "px-4 pb-4 text-sm leading-relaxed text-zinc-400 sm:px-5"
                        )}
                      >
                        {item.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
