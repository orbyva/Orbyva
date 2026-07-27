import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clapperboard,
  CreditCard,
  Plane,
  Star,
} from "lucide-react";
import type { TimelineItem } from "@/types/timeline";
import type { RecurringDueAlert } from "@/types/recurring";
import type { Movie } from "@/types/movies";
import { formatMovieRating } from "@/domain/movies";
import { formatShortDate } from "../hubMeta";

type HubDaySummaryProps = {
  habitsCount: number;
  habitsDone: number;
  nextTrip: TimelineItem | null;
  tripCountdown: number | null;
  nextPayment: RecurringDueAlert | null;
  lastMovie: Movie | null;
};

export function HubDaySummary({
  habitsCount,
  habitsDone,
  nextTrip,
  tripCountdown,
  nextPayment,
  lastMovie,
}: HubDaySummaryProps) {
  return (
    <section className="space-y-3 lg:col-span-7">
      <h2 className="text-base font-semibold tracking-tight sm:text-lg">
        Resumo do dia
      </h2>
      <ul className="overflow-hidden rounded-[1.25rem] border bg-card/80 shadow-sm divide-y backdrop-blur">
        <li>
          <Link
            to="/habits"
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3.5 sm:px-4 sm:py-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 sm:h-10 sm:w-10 sm:rounded-2xl">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {habitsCount === 0
                  ? "Nenhum hábito ainda"
                  : `${habitsCount} hábito${habitsCount === 1 ? "" : "s"} para hoje`}
              </span>
              <span className="block text-xs text-muted-foreground">
                Disciplina do dia
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {habitsCount === 0 ? "Criar" : `${habitsDone}/${habitsCount}`}
            </span>
          </Link>
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
