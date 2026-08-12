import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";

export const FAQS = [
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
