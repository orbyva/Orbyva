import { TypeIcon } from "@/components/TypeIcon";
import {
  getRecurringProgress,
  type RecurringProgress,
} from "@/api/recurring";
import { Recurring } from "@/types/recurring";

export function RecurringIcon({ recurring }: { recurring: Recurring }) {
  return (
    <TypeIcon
      name={recurring.class?.type?.lucide_icon}
      className="h-4 w-4"
      style={{ color: String(recurring.class?.type?.hex_color ?? "") }}
    />
  );
}

export function ProgressBar({ progress }: { progress: RecurringProgress }) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {progress.paid}/{progress.total} pagas
        </span>
        <span>{progress.open} em aberto</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/80">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progress.percent}%` }}
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

export function getRemainingInfo(recurring: Recurring) {
  const progress = getRecurringProgress(recurring);
  if (!progress || !recurring.value) return null;

  return {
    ...progress,
    remainingAmount: progress.open * recurring.value,
  };
}
