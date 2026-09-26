import { Link } from "react-router-dom";
import { MarketingPage } from "@/pages/marketing/MarketingPage";
import { PLANS, TRIAL_DAYS } from "@/lib/plan";

export default function AppOrganizacaoPessoalPage() {
  return (
    <MarketingPage
      path="/app-organizacao-pessoal"
      title="Aplicativo para organizar finanças, metas e vida pessoal · Orbyva"
      description="O Orbyva é um aplicativo de organização pessoal e Life OS que reúne finanças, metas e planejamento da vida."
      h1="Aplicativo para organizar finanças, metas e vida pessoal"
      includeAppSchema
      lead={
        <p>
          O Orbyva é um aplicativo de organização pessoal e Life OS que reúne
          finanças pessoais, metas e planejamento da vida em uma única
          plataforma.
        </p>
      }
      sections={[
        {
          title: "O que é o Orbyva?",
          body: (
            <p>
              É um Life OS brasileiro (PWA) para centralizar o controle do mês e
              o restante da organização da vida (hábitos, viagens, lugares,
              cinema, livros, música e veículos) no mesmo login.
            </p>
          ),
        },
        {
          title: "Para quem o Orbyva é indicado?",
          body: (
            <p>
              Para quem quer parar de usar vários aplicativos só para organizar a
              vida pessoal: quem precisa de orçamento, metas e rotina no mesmo
              lugar, em português.
            </p>
          ),
        },
        {
          title: "O que posso organizar no Orbyva?",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Finanças: teto, contas, parcelas e projeção</li>
              <li>Metas e hábitos</li>
              <li>Viagens, lugares e entretenimento</li>
              <li>Veículos, tarefas, notas e lista de compras</li>
            </ul>
          ),
        },
        {
          title: "Como funciona a parte financeira?",
          body: (
            <p>
              Você define tetos, lança movimentações e acompanha o mês. Dá para
              testar se uma compra cabe sem login em{" "}
              <Link
                to="/dentro-do-orcamento"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                Está dentro do orçamento?
              </Link>
              . Detalhes em{" "}
              <Link
                to="/financas-pessoais"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                finanças pessoais
              </Link>
              .
            </p>
          ),
        },
        {
          title: "Como funcionam as metas?",
          body: (
            <p>
              Objetivos com progresso ficam ao lado das finanças. Metas em R$
              podem indicar quanto guardar por mês. Veja a página{" "}
              <Link
                to="/metas"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                Metas
              </Link>
              .
            </p>
          ),
        },
        {
          title:
            "Qual a diferença entre usar o Orbyva e vários aplicativos separados?",
          body: (
            <p>
              Apps separados aprofundam um nicho; o Orbyva prioriza o quadro
              completo da vida pessoal. Menos troca de contexto, um login, e
              finanças conversando com metas e rotina. Conceito em{" "}
              <Link
                to="/life-os"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                Life OS
              </Link>
              .
            </p>
          ),
        },
        {
          title: "Existe versão gratuita?",
          body: (
            <p>
              Sim, no sentido de teste: {TRIAL_DAYS} dias com acesso completo,
              sem cartão. A ferramenta{" "}
              <Link
                to="/dentro-do-orcamento"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                Está dentro do orçamento?
              </Link>{" "}
              continua grátis sem cadastro.
            </p>
          ),
        },
        {
          title: "Quanto custa?",
          body: (
            <p>
              Após o teste, o plano Pro custa {PLANS.pro.priceLabel}. Assinatura
              e cancelamento pela Conta (Stripe).
            </p>
          ),
        },
      ]}
    />
  );
}
