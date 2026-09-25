import { Link } from "react-router-dom";
import { MarketingPage } from "@/pages/marketing/MarketingPage";

export default function MetasPage() {
  return (
    <MarketingPage
      path="/metas"
      title="Metas pessoais · Orbyva"
      description="Transforme objetivos em metas acompanháveis no Orbyva, com progresso junto das finanças e do planejamento pessoal."
      h1="Transforme seus objetivos em metas acompanháveis"
      lead={
        <p>
          Metas no Orbyva fazem parte do mesmo Life OS das finanças pessoais e
          da organização da vida: progresso visível, hábitos no dia a dia e
          objetivos em R$ alinhados ao orçamento do mês.
        </p>
      }
      sections={[
        {
          title: "Por que acompanhar metas no mesmo app das finanças?",
          body: (
            <p>
              Quando a meta é financeira (reserva, viagem, dívida), o progresso
              ganha sentido ao lado do teto de gastos e das contas. Menos
              planilhas paralelas, mais clareza do que ainda cabe no mês.
            </p>
          ),
        },
        {
          title: "Como o Orbyva ajuda no acompanhamento?",
          body: (
            <>
              <p>
                Você registra objetivos, vê o andamento e conecta a rotina
                (hábitos, tarefas) ao que importa. O foco é planejamento pessoal
                contínuo, não só uma lista esquecida de resoluções.
              </p>
              <p>
                Veja também{" "}
                <Link
                  to="/financas-pessoais"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  finanças pessoais
                </Link>{" "}
                e{" "}
                <Link
                  to="/organizacao-pessoal"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  organização pessoal
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
