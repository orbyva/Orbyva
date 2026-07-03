import type { ReactNode } from "react";
import {
  AlertTriangle,
  FileText,
  Lightbulb,
  ListTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CURRENCY_PATTERN,
  DIMENSION_PATTERN,
  type AgentMessageSection,
} from "@/lib/agent-message-parser";

interface AgentStructuredMessageProps {
  sections: AgentMessageSection[];
  className?: string;
}

const SECTION_STYLES: Record<
  AgentMessageSection["id"],
  { icon: typeof FileText; border: string; bg: string; title: string }
> = {
  resumo: {
    icon: FileText,
    border: "border-primary/30",
    bg: "bg-primary/5",
    title: "text-primary",
  },
  detalhamento: {
    icon: ListTree,
    border: "border-border",
    bg: "bg-muted/40",
    title: "text-foreground",
  },
  atencao: {
    icon: AlertTriangle,
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
    title: "text-amber-700 dark:text-amber-400",
  },
  recomendacao: {
    icon: Lightbulb,
    border: "border-emerald-500/35",
    bg: "bg-emerald-500/5",
    title: "text-emerald-700 dark:text-emerald-400",
  },
  plain: {
    icon: FileText,
    border: "border-transparent",
    bg: "bg-transparent",
    title: "text-foreground",
  },
};

function highlightLine(text: string) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const combined = new RegExp(
    `(${CURRENCY_PATTERN.source}|${DIMENSION_PATTERN.source})`,
    "gi"
  );
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const value = match[0];
    const isCurrency = value.startsWith("R$");
    parts.push(
      <span
        key={`${match.index}-${value}`}
        className={cn(
          "font-semibold",
          isCurrency
            ? "text-primary"
            : "rounded bg-muted px-1 py-0.5 text-[0.85em] text-foreground"
        )}
      >
        {value}
      </span>
    );
    lastIndex = match.index + value.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function renderContent(content: string) {
  return content.split("\n").map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return <br key={index} />;

    const isBullet = /^[-•*]\s/.test(trimmed);
    const body = isBullet ? trimmed.replace(/^[-•*]\s/, "") : trimmed;

    return (
      <p
        key={index}
        className={cn(
          "text-sm leading-relaxed text-foreground/90",
          isBullet && "flex gap-2 pl-0.5"
        )}
      >
        {isBullet && (
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/70" aria-hidden />
        )}
        <span>{highlightLine(body)}</span>
      </p>
    );
  });
}

export function AgentStructuredMessage({
  sections,
  className,
}: AgentStructuredMessageProps) {
  const structured = sections.filter((s) => s.id !== "plain");
  const plain = sections.filter((s) => s.id === "plain");

  if (structured.length === 0) {
    return (
      <div className={cn("space-y-2", className)}>
        {plain.map((section, i) => (
          <div key={i}>{renderContent(section.content)}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {structured.map((section) => {
        const style = SECTION_STYLES[section.id];
        const Icon = style.icon;

        return (
          <div
            key={section.id}
            className={cn(
              "rounded-xl border px-3 py-2.5 sm:px-3.5",
              style.border,
              style.bg
            )}
          >
            <div className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-semibold", style.title)}>
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {section.title}
            </div>
            <div className="space-y-1">{renderContent(section.content)}</div>
          </div>
        );
      })}
    </div>
  );
}
