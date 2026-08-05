import { Link } from "react-router-dom";
import { BRAND } from "@/lib/brand";

function LegalShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5">
        <Link to="/" className="font-semibold">
          {BRAND.name}
        </Link>
        <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
          Entrar
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl px-5 pb-16">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: 4 de agosto de 2026
        </p>
        <div className="prose prose-neutral dark:prose-invert mt-8 max-w-none space-y-4 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </main>
    </div>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Termos de uso">
      <p>
        Ao usar o {BRAND.name} ({BRAND.tagline}), você concorda com estes termos.
        O serviço é oferecido para organização pessoal de finanças, hábitos,
        metas, viagens, lugares, cinema e veículos.
      </p>
      <h2 className="text-base font-semibold text-foreground">Conta</h2>
      <p>
        Você é responsável por manter a segurança do acesso (hoje via Google
        OAuth). Não compartilhe sua sessão. Contas são pessoais — os dados
        pertencem a você.
      </p>
      <h2 className="text-base font-semibold text-foreground">Planos</h2>
      <p>
        Novas contas começam com um teste de 7 dias com acesso completo. Depois
        do período, é necessário o plano Pro para continuar. Preços e benefícios
        podem mudar com aviso na interface.
      </p>
      <h2 className="text-base font-semibold text-foreground">Uso aceitável</h2>
      <p>
        Não use o serviço para atividades ilegais, abuso de APIs, ou tentativa
        de acessar dados de outras pessoas. Podemos suspender contas que violem
        estes termos.
      </p>
      <h2 className="text-base font-semibold text-foreground">Disponibilidade</h2>
      <p>
        O {BRAND.name} é um produto em evolução. Podemos alterar ou descontinuar
        funcionalidades. Não garantimos disponibilidade ininterrupta.
      </p>
      <h2 className="text-base font-semibold text-foreground">Contato</h2>
      <p>
        Dúvidas sobre estes termos:{" "}
        <a className="text-foreground underline" href={`mailto:${BRAND.email}`}>
          {BRAND.email}
        </a>
        .
      </p>
    </LegalShell>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacidade e LGPD">
      <p>
        Esta política explica como o {BRAND.name} trata dados pessoais, em
        conformidade com a LGPD (Lei 13.709/2018).
      </p>
      <h2 className="text-base font-semibold text-foreground">O que coletamos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Dados de autenticação (nome, e-mail, foto via Google)</li>
        <li>
          Conteúdo que você cria no app (transações, metas, hábitos, etc.)
        </li>
        <li>
          Dados técnicos mínimos (erros via Sentry, se configurado; eventos de
          produto via PostHog, se configurado)
        </li>
        <li>E-mail, se você criar conta ou entrar em contato conosco</li>
        <li>
          Código de indicação, se você chegou por convite de outro usuário
        </li>
      </ul>
      <h2 className="text-base font-semibold text-foreground">Para que usamos</h2>
      <p>
        Prestação do serviço, autenticação, cobrança (Stripe, se você assinar o
        Pro), melhoria de estabilidade e comunicação sobre o produto.
      </p>
      <h2 className="text-base font-semibold text-foreground">Seus direitos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong className="text-foreground">Exportar</strong> — Conta → Exportar
          dados (CSV)
        </li>
        <li>
          <strong className="text-foreground">Excluir</strong> — Conta → Excluir
          conta e dados
        </li>
        <li>Acesso e correção dos dados que você mesmo edita no app</li>
      </ul>
      <h2 className="text-base font-semibold text-foreground">
        Subprocessadores
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong className="text-foreground">Supabase</strong> — autenticação e
          banco de dados
        </li>
        <li>
          <strong className="text-foreground">Google</strong> — login OAuth (e
          opcionalmente Books API)
        </li>
        <li>
          <strong className="text-foreground">Stripe</strong> — pagamentos do
          plano Pro (quando ativo)
        </li>
        <li>
          <strong className="text-foreground">Sentry</strong> — monitoramento de
          erros (quando configurado)
        </li>
        <li>
          <strong className="text-foreground">PostHog</strong> — analytics de
          produto (quando configurado)
        </li>
      </ul>
      <h2 className="text-base font-semibold text-foreground">Retenção</h2>
      <p>
        Mantemos seus dados enquanto a conta existir. Após exclusão pela Conta,
        removemos os registros associados via rotinas do banco. Logs técnicos e
        backups podem persistir por prazo curto operacional. Eventos analíticos
        seguem a política do respectivo subprocessador.
      </p>
      <h2 className="text-base font-semibold text-foreground">Contato LGPD</h2>
      <p>
        Para exercer direitos ou tirar dúvidas:{" "}
        <a className="text-foreground underline" href={`mailto:${BRAND.email}`}>
          {BRAND.email}
        </a>
        .
      </p>
    </LegalShell>
  );
}
