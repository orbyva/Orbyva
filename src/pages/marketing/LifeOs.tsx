import { Link } from "react-router-dom";
import { MarketingPage } from "@/pages/marketing/MarketingPage";

export default function LifeOsPage() {
  return (
    <MarketingPage
      path="/life-os"
      title="O que é um Life OS? · Orbyva"
      description="Entenda o que é um Life OS, para que serve e como o Orbyva funciona como sistema operacional da vida pessoal."
      h1="O que é um Life OS?"
      includeAppSchema
      lead={
        <p>
          Life OS significa <em>Life Operating System</em>: um sistema para
          organizar áreas da vida pessoal (finanças, metas, hábitos,
          planejamento) em um só lugar, em vez de vários aplicativos isolados.
        </p>
      }
      sections={[
        {
          title: "O que significa Life OS?",
          body: (
            <p>
              É a ideia de tratar a organização da vida como um “sistema
              operacional”: uma base onde módulos (dinheiro, objetivos, rotina,
              viagens) compartilham a mesma conta, a mesma visão e o mesmo
              contexto. O termo aparece em produtos e comunidades de
              produtividade; não é uma marca registrada do Orbyva.
            </p>
          ),
        },
        {
          title: "Como funciona um Life OS?",
          body: (
            <p>
              Em geral, você cadastra os domínios da vida que importam, acompanha
              progresso e decisões no mesmo ambiente e reduz a troca entre apps.
              O valor está na integração: o orçamento conversa com a meta; o
              hábito aparece na timeline; a viagem tem checklist e dinheiro.
            </p>
          ),
        },
        {
          title: "Para que serve?",
          body: (
            <p>
              Serve quem sente que a vida está espalhada: planilha de gastos,
              app de hábitos, bloco de notas, watchlist, roteiro de viagem. Um
              Life OS não substitui um banco nem um ERP: organiza o pessoal.
            </p>
          ),
        },
        {
          title: "Life OS × aplicativos isolados",
          body: (
            <p>
              Apps isolados costumam ser ótimos em um nicho. O custo é
              fragmentação: senhas diferentes, dados que não se encontram e
              decisões sem o quadro completo. Um Life OS prioriza o quadro
              completo; um app isolado prioriza profundidade em um domínio.
            </p>
          ),
        },
        {
          title: "Como o Orbyva funciona como um Life OS",
          body: (
            <>
              <p>
                O Orbyva é um Life OS brasileiro e aplicativo de organização
                pessoal: finanças pessoais (teto, contas, parcelas), metas,
                hábitos, viagens, lugares, cinema, livros, música e veículos no
                mesmo login. Há ferramenta pública{" "}
                <Link
                  to="/dentro-do-orcamento"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  Está dentro do orçamento?
                </Link>{" "}
                e teste de acesso completo antes do plano Pro.
              </p>
              <p>
                Explore{" "}
                <Link
                  to="/financas-pessoais"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  finanças
                </Link>
                ,{" "}
                <Link
                  to="/metas"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  metas
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
        {
          title: "Para quem esse tipo de ferramenta é indicado",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Quem quer um único lugar para dinheiro e vida pessoal</li>
              <li>Quem cansa de sincronizar vários apps</li>
              <li>Quem busca planejamento pessoal contínuo, não só lista de tarefas</li>
              <li>Quem prefere produto em português, feito para o contexto brasileiro</li>
            </ul>
          ),
        },
      ]}
    />
  );
}
