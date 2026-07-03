import { Skeleton } from "@/components/ui/skeleton";

interface TableLoadingSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableLoadingSkeleton({
  rows = 5,
  columns = 6,
}: TableLoadingSkeletonProps) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-8 flex-1"
              style={{ maxWidth: colIndex === 0 ? 32 : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
