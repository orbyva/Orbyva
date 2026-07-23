import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import {
  deleteTripMilestone,
  updateTripMilestone,
} from "@/api/travel";
import { MILESTONE_TYPE_LABELS } from "@/domain/travel";
import { formatDateBR } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { TripMilestone } from "@/types/travel";

type TripMilestonesTabProps = {
  milestones: TripMilestone[];
  onCreate: () => void;
  onEdit: (milestone: TripMilestone) => void;
  onReload: () => void;
};

export function TripMilestonesTab({
  milestones,
  onCreate,
  onEdit,
  onReload,
}: TripMilestonesTabProps) {
  return (
    <TabsContent value="milestones" className="mt-4 space-y-4">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar prazo
        </Button>
      </div>
      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum prazo cadastrado. Adicione check-ins, reservas e documentos.
        </p>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <button
                type="button"
                onClick={() =>
                  updateTripMilestone({ id: m.id, done: !m.done }).then(
                    onReload
                  )
                }
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded border shrink-0",
                  m.done
                    ? "bg-success border-success text-success-foreground"
                    : "border-muted-foreground/30"
                )}
              >
                {m.done && <Check className="h-3 w-3" />}
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    m.done && "line-through text-muted-foreground"
                  )}
                >
                  {m.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {MILESTONE_TYPE_LABELS[m.type]} ·{" "}
                  {formatDateBR(m.due_date)}
                </p>
                {m.notes && (
                  <p className="text-xs text-muted-foreground truncate">
                    {m.notes}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7 shrink-0", ICON_EDIT_BUTTON_CLASS)}
                onClick={() => onEdit(m)}
                aria-label="Editar prazo"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <ConfirmDeleteDialog
                title="Excluir este prazo?"
                onConfirm={() => deleteTripMilestone(m.id).then(onReload)}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </ConfirmDeleteDialog>
            </li>
          ))}
        </ul>
      )}
    </TabsContent>
  );
}
