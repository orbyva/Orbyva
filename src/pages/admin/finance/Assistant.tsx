import { PageShell } from "@/components/PageShell";
import { AgentChatPanel } from "@/components/agent/AgentChatPanel";
import { BarChart3, ShieldCheck, Sparkles } from "lucide-react";

const DEMO_FEATURES = [
  {
    icon: BarChart3,
    title: "Análises reais",
    description: "Receitas, despesas, saldo, tendências e comparações entre meses.",
  },
  {
    icon: Sparkles,
    title: "Insights acionáveis",
    description: "Resumo, detalhamento, ponto de atenção e recomendação em cada resposta.",
  },
  {
    icon: ShieldCheck,
    title: "Cadastro seguro",
    description: "Lançamentos e parcelas só após sua confirmação no chat.",
  },
];

export default function Assistant() {
  return (
    <PageShell
      title="Consultor inteligente"
      description="Assistente de negócios integrado aos seus dados — pronto para demonstração e uso diário."
    >
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-8">
        <aside className="hidden space-y-4 lg:block">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">O que o consultor faz</h3>
            <ul className="mt-3 space-y-3">
              {DEMO_FEATURES.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Toda resposta usa natureza, tipo e classe quando disponíveis — a hierarquia
            completa do FinTrack.
          </p>
        </aside>

        <AgentChatPanel />
      </div>
    </PageShell>
  );
}
