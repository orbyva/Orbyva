import type { ReactNode } from "react";
import { PublicPageShell, PublicSection } from "@/components/PublicPageShell";
import { BRAND } from "@/lib/brand";
import { PLANS } from "@/lib/plan";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const TERMS_UPDATED_AT = "10 de agosto de 2026";
const PRIVACY_UPDATED_AT = "17 de agosto de 2026";

function LegalIntro({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400">
      {children}
    </p>
  );
}

function LegalList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-zinc-400">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function TermsPage() {
  useDocumentMeta({
    title: "Termos de uso",
    description: `Termos de uso do ${BRAND.name}: conta, planos, uso aceitável e disponibilidade.`,
    path: "/terms",
  });

  return (
    <PublicPageShell>
      <p className="font-display text-sm font-medium text-sky-400/90">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Termos de uso
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Última atualização: {TERMS_UPDATED_AT}
      </p>
      <LegalIntro>
        Ao usar o {BRAND.name} ({BRAND.tagline}), você concorda com estes termos.
        O serviço é um life OS pessoal: finanças, hábitos, metas, viagens,
        lugares, cinema, livros, música e veículos.
      </LegalIntro>

      <PublicSection title="Conta">
        <p>
          O acesso é feito via Google OAuth. Você é responsável por manter a
          segurança da sua sessão e por não compartilhar o login. Contas são
          pessoais: os dados que você cria no app pertencem a você.
        </p>
      </PublicSection>

      <PublicSection title="Planos e pagamento">
        <p>
          Novas contas começam com {PLANS.free.priceLabel} e acesso completo.
          Depois do período de teste, é necessário o plano Pro (
          {PLANS.pro.priceLabel}) para continuar usando o app. A assinatura é
          cobrada via Stripe; você pode cancelar pelo portal na Conta, sem
          multa. Preços e benefícios podem mudar com aviso na interface.
        </p>
      </PublicSection>

      <PublicSection title="Uso aceitável">
        <p>Você se compromete a não:</p>
        <LegalList
          items={[
            "Usar o serviço para atividades ilegais",
            "Abusar de APIs, automações ou cotas de integrações",
            "Tentar acessar dados de outras pessoas ou burlar a autenticação",
            "Sobrecarregar ou interferir na operação do serviço",
          ]}
        />
        <p>
          Podemos suspender ou encerrar contas que violem estes termos.
        </p>
      </PublicSection>

      <PublicSection title="Conteúdo e compartilhamento">
        <p>
          Você é responsável pelo conteúdo que cadastra (lançamentos, notas,
          roteiros, avaliações etc.). Funções de compartilhamento (cards,
          convites de viagem ou indicação) dependem do que você escolhe enviar;
          não publique dados de terceiros sem autorização.
        </p>
      </PublicSection>

      <PublicSection title="Disponibilidade">
        <p>
          O {BRAND.name} é um produto em evolução. Podemos alterar, pausar ou
          descontinuar funcionalidades. Não garantimos disponibilidade
          ininterrupta nem ausência de erros. Integrações de catálogo (cinema,
          livros, música, mapas) dependem de provedores externos e cotas.
        </p>
      </PublicSection>

      <PublicSection title="Limitação">
        <p>
          Na medida permitida pela lei aplicável, o {BRAND.name} é oferecido
          “como está”. Não somos assessoria financeira, jurídica ou médica; as
          informações do app auxiliam organização pessoal e não substituem
          profissionais.
        </p>
      </PublicSection>

      <PublicSection title="Contato">
        <p>
          Dúvidas sobre estes termos:{" "}
          <a
            className="text-sky-300 underline-offset-2 hover:underline"
            href={`mailto:${BRAND.email}`}
          >
            {BRAND.email}
          </a>
          .
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}

export function PrivacyPage() {
  useDocumentMeta({
    title: "Privacidade e LGPD",
    description: `Como o ${BRAND.name} trata dados pessoais, direitos LGPD, exportação e exclusão de conta.`,
    path: "/privacy",
  });

  return (
    <PublicPageShell>
      <p className="font-display text-sm font-medium text-sky-400/90">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Privacidade e LGPD
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Última atualização: {PRIVACY_UPDATED_AT}
      </p>
      <LegalIntro>
        Esta política explica como o {BRAND.name} trata dados pessoais, em
        conformidade com a LGPD (Lei 13.709/2018). Não pedimos senha de banco:
        você registra o que quiser no app.
      </LegalIntro>

      <PublicSection title="O que coletamos">
        <LegalList
          items={[
            "Dados de autenticação (nome, e-mail e foto via Google OAuth)",
            "E-mail informado na ferramenta pública “Quanto ainda cabe no mês”, para a sequência curta de aquecimento (não guardamos os valores digitados)",
            "Conteúdo que você cria (lançamentos, orçamento, recorrências, hábitos, metas, viagens, lugares, cinema, livros, música, veículos etc.)",
            "Preferências de conta e de e-mail (quando disponíveis na Conta)",
            "Código de indicação, se você chegou por convite",
            "Dados técnicos mínimos: erros (Sentry, se configurado) e eventos de produto (PostHog, se configurado)",
          ]}
        />
      </PublicSection>

      <PublicSection title="Para que usamos">
        <p>
          Prestação do serviço, autenticação, cobrança do Pro (Stripe), envio de
          e-mails transacionais/product (Resend, quando configurado),
          estabilidade, segurança e melhoria do produto. Catálogos externos
          (filmes, livros, música, mapas) são consultados sob demanda para
          enriquecer o que você busca, não vendemos seus dados.
        </p>
      </PublicSection>

      <PublicSection title="Seus direitos (LGPD)">
        <LegalList
          items={[
            "Exportar, Conta → Exportar dados (CSV)",
            "Excluir, Conta → Excluir conta e dados",
            "Acesso e correção dos dados que você mesmo edita no app",
            "Preferências de comunicação por e-mail, quando disponíveis na Conta",
          ]}
        />
      </PublicSection>

      <PublicSection title="Subprocessadores">
        <LegalList
          items={[
            "Supabase, autenticação, banco de dados e storage",
            "Google, login OAuth; opcionalmente Books, Places, Routes e Weather via Edge Functions",
            "Stripe, pagamentos do plano Pro (quando ativo)",
            "Resend, e-mails (auth, welcome, waitlist etc., quando configurado)",
            "Spotify / MusicBrainz, catálogo de música via Edge (sem login Spotify da sua conta)",
            "TMDB / OMDb, catálogo de cinema (quando configurado)",
            "Sentry, monitoramento de erros (quando configurado)",
            "PostHog, analytics de produto (quando configurado)",
            "Vercel, hospedagem do front",
          ]}
        />
      </PublicSection>

      <PublicSection title="Retenção e segurança">
        <p>
          Mantemos seus dados enquanto a conta existir. Após exclusão pela Conta,
          removemos os registros associados via rotinas do banco. Logs técnicos e
          backups podem persistir por prazo curto operacional. Eventos analíticos
          seguem a política do respectivo subprocessador. O acesso aos seus dados
          no app é isolado por conta (tenancy) com políticas de segurança no
          banco.
        </p>
      </PublicSection>

      <PublicSection title="Contato LGPD">
        <p>
          Para exercer direitos ou tirar dúvidas:{" "}
          <a
            className="text-sky-300 underline-offset-2 hover:underline"
            href={`mailto:${BRAND.email}`}
          >
            {BRAND.email}
          </a>
          .
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
