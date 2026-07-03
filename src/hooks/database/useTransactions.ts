import { useCallback, useEffect, useState } from "react";

import { Transaction } from "@/types/finance";
import {
  fetchTransactionsQuery,
  type TransactionQueryOptions,
} from "@/api/finance";

export function useTransactions(options: TransactionQueryOptions) {
  const [loadingTransactions, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const {
    page = 1,
    pageSize = 10,
    startDate = null,
    endDate = null,
    search = "",
    nature = null,
  } = options;

  const fetchTransactionsCallback = useCallback(async () => {
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
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, startDate, endDate, search, nature]);

  useEffect(() => {
    fetchTransactionsCallback();
  }, [fetchTransactionsCallback]);

  return {
    transactions,
    setTransactions,
    loadingTransactions,
    totalPages,
    total,
    refetchTransactions: fetchTransactionsCallback,
  };
}
