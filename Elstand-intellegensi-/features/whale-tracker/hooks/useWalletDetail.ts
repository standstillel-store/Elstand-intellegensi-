"use client";
import { useCallback, useEffect, useState } from "react";
import type { WalletDetail } from "../types";

export function useWalletDetail(address: string | null) {
  const [detail, setDetail] = useState<WalletDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (!address) return;
    refresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch(`/api/whale/wallet/${address}${refresh ? "?refresh=1" : ""}`);
      if (!res.ok) return;
      const json = (await res.json()) as WalletDetail;
      setDetail(json);
    } catch {
      // Keep last-known detail on failure — the panel shows stale-but-present data rather than blanking out.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    setDetail(null);
    if (address) load(false);
  }, [address, load]);

  return { detail, loading, refreshing, refreshLive: () => load(true) };
}
