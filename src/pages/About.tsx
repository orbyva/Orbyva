import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const MODULES = [
  {
    title: "Início",
    body: "O dia de hoje: alertas, hábitos, próximo marco e o pulso do ledger.",
  },
  {
    title: "Finanças",
    body: "Livro-caixa, orçamento com teto e gerenciamento de parcelas — o diferencial do mês sob controle. CSV e card para compartilhar.",
  },
  {
    title: "Metas e hábitos",
    body: "O que você quer alcançar e o que faz todo dia para chegar lá.",
  },
  {
    title: "Viagens e lugares",
    body: "Roteiro, orçamento e checklist. Viagem compartilhada com amigos no Orbyva; lugares com nota para compartilhar.",
  },
  {
    title: "Cinema",
    body: "Watchlist, notas e opinião — importe filmes e séries de um CSV e compartilhe o card.",
  },
  {
    title: "Veículos",
    body: "Manutenção, documentos e abastecimentos sem perder o prazo.",
  },
] as const;

export function AboutPage() {
  useDocumentMeta({
    title: "Sobre o Orbyva",
    description:
      "Life OS brasileiro: orçamento com teto, parcelas, hábitos, metas, viagens, cinema e veículos.",
    path: "/about",
    image: "https://orbyva.app/marketing/hub.png",
  });

  return (
    <div className="relative min-h-svh overflow-hidden bg-[#0c1222] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(14,165,233,0.2),_transparent_55%)]"
      />

      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <Link to="/" aria-label={BRAND.name} className="inline-flex">
          <BrandLogo
            variant="mark"
            className="size-10 rounded-xl bg-white"
            alt={BRAND.name}
          />
        </Link>
        <Link
          to="/login"
          className="text-sm text-zinc-400 transition-colors hover:text-white"
        >
          Entrar
        </Link>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-20 pt-4">
        <BrandLogo
          variant="full"
          className="mb-8 h-auto w-full max-w-[240px] rounded-2xl bg-white p-4"
        />

        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Sobre o {BRAND.name}
        </h1>
        <p className="mt-4 text-lg text-zinc-300">{BRAND.tagline}.</p>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-400">
          {BRAND.name} é o seu{" "}
          <span className="text-zinc-200">{BRAND.wedge.toLowerCase()}</span>:
          um lugar só para organizar a vida real — grana, rotina, planos,
          viagens, cinema e carro — sem espalhar tudo em cinco apps.
        </p>

        <section className="mt-12">
          <h2 className="text-sm font-medium uppercase tracking-wide text-sky-300/90">
            Por que existe
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-400">
            A gente cansa de abrir uma ferramenta para o cartão, outra para o
            hábito, outra para a viagem. O {BRAND.name} nasceu para ser a
            órbita: o que importa hoje no centro, e o resto girando com
            contexto — especialmente o saldo, porque vida organizada também é
            vida que sabe para onde o dinheiro foi.
          </p>
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-medium uppercase tracking-wide text-sky-300/90">
            O que você encontra
          </h2>
          <ul className="mt-5 space-y-4">
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
        </section>

        <section className="mt-12">
          <h2 className="text-sm font-medium uppercase tracking-wide text-sky-300/90">
            Como funciona
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-400">
            Conta pessoal com login Google. Seus dados ficam na sua órbita —
            dá para exportar e excluir quando quiser. O produto evolui em
            público: teste de 7 dias, Pro e melhorias contínuas.
          </p>
        </section>

        <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-base font-semibold text-zinc-100">Contato</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
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
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <Link to="/" className="text-zinc-300 hover:text-white">
              Início
            </Link>
            <span className="text-zinc-600">·</span>
            <Link to="/terms" className="text-zinc-300 hover:text-white">
              Termos
            </Link>
            <span className="text-zinc-600">·</span>
            <Link to="/privacy" className="text-zinc-300 hover:text-white">
              Privacidade
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AboutPage;
