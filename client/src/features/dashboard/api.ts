import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function toApiError(error: unknown): ApiError {
  if (isAxiosError(error)) {
    const body = error.response?.data as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message) ? body.message.join(', ') : (body?.message ?? error.message);
    return new ApiError(error.response?.status ?? 0, message);
  }
  return new ApiError(0, (error as Error).message);
}

/**
 * GETs `path` and optionally re-polls it. Keeps the previous data while a
 * refetch is in flight so charts hold their frame instead of flashing.
 */
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(path);
  latest.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    setRefreshing(true);
    try {
      const { data: result } = await api.get<T>(path);
      if (latest.current === path) {
        setData(result);
        setError(null);
      }
    } catch (caught) {
      if (latest.current === path) setError(toApiError(caught));
    } finally {
      if (latest.current === path) setRefreshing(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
    if (!pollMs) return;
    const timer = setInterval(() => void load(), pollMs);
    return () => clearInterval(timer);
  }, [load, pollMs]);

  return { data, error, refreshing, reload: load };
}
