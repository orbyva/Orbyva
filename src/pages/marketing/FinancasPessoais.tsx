import { Link } from "react-router-dom";
import { MarketingPage } from "@/pages/marketing/MarketingPage";

export default function FinancasPessoaisPage() {
  return (
    <MarketingPage
      path="/financas-pessoais"
      title="Finanças pessoais · Orbyva"
      description="Organize finanças pessoais no Orbyva: teto de gastos, contas, parcelas e planejamento do mês no mesmo Life OS."
      h1="Organize suas finanças pessoais com o Orbyva"
      lead={
        <>
          <p>
            O Orbyva é um Life OS brasileiro que coloca o controle financeiro no
            centro da organização pessoal: teto por categoria, contas, parcelas e
            visão do mês, junto de metas e planejamento da vida.
          </p>
        </>
      }
      sections={[
        {
          title: "Como organizar minhas finanças?",
          body: (
            <>
              <p>
                Comece pelo teto de gastos: defina quanto cabe em cada categoria
                e acompanhe o que ainda dá para gastar. Contas fixas e
                parceladas ficam listadas com alertas, para o mês não “estourar”
                sem você perceber.
              </p>
              <p>
                Se quiser um teste rápido sem conta, use{" "}
                <Link
                  to="/dentro-do-orcamento"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  Está dentro do orçamento?
                </Link>
                : renda, contas e o valor da compra.
              </p>
            </>
          ),
        },
        {
          title: "Como acompanhar meus gastos?",
          body: (
            <p>
              Lançamentos e recorrências alimentam o dashboard do mês. Você vê a
              receber × a pagar, simula compras e mantém o restante atualizado,
              em vez de planilhas soltas ou apps só de cartão.
            </p>
          ),
        },
        {
          title: "Como juntar organização financeira e planejamento pessoal?",
          body: (
            <>
              <p>
                No Orbyva, finanças pessoais convivem com{" "}
                <Link
                  to="/metas"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  metas
                </Link>
                , hábitos e{" "}
                <Link
                  to="/planejamento-pessoal"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  planejamento pessoal
                </Link>
                . Objetivos em R$ podem mostrar quanto guardar por mês, no mesmo
                login do orçamento.
              </p>
              <p>
                Saiba mais sobre o conceito em{" "}
                <Link
                  to="/life-os"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  O que é um Life OS?
                </Link>
                .
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
