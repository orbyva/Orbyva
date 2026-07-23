import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Atalho desktop para lançar despesa rápido (mobile já tem o + na bottom nav).
 */
export function QuickAddExpenseFab({ className }: { className?: string }) {
  return (
    <Link
      to="/finance/transactions?new=1"
      onClick={() => track("quick_add_open", { source: "fab" })}
      className={cn(
        "fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90 md:flex",
        className
      )}
      aria-label="Nova despesa"
      title="Nova despesa"
    >
      <Plus className="h-6 w-6" />
    </Link>
  );
}
