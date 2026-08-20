"use client";

import { useEffect, useMemo, useState } from "react";
import { unpackTable, type PackedTable } from "@/lib/pack";

export type { TabCtx } from "@/lib/types";

/**
 * Fetch-once JSON hook for the tabs that need their own detail file.
 *
 * Deliberately not a cache: each of these routes is served from an in-process parsed
 * CSV, so a refetch on tab remount costs a few milliseconds and avoids a stale-data
 * class of bug entirely.
 */
export function useJson<T>(url: string): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        setData(j as T);
      })
      .catch((e) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [url]);

  return { data, loading, error };
}

/**
 * Same as useJson, for the packed channel detail tables. Unpacking is memoised on the
 * payload rather than done per render: it allocates one object per row and there are
 * 24,000 of them on the Meta table.
 */
export function useTable<T>(url: string): { rows: T[]; loading: boolean; error: string | null } {
  const { data, loading, error } = useJson<{ table: PackedTable; error?: string }>(url);
  const rows = useMemo(
    () => (data?.table?.r?.length ? unpackTable<T>(data.table) : []),
    [data]
  );
  return { rows, loading, error: error ?? data?.error ?? null };
}
