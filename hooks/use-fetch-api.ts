"use client";
import { useState, useEffect, useCallback, useRef } from "react";

interface UseFetchOptions<T> {
  /** Transform raw JSON before setting state */
  transform?: (raw: any) => T;
  /** Poll interval in ms (0 = no polling) */
  pollInterval?: number;
  /** Don't fetch on mount */
  manual?: boolean;
  /** Dependencies that trigger refetch */
  deps?: unknown[];
}

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFetchAPI<T>(
  url: string,
  opts: UseFetchOptions<T> = {}
): UseFetchResult<T> {
  const { transform, pollInterval = 0, manual = false, deps = [] } = opts;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!manual);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      if (!mountedRef.current) return;
      // Auto-unwrap { ok, data } envelope from standardized API routes
      const payload = json && typeof json === "object" && "ok" in json && "data" in json
        ? json.data
        : json;
      setData(transformRef.current ? transformRef.current(payload) : payload);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    if (!manual) fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData, manual]);

  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return;
    const id = setInterval(fetchData, pollInterval);
    return () => clearInterval(id);
  }, [fetchData, pollInterval]);

  return { data, loading, error, refetch: fetchData };
}
