import {
  AlertCircle,
  Bell,
  Bookmark,
  CheckCircle2,
  Flag,
  Pill,
  Pin,
  ShoppingCart,
  Star,
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

const TASK_ICON_PRESET_MAP: Record<string, TaskIconPreset> = Object.fromEntries(
  TASK_ICON_PRESETS.map((preset) => [preset.key, preset])
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
