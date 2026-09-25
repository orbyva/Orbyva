import { Link } from "react-router-dom";
import { MarketingPage } from "@/pages/marketing/MarketingPage";

export default function ControleFinanceiroPage() {
  return (
    <MarketingPage
      path="/controle-financeiro"
      title="Controle financeiro pessoal · Orbyva"
      description="Controle financeiro pessoal com teto por categoria, projeção do mês e o restante da vida no mesmo app."
      h1="Controle financeiro pessoal no mesmo lugar da vida"
      lead={
        <p>
          Controle financeiro no Orbyva não é um silo: faz parte de um Life OS
          com metas e organização pessoal. Você vê o teto do mês, contas e
          parcelas, e o que ainda cabe antes de comprometer o orçamento.
        </p>
      }
      sections={[
        {
          title: "O que você controla",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Teto de gastos por categoria</li>
              <li>Contas fixas e parceladas com alertas</li>
              <li>Projeção a receber × a pagar</li>
              <li>
                Simulação rápida em{" "}
                <Link
                  to="/dentro-do-orcamento"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  Está dentro do orçamento?
                </Link>
              </li>
            </ul>
          ),
        },
        {
          title: "Além do extrato",
          body: (
            <p>
              O mesmo app cobre{" "}
              <Link
                to="/metas"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                metas
              </Link>{" "}
              e{" "}
              <Link
                to="/planejamento-pessoal"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                planejamento pessoal
              </Link>
              , para o controle financeiro conversar com o restante da vida.
            </p>
          ),
        },
      ]}
    />
  );
}
