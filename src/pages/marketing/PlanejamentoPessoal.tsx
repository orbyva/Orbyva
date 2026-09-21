import { Link } from "react-router-dom";
import { MarketingPage } from "@/pages/marketing/MarketingPage";

export default function PlanejamentoPessoalPage() {
  return (
    <MarketingPage
      path="/planejamento-pessoal"
      title="Planejamento pessoal · Orbyva"
      description="Planejamento pessoal com metas, hábitos e finanças conectados: um Life OS para organizar a rotina."
      h1="Planejamento pessoal com finanças e metas juntos"
      lead={
        <p>
          Planejamento pessoal no Orbyva une rotina, objetivos e dinheiro: hábitos,
          metas e finanças pessoais no mesmo Life OS, para a produtividade não
          ficar desconectada do mês.
        </p>
      }
      sections={[
        {
          title: "O que entra no planejamento",
          body: (
            <p>
              Metas com progresso, hábitos do dia a dia, tarefas e o quadro
              financeiro do mês. A ideia é ver o que você quer alcançar e o que
              o orçamento permite, no mesmo lugar.
            </p>
          ),
        },
        {
          title: "Próximos passos",
          body: (
            <p>
              Se o foco é dinheiro, veja{" "}
              <Link
                to="/financas-pessoais"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                finanças pessoais
              </Link>
              . Se quer o conceito completo, leia{" "}
              <Link
                to="/life-os"
                className="text-sky-400 underline-offset-4 hover:underline"
              >
                O que é um Life OS?
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
