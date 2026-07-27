import { useCallback, useEffect, useState } from "react";

import { Transaction } from "@/types/finance";
import {
  fetchTransactionsQuery,
  type TransactionQueryOptions,
} from "@/api/finance";
import { useAuth } from "@/hooks/useAuth";
import {
  loadOfflineSnapshot,
  saveOfflineSnapshot,
} from "@/lib/offlineCache";

const LEDGER_CACHE_KEY = "finance_ledger_v1";

type LedgerCache = {
  transactions: Transaction[];
  totalPages: number;
  total: number;
};

function ledgerCacheKey(userId: string | undefined): string {
  return userId ? `${LEDGER_CACHE_KEY}:${userId}` : LEDGER_CACHE_KEY;
}

export function useTransactions(options: TransactionQueryOptions) {
  const { user } = useAuth();
  const [loadingTransactions, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [fromCache, setFromCache] = useState(false);

  const {
    page = 1,
    pageSize = 10,
    startDate = null,
    endDate = null,
    search = "",
    nature = null,
  } = options;

  // Só a visão padrão (1ª página, sem filtros) vira snapshot offline.
  const isDefaultView =
    page === 1 && !startDate && !endDate && !search && !nature;

  const fetchTransactionsCallback = useCallback(async () => {
    if (!user?.id) {
      setTransactions([]);
      setTotalPages(0);
      setTotal(0);
      setFromCache(false);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const result = await fetchTransactionsQuery({
        page,
        pageSize,
        startDate,
        endDate,
        search,
        nature,
      });
      setTransactions(result.data);
      setTotalPages(result.totalPages);
      setTotal(result.total);
      setFromCache(false);
      if (isDefaultView) {
        saveOfflineSnapshot<LedgerCache>(ledgerCacheKey(user.id), {
          transactions: result.data,
          totalPages: result.totalPages,
          total: result.total,
        });
      }
    } catch (error) {
      // Fallback: última visão padrão salva neste dispositivo.
      const cached = isDefaultView
        ? loadOfflineSnapshot<LedgerCache>(ledgerCacheKey(user.id))
        : null;
      if (cached) {
        setTransactions(cached.data.transactions);
        setTotalPages(cached.data.totalPages);
        setTotal(cached.data.total);
        setFromCache(true);
      }
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, startDate, endDate, search, nature, isDefaultView, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void fetchTransactionsCallback();
  }, [fetchTransactionsCallback, user?.id]);

  return {
    transactions,
    setTransactions,
    loadingTransactions,
    totalPages,
    total,
    fromCache,
    refetchTransactions: fetchTransactionsCallback,
  };
}
