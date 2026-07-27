import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";

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

  return (
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
  );
}
