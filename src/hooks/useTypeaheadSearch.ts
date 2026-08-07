import { useEffect, useRef } from "react";

const DEFAULT_DEBOUNCE_MS = 400;

/**
 * Busca tipada com debounce (padrão lugares ~400ms).
 * Aborta a request anterior ao digitar de novo.
 */
export function useTypeaheadSearch(options: {
  query: string;
  enabled: boolean;
  debounceMs?: number;
  minChars?: number;
  /** Se true, aceita query IMDb `tt…` com menos de minChars. */
  allowImdbId?: boolean;
  run: (query: string, signal: AbortSignal) => Promise<void>;
  onClear: () => void;
}): void {
  const {
    query,
    enabled,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    minChars = 2,
    allowImdbId = false,
    run,
    onClear,
  } = options;
  const runRef = useRef(run);
  const clearRef = useRef(onClear);
  runRef.current = run;
  clearRef.current = onClear;

  useEffect(() => {
    if (!enabled) return;
    const q = query.trim();
    const imdbOk = allowImdbId && /^tt\d+$/i.test(q);
    if (q.length < minChars && !imdbOk) {
      clearRef.current();
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void runRef.current(q, controller.signal).catch(() => {
        /* erros tratados no run */
      });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, enabled, debounceMs, minChars, allowImdbId]);
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}
