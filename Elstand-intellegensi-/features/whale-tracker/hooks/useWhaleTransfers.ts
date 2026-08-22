"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PaginatedTransfers, TransferFilters } from "../types";

const REFRESH_INTERVAL_MS = 20_000;

export interface UseWhaleTransfersState {
  data: PaginatedTransfers | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Polls our own API on an interval — NOT the blockchain (spec: "Jangan
 * polling blockchain dari browser"). Supabase Realtime is a documented
 * future upgrade for push-based updates (see README); interval polling
 * against an indexed, paginated Postgres query is cheap enough for a
 * premium-terminal panel and keeps this feature dependency-free.
 */
export function useWhaleTransfers(filters: TransferFilters, page: number, pageSize: number): UseWhaleTransfersState {
  const [data, setData] = useState<PaginatedTransfers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filtersKey = JSON.stringify(filters);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (filters.minUsd != null) params.set("minUsd", String(filters.minUsd));
      if (filters.tokenSymbol) params.set("token", filters.tokenSymbol);
      if (filters.address) params.set("address", filters.address);
      if (filters.fromAddress) params.set("from", filters.fromAddress);
      if (filters.toAddress) params.set("to", filters.toAddress);
      if (filters.sinceIso) params.set("since", filters.sinceIso);
      if (filters.untilIso) params.set("until", filters.untilIso);

      const res = await fetch(`/api/whale/transfers?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PaginatedTransfers;
      if (requestId.current === id) {
        setData(json);
        setError(null);
      }
    } catch (err) {
      if (requestId.current === id) setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally {
      if (requestId.current === id) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filtersKey]);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { data, loading, error, refresh: load };
}
