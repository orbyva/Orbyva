import { Link } from "react-router-dom";
import { MarketingPage } from "@/pages/marketing/MarketingPage";

export default function OrganizacaoPessoalPage() {
  return (
    <MarketingPage
      path="/organizacao-pessoal"
      title="Organização pessoal · Orbyva"
      description="Centralize a organização da vida pessoal: finanças, metas, hábitos e planejamento em um aplicativo brasileiro."
      h1="Organize sua vida pessoal em um único lugar"
      lead={
        <p>
          O Orbyva é um aplicativo brasileiro de organização pessoal e Life OS:
          em vez de um app para dinheiro, outro para hábitos e outro para
          viagens, você concentra finanças pessoais, metas e planejamento da
          vida na mesma plataforma.
        </p>
      }
      sections={[
        {
          title: "O que o Orbyva centraliza?",
          body: (
            <ul className="list-disc space-y-2 pl-5">
              <li>Controle do mês: orçamento, contas e parcelas</li>
              <li>Metas e hábitos</li>
              <li>Viagens, lugares e entretenimento (cinema, livros, música)</li>
              <li>Veículos, tarefas e notas, no mesmo login</li>
            </ul>
          ),
        },
        {
          title: "Organização pessoal × apps isolados",
          body: (
            <>
              <p>
                Apps isolados resolvem um pedaço bem, mas a vida acontece entre
                eles. Um Life OS reduz a troca de contexto e mantém produtividade
                ligada ao que você realmente precisa organizar.
              </p>
              <p>
                Leia{" "}
                <Link
                  to="/life-os"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  O que é um Life OS?
                </Link>{" "}
                ou a página{" "}
                <Link
                  to="/app-organizacao-pessoal"
                  className="text-sky-400 underline-offset-4 hover:underline"
                >
                  aplicativo para organizar finanças, metas e vida pessoal
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
