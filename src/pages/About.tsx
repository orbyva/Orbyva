import { Link } from "react-router-dom";
import { PublicPageShell, PublicSection } from "@/components/PublicPageShell";
import { BrandWordmark } from "@/components/BrandWordmark";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const MODULES = [
  {
    title: "Início e timeline",
    body: "Resumo do dia — alertas, hábitos, saldo e o que vem a seguir — mais um feed de eventos de todos os módulos.",
  },
  {
    title: "Finanças",
    body: "Teto de gastos por categoria, contas e parcelas com projeção — o núcleo do mês sob controle.",
  },
  {
    title: "Hábitos e metas",
    body: "Check-ins e streaks no dia a dia; objetivos com progresso — inclusive quanto guardar por mês nas metas em R$.",
  },
  {
    title: "Viagens e lugares",
    body: "Roteiro, orçamento e checklist. Viagem compartilhada com amigos no Orbyva; lugares com nota e opinião para compartilhar.",
  },
  {
    title: "Cinema, livros e música",
    body: "Watchlist e notas de filmes/séries; estante de livros com marca-página; álbuns e faixas — tudo com card para Stories.",
  },
  {
    title: "Veículos",
    body: "Manutenção, combustível, quilometragem e documentos — sem perder prazo.",
  },
] as const;

export function AboutPage() {
  useDocumentMeta({
    title: "Sobre o Orbyva",
    description:
      "Life OS brasileiro: saiba o que cabe no mês e organize hábitos, metas, viagens, lugares, cinema, livros, música e veículos numa só órbita.",
    path: "/about",
    image: "https://orbyva.app/marketing/hub.png",
  });

  return (
    <PublicPageShell>
      <BrandWordmark size="lg" showSubtitle={false} />

      <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Sobre o {BRAND.name}
      </h1>
      <p className="mt-4 text-lg text-zinc-300">{BRAND.tagline}.</p>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-400">
        {BRAND.name} é o seu{" "}
        <span className="text-zinc-200">{BRAND.wedge.toLowerCase()}</span>: o
        que você espalha em planilha, app de hábitos, cinema, viagem e bloco de
        notas — numa só órbita, desde o primeiro dia.
      </p>

      <PublicSection title="Por que existe">
        <p>
          Abrir um app para o cartão, outro para o hábito, outro para a viagem e
          outro para a watchlist cansa. O {BRAND.name} nasceu para juntar o
          controle do mês — o que ainda cabe gastar, contas e o saldo — com o resto
          da vida real, sem pedir senha de banco.
        </p>
      </PublicSection>

      <PublicSection title="O que você encontra">
        <ul className="space-y-4">
          {MODULES.map((m) => (
            <li
              key={m.title}
              className="border-b border-white/10 pb-4 last:border-0"
            >
              <p className="font-medium text-zinc-100">{m.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                {m.body}
              </p>
            </li>
          ))}
        </ul>
      </PublicSection>

      <PublicSection title="Como funciona">
        <p>
          Conta pessoal com login Google. Você começa com{" "}
          <span className="text-zinc-200">{PLANS.free.priceLabel}</span> e
          acesso completo; depois, Pro por{" "}
          <span className="text-zinc-200">{PLANS.pro.priceLabel}</span> — assine
          na Conta quando quiser continuar. Seus dados ficam na sua órbita: dá
          para exportar CSV e excluir a conta quando quiser (LGPD).
        </p>
        <p>
          O produto evolui em público: PWA, alertas, compartilhamento de cards e
          melhorias contínuas. Sem conectar conta do banco — você registra o que
          quiser, do seu jeito.
        </p>
      </PublicSection>

      <section className="mt-12 rounded-2xl border border-sky-400/20 bg-sky-500/[0.06] p-6 sm:p-7">
        <h2 className="font-display text-lg font-semibold text-zinc-100">
          Pronto para entrar na órbita?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          {PLANS.free.priceLabel} com controle do mês e vida organizada. Cartão
          só quando assinar o Pro.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            to="/login?mode=signup"
            className="rounded-full bg-sky-400 px-5 py-2.5 text-sm font-semibold text-sky-950 transition hover:bg-sky-300"
          >
            Começar grátis
          </Link>
          <Link
            to="/"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-zinc-300 transition hover:border-white/25 hover:text-white"
          >
            Ver a landing
          </Link>
        </div>
      </section>

      <PublicSection title="Contato">
        <p>
          Dúvidas, ideias ou parceria:{" "}
          <a
            href={`mailto:${BRAND.email}`}
            className="text-sky-300 underline-offset-2 hover:underline"
          >
            {BRAND.email}
          </a>
          {" · "}
          <a
            href={BRAND.instagramUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sky-300 underline-offset-2 hover:underline"
          >
            {BRAND.instagramHandle}
          </a>
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}

export default AboutPage;
