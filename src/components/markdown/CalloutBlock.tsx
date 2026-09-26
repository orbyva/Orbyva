import type { ReactNode } from "react";
import { Info, Lightbulb, MessageSquareWarning, OctagonAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CALLOUT_LABEL } from "@/components/markdown/remarkCallout";
import type { CalloutType } from "@/components/markdown/remarkCallout";
import { cn } from "@/lib/utils";

/**
 * Caixa de destaque de `> [!NOTE]` e companhia (feature 067). Quem identifica a sintaxe é o
 * `remarkCallout`; aqui é só a aparência.
 *
 * `role="note"` (e não `alert`) de propósito: um leitor de tela não deve interromper a leitura da
 * nota por causa de um destaque escrito pelo próprio usuário — `alert` fica reservado para erro de
 * verdade, como a fórmula inválida do `MathBlock`.
 *
 * A cor sai dos tokens do app (`hsl(var(--…))`), no mesmo padrão do `StatusPill`, para acompanhar o
 * dark mode sem uma segunda paleta.
 */
export function CalloutBlock({
  type,
  title,
  children,
}: {
  type: CalloutType;
  /** Texto opcional escrito na mesma linha do gatilho. Sem ele, entra o rótulo padrão do tipo. */
  title?: string;
  children?: ReactNode;
}) {
  const { Icon, label, tone } = CALLOUT_STYLE[type];

  return (
    <div
      role="note"
      data-callout={type}
      aria-label={title || label}
      className={cn(
        "space-y-1 rounded-md border-l-4 px-3 py-2",
        tone.container
      )}
    >
      <p className={cn("flex items-center gap-1.5 text-xs font-semibold", tone.title)}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {title || label}
      </p>
      {children}
    </div>
  );
}

type CalloutStyle = {
  Icon: LucideIcon;
  label: string;
  tone: { container: string; title: string };
};

/**
 * Um token por tipo, escolhido pela semântica que o token já tem no app — nada de paleta nova:
 * informação usa `--primary`, dica usa `--success`, destaque usa a cor do módulo de produtividade
 * (a mesma das Notas), aviso usa `--warning` e risco usa `--destructive`.
 *
 * As classes estão **escritas por extenso**, e não montadas com template string: o Tailwind procura
 * classe no código-fonte com expressão regular, e `border-[hsl(var(--${token}))]` não geraria CSS
 * nenhum (a caixa sairia sem cor, silenciosamente).
 */
const CALLOUT_STYLE: Record<CalloutType, CalloutStyle> = {
  note: {
    Icon: Info,
    label: CALLOUT_LABEL.note,
    tone: {
      container: "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10",
      title: "text-[hsl(var(--primary))]",
    },
  },
  tip: {
    Icon: Lightbulb,
    label: CALLOUT_LABEL.tip,
    tone: {
      container: "border-[hsl(var(--success))] bg-[hsl(var(--success))]/10",
      title: "text-[hsl(var(--success))]",
    },
  },
  important: {
    Icon: MessageSquareWarning,
    label: CALLOUT_LABEL.important,
    tone: {
      container:
        "border-[hsl(var(--productivity))] bg-[hsl(var(--productivity))]/10",
      title: "text-[hsl(var(--productivity))]",
    },
  },
  warning: {
    Icon: TriangleAlert,
    label: CALLOUT_LABEL.warning,
    tone: {
      container: "border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10",
      title: "text-[hsl(var(--warning))]",
    },
  },
  caution: {
    Icon: OctagonAlert,
    label: CALLOUT_LABEL.caution,
    tone: {
      container:
        "border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))]/10",
      title: "text-[hsl(var(--destructive))]",
    },
  },
};
