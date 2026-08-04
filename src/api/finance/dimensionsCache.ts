import type { Dimension } from "@/types/dimensions";
import { fetchDimensions } from "./dimensions";
import { getCurrentUserId } from "@/lib/auth-user";

const DIMENSIONS_TTL_MS = 60_000;

let dimensionsCache: {
  userId: string;
  at: number;
  data: Dimension[];
} | null = null;
let dimensionsInflight: {
  userId: string;
  promise: Promise<Dimension[]>;
} | null = null;

export function invalidateDimensionsCache() {
  dimensionsCache = null;
  dimensionsInflight = null;
}

/** Shared TTL + inflight coalesce for dimensions tree. */
export async function fetchDimensionsCached(opts?: {
  force?: boolean;
}): Promise<Dimension[]> {
  const userId = await getCurrentUserId();
  const now = Date.now();

  if (
    !opts?.force &&
    dimensionsCache &&
    dimensionsCache.userId === userId &&
    now - dimensionsCache.at < DIMENSIONS_TTL_MS
  ) {
    return dimensionsCache.data;
  }

  if (
    !opts?.force &&
    dimensionsInflight &&
    dimensionsInflight.userId === userId
  ) {
    return dimensionsInflight.promise;
  }

  const promise = fetchDimensions()
    .then((data) => {
      dimensionsCache = { userId, at: Date.now(), data };
      return data;
    })
    .finally(() => {
      if (dimensionsInflight?.promise === promise) {
        dimensionsInflight = null;
      }
    });

  dimensionsInflight = { userId, promise };
  return promise;
}
