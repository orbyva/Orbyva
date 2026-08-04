import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { QuickAddSheet } from "@/components/QuickAddSheet";
import { resolveAppArea, type AppArea } from "@/lib/quickAdd";
import { cn } from "@/lib/utils";

const AREA_FAB_CLASS: Record<AppArea, string> = {
  finance: "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
  entertainment:
    "bg-[hsl(var(--cinema))] text-[hsl(var(--cinema-foreground))]",
  life: "bg-[hsl(var(--life))] text-[hsl(var(--life-foreground))]",
  home: "bg-[hsl(var(--hub))] text-[hsl(var(--hub-foreground))]",
};

/**
 * Atalho desktop para adicionar algo na área atual (mobile usa o + na bottom nav).
 */
export function QuickAddExpenseFab({ className }: { className?: string }) {
  const location = useLocation();
  const area = resolveAppArea(location.pathname);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full shadow-lg transition hover:opacity-90 md:flex",
          AREA_FAB_CLASS[area],
          className
        )}
        aria-label="Adicionar"
        title="Adicionar"
      >
        <Plus className="h-6 w-6" />
      </button>
      <QuickAddSheet
        open={open}
        onOpenChange={setOpen}
        area={area}
        source="fab"
      />
    </>
  );
}
