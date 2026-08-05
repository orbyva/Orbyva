import { cn } from "@/lib/utils";

/**
 * Skeleton page-shaped for in-app route transitions (not the brand splash).
 */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex flex-1 flex-col gap-4 px-1 pt-1 sm:px-0", className)}
      role="status"
      aria-live="polite"
      aria-label="Carregando página"
    >
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-64 max-w-full animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border bg-muted/40"
          />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded-md bg-muted/50"
            style={{ animationDelay: `${i * 40}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
