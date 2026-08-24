import { Sparkles } from "lucide-react";
import { useOrb } from "@/hooks/useOrb";
import { cn } from "@/lib/utils";

/** Entrada global do Orb — mesmo padrão visual de `QuickAddExpenseFab`, deslocado pra não sobrepor. */
export function OrbFab({ className }: { className?: string }) {
  const { open, toggleOrb } = useOrb();

  return (
    <button
      type="button"
      onClick={toggleOrb}
      className={cn(
        "fixed bottom-24 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg transition-transform duration-200 ease-out hover:opacity-90 md:bottom-6 md:right-24",
        open && "scale-95",
        className
      )}
      aria-label={open ? "Fechar o Orb" : "Abrir o Orb"}
      title="Orb (Ctrl/Cmd + .)"
      aria-expanded={open}
    >
      <Sparkles className="h-6 w-6" />
    </button>
  );
}
