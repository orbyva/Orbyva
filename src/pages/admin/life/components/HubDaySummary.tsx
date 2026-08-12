import { Link } from "react-router-dom";
import {
  Ban,
  Check,
  CheckCircle2,
  Clapperboard,
  CreditCard,
  Plane,
  Star,
} from "lucide-react";
import type { TimelineItem } from "@/types/timeline";
import type { RecurringDueAlert } from "@/types/recurring";
import type { Movie } from "@/types/movies";
import type { Habit, HabitLog } from "@/types/habits";
import { formatMovieRating } from "@/domain/movies";
import { isAvoidHabit, isCompletedToday } from "@/domain/habits";
import { cn } from "@/lib/utils";
import { formatShortDate } from "../hubMeta";

type HubDaySummaryProps = {
  habits: Habit[];
  habitLogs: HabitLog[];
  habitsCount: number;
  habitsDone: number;
  today: string;
  onToggleHabit?: (habitId: string) => void;
  nextTrip: TimelineItem | null;
  tripCountdown: number | null;
  nextPayment: RecurringDueAlert | null;
  lastMovie: Movie | null;
};

export function HubDaySummary({
  habits,
  habitLogs,
  habitsCount,
  habitsDone,
  today,
  onToggleHabit,
  nextTrip,
  tripCountdown,
  nextPayment,
  lastMovie,
}: HubDaySummaryProps) {
  const pending = habits.filter(
    (h) => !isCompletedToday(habitLogs.filter((l) => l.habit_id === h.id), today)
  );
  const showInline =
    habitsCount > 0 && habitsCount <= 6 && Boolean(onToggleHabit);

  return (
    <section className="space-y-3 lg:col-span-7">
      <h2 className="text-base font-semibold tracking-tight sm:text-lg">
        Resumo do dia
      </h2>
      <ul className="overflow-hidden rounded-[1.25rem] border bg-card/80 shadow-sm divide-y backdrop-blur">
        <li>
          <div className="px-3 py-2.5 sm:px-4 sm:py-3">
            <Link
              to="/habits"
              className="flex items-center gap-3 transition-colors sm:gap-3.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 sm:h-10 sm:w-10 sm:rounded-2xl">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {habitsCount === 0
                    ? "Nenhum hábito ainda"
                    : habitsDone === habitsCount
                      ? "Disciplina do dia em dia"
                      : `Faltam ${habitsCount - habitsDone} hábito${
                          habitsCount - habitsDone === 1 ? "" : "s"
                        } hoje`}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Disciplina do dia
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {habitsCount === 0 ? "Criar" : `${habitsDone}/${habitsCount}`}
              </span>
            </Link>

            {showInline ? (
              <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                {(habitsDone === habitsCount ? habits : pending).map((habit) => {
                  const habitLogsFor = habitLogs.filter(
                    (l) => l.habit_id === habit.id
                  );
                  const done = isCompletedToday(habitLogsFor, today);
                  const avoid = isAvoidHabit(habit);
                  return (
                    <li key={habit.id}>
                      <button
                        type="button"
                        onClick={() => onToggleHabit?.(habit.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-accent/50"
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                            done
                              ? avoid
                                ? "border-teal-600 bg-teal-600 text-white"
                                : "border-success bg-success text-success-foreground"
                              : "border-muted-foreground/30"
                          )}
                        >
                          {done ? (
                            avoid ? (
                              <Ban className="h-3.5 w-3.5" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {habit.name}
                        </span>
                        {avoid ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            limpo
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {habitsDone === habitsCount && habits.length > 0 ? (
                  <li className="px-1 pt-0.5 text-xs text-muted-foreground">
                    Todos marcados , {" "}
                    <Link to="/habits" className="underline underline-offset-2">
                      ver semana
                    </Link>
                  </li>
                ) : null}
              </ul>
            ) : habitsCount > 6 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <Link to="/habits" className="underline underline-offset-2">
                  Abrir hábitos
                </Link>{" "}
                para marcar a lista completa.
              </p>
            ) : null}
          </div>
        </li>

        {nextTrip ? (
          <li>
            <Link
              to={nextTrip.link ?? "/travel"}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-4 sm:py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 sm:h-10 sm:w-10 sm:rounded-2xl">
                <Plane className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold line-clamp-1">
                  {nextTrip.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  Próxima viagem
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                {tripCountdown == null
                  ? ""
                  : tripCountdown < 0
                    ? "Atrasada"
                    : tripCountdown === 0
                      ? "Hoje"
                      : tripCountdown === 1
                        ? "Amanhã"
                        : `Faltam ${tripCountdown} dias`}
              </span>
            </Link>
          </li>
        ) : null}

        {nextPayment ? (
          <li>
            <Link
              to="/finance/recurring"
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-4 sm:py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/12 text-rose-600 dark:text-rose-400 sm:h-10 sm:w-10 sm:rounded-2xl">
                <CreditCard className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  Próximo pagamento
                </span>
                <span className="block text-xs text-muted-foreground line-clamp-1">
                  {nextPayment.recurring.description}
                  {` · ${formatShortDate(nextPayment.dueDate)}`}
                </span>
              </span>
            </Link>
          </li>
        ) : null}

        {lastMovie ? (
          <li>
            <Link
              to="/movies"
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-4 sm:py-3"
            >
              {lastMovie.poster && lastMovie.poster !== "N/A" ? (
                <img
                  src={lastMovie.poster}
                  alt=""
                  className="h-10 w-7 shrink-0 rounded-md object-cover shadow-sm sm:h-12 sm:w-9 sm:rounded-lg"
                />
              ) : (
                <span className="flex h-10 w-7 shrink-0 items-center justify-center rounded-md bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-400 sm:h-12 sm:w-9 sm:rounded-lg">
                  <Clapperboard className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  Você assistiu
                </span>
                <span className="block text-xs text-muted-foreground line-clamp-1">
                  {lastMovie.title}
                </span>
              </span>
              {lastMovie.rating != null ? (
                <span className="flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {formatMovieRating(lastMovie.rating)}
                </span>
              ) : null}
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
