/** Cores para gráficos Recharts (valores HSL computáveis). */
export const chartColors = {
  income: "hsl(142 71% 42%)",
  expense: "hsl(0 72% 51%)",
  fallback: "hsl(25 5% 65%)",
} as const;

export const moduleColors = {
  hub: "hsl(var(--hub))",
  finance: "hsl(var(--primary))",
  entertainment: "hsl(var(--cinema))",
  life: "hsl(var(--life))",
  cinema: "hsl(var(--cinema))",
  travel: "hsl(var(--travel))",
  car: "hsl(var(--car))",
  productivity: "hsl(var(--productivity))",
  health: "hsl(350 89% 60%)",
} as const;

/**
 * Cor da bolinha do pill de um projeto **sem `color` definida** no banco — projeto sem cor não
 * deixa de ter pill. Era um literal `"#94a3b8"` repetido à mão em quatro arquivos de tarefas
 * (feature 111); mudar o cinza em um deles e esquecer os outros era questão de tempo.
 *
 * Hex cru (não `hsl(var(--…))`) de propósito: o valor vai para `style={{ backgroundColor }}`, no
 * mesmo lugar onde entra `project.color`, que também é hex vindo do banco.
 */
export const PROJECT_FALLBACK_COLOR = "#94a3b8";

export const statusBadgeStyles: Record<string, string> = {
  OK: "bg-success/15 text-success border-success/30",
  ATENCAO: "bg-warning/15 text-warning border-warning/30",
  ATENÇÃO: "bg-warning/15 text-warning border-warning/30",
  CRITICO: "bg-warning/20 text-warning border-warning/40",
  CRÍTICO: "bg-warning/20 text-warning border-warning/40",
  QUASE: "bg-warning/15 text-warning border-warning/30",
  ESTOUROU: "bg-destructive/15 text-destructive border-destructive/30",
};

export const statusProgressStyles: Record<string, string> = {
  OK: "bg-success",
  ATENCAO: "bg-warning",
  ATENÇÃO: "bg-warning",
  CRITICO: "bg-warning",
  CRÍTICO: "bg-warning",
  QUASE: "bg-warning",
  ESTOUROU: "bg-destructive",
};
