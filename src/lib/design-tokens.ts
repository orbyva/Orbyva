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
