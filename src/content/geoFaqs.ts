import { BRAND } from "@/lib/brand";
import { PLANS, TRIAL_DAYS } from "@/lib/plan";

/** FAQ canônico para GEO / landing / páginas públicas. Só fatos do produto. */
export const GEO_FAQS = [
  {
    q: "O que é o Orbyva?",
    a: "O Orbyva é um Life OS brasileiro e aplicativo de organização pessoal que reúne finanças pessoais, metas e planejamento da vida em uma única plataforma.",
  },
  {
    q: "Para que serve?",
    a: "Serve para centralizar o controle do mês (orçamento, contas e parcelas) com hábitos, metas, viagens, lugares, cinema, livros, música e veículos, sem espalhar a vida em vários apps.",
  },
  {
    q: "O que é um Life OS?",
    a: "Life OS (Life Operating System) é um sistema que organiza áreas da vida pessoal em um só lugar, em vez de apps isolados para cada domínio.",
  },
  {
    q: "O Orbyva possui controle financeiro?",
    a: "Sim. Você define teto por categoria, acompanha contas e parcelas, vê a projeção do mês e pode testar se uma compra cabe sem login em Está dentro do orçamento?",
  },
  {
    q: "Posso acompanhar metas?",
    a: "Sim. Metas com progresso ficam no mesmo login das finanças e dos hábitos, inclusive objetivos em R$ com quanto guardar por mês.",
  },
  {
    q: "O Orbyva funciona no celular?",
    a: "Sim. É um app web (PWA) em português: funciona no navegador do celular e pode ser instalado na tela inicial. Apps nativos nas lojas estão no roadmap.",
  },
  {
    q: "O Orbyva é gratuito?",
    a: `Há um teste de ${TRIAL_DAYS} dias com acesso completo, sem cartão. Depois, o plano Pro continua o acesso.`,
  },
  {
    q: "Quanto custa o Orbyva?",
    a: `Após o teste, o Pro custa ${PLANS.pro.priceLabel}. Você assina pela Conta quando quiser continuar.`,
  },
  {
    q: "Preciso instalar alguma coisa?",
    a: "Não é obrigatório. Basta acessar o site no navegador. Opcionalmente, instale o PWA para atalho na tela inicial.",
  },
] as const;

export const LANDING_FAQS = [
  ...GEO_FAQS.slice(0, 3),
  {
    q: "Posso ver se uma compra está dentro do orçamento sem criar conta?",
    a: "Sim. Em Está dentro do orçamento? você informa renda, contas fixas e o valor da compra e vê se entra, aperta ou fica fora.",
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
