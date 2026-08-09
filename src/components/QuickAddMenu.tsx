import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type AppArea,
  type QuickAddAction,
  quickAddActionsForArea,
} from "@/lib/quickAdd";
import { track } from "@/lib/analytics";
import { useQuickAdd } from "@/hooks/useQuickAdd";
import { cn } from "@/lib/utils";

type QuickAddMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area: AppArea;
  source: "fab" | "mobile_nav";
  /** Botão + (âncora do popover). */
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  className?: string;
};

/** Menu compacto de ações saindo do botão +. */
export function QuickAddMenu({
  open,
  onOpenChange,
  area,
  source,
  children,
  side = "top",
  align = "center",
  className,
}: QuickAddMenuProps) {
  const actions = quickAddActionsForArea(area);
  const { openAction } = useQuickAdd();

  function onPick(action: QuickAddAction) {
    track("quick_add_open", { source, area, action: action.id });
    onOpenChange(false);
    if (action.inline) {
      window.setTimeout(() => openAction(action.id), 0);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={10}
        className={cn("w-52 p-1.5", className)}
      >
        <ul className="space-y-0.5" role="menu" aria-label="Adicionar">
          {actions.map((action) => (
            <li key={action.id} role="none">
              {action.inline ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onPick(action)}
                  className="flex w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  {action.label}
                </button>
              ) : (
                <Link
                  role="menuitem"
                  to={action.href}
                  onClick={() => onPick(action)}
                  className="flex w-full rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent"
                >
                  {action.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
