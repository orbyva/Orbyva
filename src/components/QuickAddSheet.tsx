import { Link } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  areaLabel,
  type AppArea,
  type QuickAddAction,
  quickAddActionsForArea,
} from "@/lib/quickAdd";
import { track } from "@/lib/analytics";

type QuickAddSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  area: AppArea;
  source: "fab" | "mobile_nav";
};

export function QuickAddSheet({
  open,
  onOpenChange,
  area,
  source,
}: QuickAddSheetProps) {
  const actions = quickAddActionsForArea(area);

  function onPick(action: QuickAddAction) {
    track("quick_add_open", { source, area, action: action.id });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[70vh] rounded-t-2xl"
        style={{
          paddingBottom: "max(24px, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <SheetHeader>
          <SheetTitle>
            {area === "home" ? "O que deseja adicionar?" : `Adicionar · ${areaLabel(area)}`}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 grid gap-2 pb-2">
          {actions.map((action) => (
            <Link
              key={action.id}
              to={action.href}
              onClick={() => onPick(action)}
              className="rounded-xl border px-4 py-3 text-sm font-medium transition-colors hover:bg-accent/50"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
