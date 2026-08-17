import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, Pen, Trash2 } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { ICON_EDIT_BUTTON_CLASS } from "@/components/FormLabel";
import { TaskIconBadge } from "@/pages/admin/tasks/TaskIconBadge";
import {
  createTaskFromShoppingItem,
  setShoppingItemStatus,
} from "@/api/shopping/items";
import type { ShoppingItemTaskLink } from "@/api/shopping/items";
import { SHOPPING_TASK_ICON_KEY } from "@/domain/shopping/taskLink";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ShoppingItem, ShoppingItemStatus } from "@/types/shopping";

interface ShoppingItemRowProps {
  item: ShoppingItem;
  /** Tarefa já vinculada a este item, se houver — vem do mapa carregado uma vez pela página. */
  taskLink?: ShoppingItemTaskLink | null;
  /** Avisa a página do novo status para ela atualizar contagem/ordem sem refetch. */
  onStatusChange: (id: string, status: ShoppingItemStatus) => void;
  /** Avisa a página da tarefa recém-criada para ela atualizar o mapa de vínculos sem refetch. */
  onTaskCreated?: (itemId: string, link: ShoppingItemTaskLink) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** "2 pacotes", "3 m", "kg" — o que o usuário tiver preenchido. */
function formatQuantity(item: ShoppingItem): string {
  return [item.quantity ?? null, item.unit?.trim() || null]
    .filter((part) => part !== null && part !== "")
    .join(" ");
}

export function ShoppingItemRow({
  item,
  taskLink,
  onStatusChange,
  onTaskCreated,
  onEdit,
  onDelete,
}: ShoppingItemRowProps) {
  const [status, setStatus] = useState<ShoppingItemStatus>(item.status);
  const [creatingTask, setCreatingTask] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setStatus(item.status);
  }, [item.status]);

  const purchased = status === "purchased";
  const quantity = formatQuantity(item);

  async function handleToggle() {
    const previous = status;
    const next: ShoppingItemStatus = purchased ? "pending" : "purchased";
    setStatus(next);
    try {
      await setShoppingItemStatus(item.id, next);
      onStatusChange(item.id, next);
    } catch (error) {
      setStatus(previous);
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível atualizar o item."
        ),
        variant: "destructive",
      });
    }
  }

  async function handleCreateTask() {
    setCreatingTask(true);
    try {
      const task = await createTaskFromShoppingItem(item.id);
      onTaskCreated?.(item.id, {
        taskId: task.id,
        title: task.title,
        status: task.status,
      });
      toast({ title: `Tarefa "${task.title}" criada`, duration: 2500 });
    } catch (error) {
      toast({
        title: "Erro",
        description: getErrorMessage(
          error,
          "Não foi possível criar a tarefa deste item."
        ),
        variant: "destructive",
      });
    } finally {
      setCreatingTask(false);
    }
  }

  return (
    <li className="flex items-center gap-2 rounded-lg border bg-card p-2.5">
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 cursor-pointer accent-primary"
        checked={purchased}
        onChange={handleToggle}
        aria-label={`Marcar ${item.title} como comprado`}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            purchased && "text-muted-foreground line-through"
          )}
        >
          {item.title}
        </p>
        {(quantity || item.description) && (
          <p className="truncate text-xs text-muted-foreground">
            {[quantity, item.description].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {taskLink ? (
        // Relação 1:1 — com a tarefa existindo, o botão de criar dá lugar ao atalho pra ela.
        <Link
          to="/tasks"
          aria-label={`Ver tarefa "${taskLink.title}"`}
          title={taskLink.title}
          className={cn(
            badgeVariants({ variant: "outline" }),
            "shrink-0 gap-1 text-[10px] font-normal hover:bg-muted"
          )}
        >
          <TaskIconBadge iconKey={SHOPPING_TASK_ICON_KEY} className="h-3 w-3" />
          Tarefa
        </Link>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2 text-xs"
          onClick={handleCreateTask}
          disabled={creatingTask}
          aria-label={`Criar tarefa para ${item.title}`}
        >
          {creatingTask && <Loader2 className="h-3 w-3 animate-spin" />}
          Criar tarefa
        </Button>
      )}
      {item.provider_link && (
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 shrink-0", ICON_EDIT_BUTTON_CLASS)}
          asChild
        >
          <a
            href={item.provider_link}
            target="_blank"
            rel="noreferrer"
            aria-label={`Abrir link do fornecedor de ${item.title}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8 shrink-0", ICON_EDIT_BUTTON_CLASS)}
        onClick={onEdit}
        aria-label={`Editar ${item.title}`}
      >
        <Pen className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDeleteDialog
        title="Excluir este item?"
        description={`"${item.title}" sai da lista de compras.`}
        onConfirm={onDelete}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-destructive"
          aria-label={`Excluir ${item.title}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </ConfirmDeleteDialog>
    </li>
  );
}
