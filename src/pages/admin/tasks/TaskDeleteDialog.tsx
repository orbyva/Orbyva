import { useEffect, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isMedicationDoseTask, isSimpleRecurringTask, type TaskDeleteOption } from "@/domain/tasks";
import { countTaskSeries } from "@/api/tasks";
import { fetchMedications } from "@/api/health/medications";
import { getErrorMessage } from "@/lib/errors";
import type { Task } from "@/types/tasks";

interface TaskDeleteDialogProps {
  task: Task;
  /** Exclui só `task` — mesmo comportamento do `ConfirmDeleteDialog` de antes. */
  onConfirm: () => void | Promise<void>;
  /**
   * Exclui um conjunto: a série inteira de uma recorrência simples, ou as doses de um tratamento
   * (encerrando-o ou não). Quem resolve o escopo é o servidor, a partir da opção — a lista carregada
   * na tela não participa. Ausente, o dialog nunca mostra nada além de "Excluir".
   */
  onConfirmScoped?: (option: TaskDeleteOption) => void | Promise<void>;
  loading?: boolean;
  children: ReactNode;
  description?: string;
}

/** Um número do servidor, o estado de carregamento dele, ou o erro que impediu de saber. */
type CountState =
  | { status: "loading" }
  | { status: "ready"; future: number; all: number }
  | { status: "error"; message: string };

/** "3 ocorrências" / "1 ocorrência" — série de uma ocorrência só não pode falar no plural. */
function plural(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Dialog de exclusão de tarefa, em três variantes.
 *
 * 1. **Tarefa comum** (ou vinculada a uma Recorrência Financeira): um botão "Excluir", idêntico ao
 *    antigo `ConfirmDeleteDialog`.
 * 2. **Recorrência simples** (feature 028): "Excluir somente esta" / "Excluir todas as ocorrências".
 * 3. **Dose de medicação** (feature 075): três ações, porque apagar a linha não basta — enquanto o
 *    tratamento estiver ativo, `materializeAllMedicationDoses` recria a dose na carga seguinte. É
 *    literalmente o "i'm unable to delete it" do usuário: a tarefa some e volta.
 *
 * A contagem exibida vem do **servidor** (`countTaskSeries`), não de `findSeriesTasks` sobre a lista
 * da tela: aquela lista já vem recortada por projeto/tag/status, então o número mentia sempre que
 * houvesse filtro ativo — e mentia para baixo, logo antes de uma ação destrutiva. Enquanto carrega,
 * o botão diz "…"; se a contagem falhar, o dialog explica e continua utilizável, porque o escopo
 * real quem aplica é a query da exclusão, não o número na tela.
 */
export function TaskDeleteDialog({
  task,
  onConfirm,
  onConfirmScoped,
  loading = false,
  children,
  description,
}: TaskDeleteDialogProps) {
  const isDose = isMedicationDoseTask(task) && !!onConfirmScoped;
  const isSeries = isSimpleRecurringTask(task) && !!onConfirmScoped;
  const [open, setOpen] = useState(false);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [count, setCount] = useState<CountState>({ status: "loading" });
  /**
   * `null` enquanto não se sabe. Só muda o **texto** da ação recomendada ("encerrar o tratamento e
   * apagar…" vs. "apagar as doses futuras"): `deactivateMedication` é idempotente, então errar para
   * o lado de oferecer o encerramento não quebra nada.
   */
  const [treatmentActive, setTreatmentActive] = useState<boolean | null>(null);

  // A contagem só é buscada quando o dialog abre — são N linhas na tela, e uma query por linha
  // montada seria um custo pago por quem nem vai excluir nada.
  useEffect(() => {
    if (!open || (!isDose && !isSeries)) return;
    let cancelled = false;
    setCount({ status: "loading" });

    (async () => {
      try {
        if (isDose) {
          const [future, all, actives] = await Promise.all([
            countTaskSeries(task, { mode: "end-treatment" }),
            countTaskSeries(task, { mode: "all-doses", includeCompleted }),
            // Falha aqui não é erro de contagem: sem saber, o dialog oferece o encerramento.
            fetchMedications(true).catch(() => null),
          ]);
          if (cancelled) return;
          setCount({ status: "ready", future, all });
          setTreatmentActive(
            actives === null ? null : actives.some((m) => m.id === task.medication_id)
          );
          return;
        }
        const all = await countTaskSeries(task, { mode: "series" });
        if (cancelled) return;
        setCount({ status: "ready", future: 0, all });
      } catch (error) {
        if (cancelled) return;
        setCount({
          status: "error",
          message: getErrorMessage(error, "Não foi possível contar as ocorrências."),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, includeCompleted, isDose, isSeries, task]);

  function run(action: (() => void | Promise<void>) | undefined) {
    if (!action) return;
    setOpen(false);
    void Promise.resolve(action()).catch(() => undefined);
  }

  /** O número que o botão promete, ou "…" enquanto o servidor não respondeu. */
  function amount(pick: (c: Extract<CountState, { status: "ready" }>) => number): string {
    return count.status === "ready" ? String(pick(count)) : "…";
  }

  if (isDose) {
    const endLabel = treatmentActive === false ? "Apagar as doses futuras" : "Encerrar o tratamento e apagar as doses futuras";
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>Excluir dose de medicação</AlertDialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Esta tarefa é uma dose gerada por um tratamento. Enquanto o tratamento estiver ativo,
              as doses apagadas <strong>voltam</strong> na próxima vez que a lista carregar.
            </p>
            {count.status === "error" && (
              <p className="text-destructive">
                Não foi possível contar as doses ({count.message}). Você ainda pode excluir — o que
                sai é definido no servidor, não por este número.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={includeCompleted}
                onChange={(e) => setIncludeCompleted(e.target.checked)}
                className="rounded"
              />
              Incluir as doses já tomadas
            </label>
            <p className="text-xs">
              As doses já tomadas são o histórico de adesão do tratamento — por padrão elas ficam.
            </p>
          </div>
          <AlertDialogFooter className="sm:flex-col sm:items-stretch sm:space-x-0 sm:space-y-2">
            <AlertDialogAction
              onClick={() => run(() => onConfirmScoped?.({ mode: "end-treatment" }))}
              disabled={loading}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {endLabel} ({amount((c) => c.future)})
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => run(() => onConfirmScoped?.({ mode: "all-doses", includeCompleted }))}
              disabled={loading}
              className={cn(buttonVariants({ variant: "outline" }), "w-full text-foreground")}
            >
              Apagar todas as doses deste tratamento ({amount((c) => c.all)})
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => run(onConfirm)}
              disabled={loading}
              className={cn(buttonVariants({ variant: "outline" }), "w-full text-foreground")}
            >
              Apagar só esta dose
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (!isSeries) {
    return (
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>Excluir esta tarefa?</AlertDialogHeader>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run(onConfirm)}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>Excluir tarefa recorrente</AlertDialogHeader>
        <p className="text-sm text-muted-foreground">
          {count.status === "ready"
            ? `Essa tarefa faz parte de uma recorrência com ${plural(count.all, "ocorrência", "ocorrências")}. Você pode excluir só esta ocorrência ou todas de uma vez.`
            : "Essa tarefa faz parte de uma recorrência. Você pode excluir só esta ocorrência ou todas de uma vez."}
        </p>
        {count.status === "error" && (
          <p className="text-sm text-destructive">
            Não foi possível contar as ocorrências ({count.message}). Você ainda pode excluir — o
            que sai é definido no servidor, não por este número.
          </p>
        )}
        <AlertDialogFooter className="sm:flex-col sm:items-stretch sm:space-x-0 sm:space-y-2">
          <AlertDialogAction
            onClick={() => run(onConfirm)}
            disabled={loading}
            className={cn(buttonVariants({ variant: "outline" }), "w-full text-foreground")}
          >
            Excluir somente esta
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => run(() => onConfirmScoped?.({ mode: "series" }))}
            disabled={loading}
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir todas as ocorrências ({amount((c) => c.all)})
          </AlertDialogAction>
          <AlertDialogCancel className="w-full">Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
