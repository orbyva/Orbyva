export type TimelineModule =
  | "finance"
  | "tasks"
  | "car"
  | "travel"
  | "goals"
  | "habits"
  | "places"
  | "cinema";

export type TimelineStatus =
  | "upcoming"
  | "overdue"
  | "today"
  | "completed"
  | "info";

export type TimelineHref =
  | "/finance"
  | "/finance/transactions"
  | "/finance/recurring"
  | "/tasks"
  | "/habits"
  | "/health"
  | "/goals"
  | "/places"
  | "/travel"
  | "/cars"
  | "/movies"
  | "/books"
  | "/music"
  | "/links";

export interface TimelineItem {
  id: string;
  date: string;
  module: TimelineModule;
  title: string;
  subtitle?: string;
  status: TimelineStatus;
  href?: TimelineHref;
}
