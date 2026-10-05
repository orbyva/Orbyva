import { Link } from "react-router-dom";
import { LoginForm } from "@/components/login-form";
import { BrandLogo } from "@/components/BrandLogo";
import { LandingAtmosphere } from "@/components/landing/LandingAtmosphere";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { BRAND } from "@/lib/brand";

export default function LoginPage() {
  useDocumentMeta({
    title: "Entrar",
    description: "Acesse sua conta Orbyva: finanças e life OS na mesma órbita.",
    path: "/login",
    noIndex: true,
  });

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[var(--landing-bg)] text-zinc-100">
      <a
        href="#login"
        className="absolute left-4 top-4 z-50 -translate-y-16 rounded-full bg-sky-400 px-4 py-2 text-sm font-semibold text-sky-950 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:translate-y-0"
      >
        Ir para o formulário
      </a>
      <LandingAtmosphere />

      {/* `pt-4` + inset de topo do iOS: a pílula é a primeira superfície da tela e no PWA
          instalado nasceria sob a status bar (o logout cai aqui). O inset SOMA ao `pt-4`. */}
      <header className="relative z-20 px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 rounded-full border border-white/10 bg-[var(--landing-bg)]/80 px-2 pl-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:px-3">
          <Link to="/" aria-label={BRAND.name} className="inline-flex shrink-0">
            <BrandLogo
              variant="mark"
              className="size-8 rounded-lg bg-white sm:size-9 sm:rounded-xl"
              alt={BRAND.name}
            />
          </Link>
          <Link
            to="/"
            className="inline-flex h-8 items-center rounded-full px-3 text-xs text-zinc-400 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-white"
          >
            Início
          </Link>
        </div>
      </header>

      <main
        id="login"
        className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:px-6"
      >
        <LoginForm className="w-full max-w-sm md:max-w-4xl" />
      </main>
    </div>
  );
}
