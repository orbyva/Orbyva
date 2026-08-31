import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Paleta curada de ~20 cores acessíveis (contraste ok em light/dark) — mesma usada no backfill da migration de tags. */
export const LABEL_COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#78716c",
  "#64748b",
  "#71717a",
];

export function randomLabelColor(): string {
  return LABEL_COLOR_PALETTE[Math.floor(Math.random() * LABEL_COLOR_PALETTE.length)];
}

/** Cor estilo labels do GitHub: paleta curada + "Aleatória" + cor customizada (`<input type="color">` nativo). */
export function LabelColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {LABEL_COLOR_PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Cor ${c}`}
            className={cn(
              "h-6 w-6 rounded-full border-2 transition-transform",
              color.toLowerCase() === c ? "border-foreground scale-110" : "border-transparent"
            )}
            style={{ backgroundColor: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange(randomLabelColor())}>
          Aleatória
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Personalizada
          <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded border border-input bg-transparent p-0.5"
            aria-label="Cor personalizada"
          />
        </label>
      </div>
    </div>
  );
}
