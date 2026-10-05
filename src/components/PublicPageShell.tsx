import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type PublicPageShellProps = {
  children: ReactNode;
  /** CTA do header direito */
  cta?: { to: string; label: string };
  className?: string;
  /** Largura do conteúdo */
  width?: "narrow" | "wide";
};

/**
 * Shell das páginas públicas (Sobre, Termos, Privacidade) , 
 * visual alinhado à landing (fundo escuro + sky).
 */
export function PublicPageShell({
  children,
  cta = { to: "/login?mode=signup", label: "Começar grátis" },
  className,
  width = "narrow",
}: PublicPageShellProps) {
  const maxW = width === "wide" ? "max-w-4xl" : "max-w-3xl";

  return (
    <div
      className={cn(
        "relative min-h-svh bg-[var(--landing-bg)] text-zinc-100",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(14,165,233,0.22),transparent_55%)]"
      />

      {/* `py-5` quebrado em `pb-5` + `pt-[1.25rem + inset]`: trocar o `py` só pelo `pt` perderia o
          padding de baixo. Cobre de uma vez `/about`, `/terms`, `/privacy`,
          `/dentro-do-orcamento` e as páginas de marketing/blog, alcançáveis pelo rodapé sem sair
          do PWA instalado. */}
      <header
        className={cn(
          "relative z-10 mx-auto flex w-full items-center justify-between px-5 pb-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))]",
          maxW
        )}
      >
        <Link to="/" aria-label={BRAND.name} className="inline-flex shrink-0">
          <BrandLogo
            variant="favicon"
            className="size-9 sm:size-10"
            alt={BRAND.name}
          />
        </Link>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Entrar
          </Link>
          <Link
            to={cta.to}
            className="rounded-full bg-sky-400 px-4 py-1.5 text-sm font-semibold text-sky-950 transition hover:bg-sky-300"
          >
            {cta.label}
          </Link>
        </div>
      </header>

      <main className={cn("relative z-10 mx-auto w-full px-5 pb-16 pt-2", maxW)}>
        {children}
      </main>

      <footer
        className={cn(
          "relative z-10 mx-auto flex w-full flex-wrap items-center justify-between gap-4 border-t border-white/10 px-5 py-8 text-sm text-zinc-500",
          maxW
        )}
      >
        <span>
          © {new Date().getFullYear()} {BRAND.name} · {BRAND.domain}
        </span>
        <div className="flex flex-wrap gap-4">
          <Link to="/" className="hover:text-zinc-300">
            Início
          </Link>
          <Link to="/financas-pessoais" className="hover:text-zinc-300">
            Finanças
          </Link>
          <Link to="/metas" className="hover:text-zinc-300">
            Metas
          </Link>
          <Link to="/life-os" className="hover:text-zinc-300">
            Life OS
          </Link>
          <Link to="/blog" className="hover:text-zinc-300">
            Blog
          </Link>
          <Link to="/dentro-do-orcamento" className="hover:text-zinc-300">
            Está dentro do orçamento?
          </Link>
          <Link to="/about" className="hover:text-zinc-300">
            Sobre
          </Link>
          <Link to="/terms" className="hover:text-zinc-300">
            Termos
          </Link>
          <Link to="/privacy" className="hover:text-zinc-300">
            Privacidade
          </Link>
          <Link to="/login" className="hover:text-zinc-300">
            Entrar
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function PublicSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-12">
      {eyebrow ? (
        <p className="font-display text-sm font-medium text-sky-400/90">
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          "font-display text-xl font-semibold tracking-tight text-zinc-100",
          eyebrow ? "mt-2" : ""
        )}
      >
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-zinc-400">
        {children}
      </div>
    </section>
  );
}
