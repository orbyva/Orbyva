import {
  AlertCircle,
  Bell,
  Bookmark,
  CheckCircle2,
  ExternalLink,
  Figma,
  FileText,
  Flag,
  Github,
  Gitlab,
  Globe,
  Kanban,
  Notebook,
  Pill,
  Pin,
  ShoppingCart,
  Star,
  Youtube,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TaskIconPreset {
  key: string;
  label: string;
  icon: LucideIcon;
}

/** Catálogo fixo de presets — ícones lucide comuns pra marcação rápida de tarefas (feature 035).
 * Cada um é identificado por uma `icon_key` string estável (gravada em `task.icon_key`). */
export const TASK_ICON_PRESETS: TaskIconPreset[] = [
  { key: "flag", label: "Bandeira", icon: Flag },
  { key: "star", label: "Estrela", icon: Star },
  { key: "bookmark", label: "Marcador", icon: Bookmark },
  { key: "pin", label: "Fixado", icon: Pin },
  { key: "bell", label: "Lembrete", icon: Bell },
  { key: "alert-circle", label: "Atenção", icon: AlertCircle },
  { key: "check-circle", label: "Concluído", icon: CheckCircle2 },
  // Feature 051: ícone das tarefas criadas a partir de um item da Lista de Compras. A chave é
  // `SHOPPING_TASK_ICON_KEY` (`src/domain/shopping/taskLink.ts`), que é quem a grava.
  { key: "shopping-cart", label: "Compra", icon: ShoppingCart },
  // Feature 071: a dose de medicação materializada por `materializeMedicationDoses` grava esta
  // chave (`MEDICATION_TASK_ICON_KEY`, `src/domain/health/medication.ts`). Numa fileira de bolinhas
  // pontuais do dia, o comprimido é o que diferencia o remédio da troca de escova sem texto nenhum.
  { key: "pill", label: "Medicação", icon: Pill },
];

/**
 * Presets que só fazem sentido numa **regra de link** (feature 087): as marcas que a regra de
 * regex reconhece, mais o link genérico do fallback.
 *
 * Ficam fora de `TASK_ICON_PRESETS` de propósito. Aquele catálogo é o do ícone de uma **tarefa**, e
 * enfiar nove marcas nele engordaria o popover de toda linha da Lista, do Kanban e do Gantt para
 * servir a uma tela de configuração. `TaskIconBadge` resolve os dois catálogos (é o mesmo desenho,
 * venha de onde vier), e o seletor recebe a lista que quiser pela prop `presets`.
 *
 * `github` e `external` não são arbitrários: são exatamente as `iconKey` que
 * `describeExternalLink` devolve quando nenhuma regra casa — é o que faz o chip sem configuração
 * nenhuma continuar desenhando o que desenhava antes desta feature.
 */
export const LINK_ICON_PRESETS: TaskIconPreset[] = [
  { key: "github", label: "GitHub", icon: Github },
  { key: "gitlab", label: "GitLab", icon: Gitlab },
  { key: "figma", label: "Figma", icon: Figma },
  { key: "youtube", label: "YouTube", icon: Youtube },
  // Jira não tem ícone no lucide; o quadro é o que a marca significa na prática.
  { key: "kanban", label: "Quadro / Jira", icon: Kanban },
  { key: "notebook", label: "Notion / notas", icon: Notebook },
  { key: "file-text", label: "Documento", icon: FileText },
  { key: "globe", label: "Site", icon: Globe },
  { key: "external", label: "Link externo", icon: ExternalLink },
];

const TASK_ICON_PRESET_MAP: Record<string, TaskIconPreset> = Object.fromEntries(
  [...TASK_ICON_PRESETS, ...LINK_ICON_PRESETS].map((preset) => [preset.key, preset])
);

/**
 * Exibição somente-leitura do ícone de uma tarefa — reutilizada em todas as visualizações
 * (Lista, Kanban, Gantt, Agenda). Prioriza `iconUrl` (renderiza como `<img>`) sobre `iconKey`
 * (ícone lucide do preset correspondente); sem nenhum dos dois, não renderiza nada.
 */
export function TaskIconBadge({
  iconKey,
  iconUrl,
  className,
}: {
  iconKey?: string | null;
  iconUrl?: string | null;
  className?: string;
}) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={cn("h-3.5 w-3.5 shrink-0 rounded-sm object-cover", className)}
      />
    );
  }
  const preset = iconKey ? TASK_ICON_PRESET_MAP[iconKey] : null;
  if (!preset) return null;
  const Icon = preset.icon;
  return (
    <Icon
      className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className)}
      aria-label={preset.label}
    />
  );
}
