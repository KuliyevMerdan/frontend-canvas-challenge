import { useCallback, useEffect, useRef, useState } from 'react';
import { toFailure, type ApiFailure } from '../api/http';

export interface QueryState<T> {
  data: T | null;
  error: ApiFailure | null;
  loading: boolean;
  reload: () => void;
}

interface QueryOptions {
  /** Отложить запрос: серия быстрых изменений deps даёт один запрос. */
  debounceMs?: number;
  /** Во время перезагрузки показывать прежние данные вместо пустого состояния. */
  keepData?: boolean;
}

/**
 * Единственная реализация «загрузить и показать»: загрузка, ошибка, повтор,
 * защита от устаревших ответов. `fetcher: null` — запрос пока не нужен.
 * Ответ применяется только если он относится к последнему запуску, поэтому
 * запоздавший ответ не подменяет более свежие данные.
 */
export function useQuery<T>(
  fetcher: (() => Promise<T>) | null,
  deps: readonly unknown[],
  { debounceMs = 0, keepData = false }: QueryOptions = {},
): QueryState<T> {
  const [state, setState] = useState<{
    data: T | null;
    error: ApiFailure | null;
    loading: boolean;
  }>({ data: null, error: null, loading: fetcher !== null });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const runId = useRef(0);

  useEffect(() => {
    const id = ++runId.current;
    if (!fetcherRef.current) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    setState((prev) => ({ data: keepData ? prev.data : null, error: null, loading: true }));
    const timer = setTimeout(() => {
      fetcherRef.current?.().then(
        (data) => {
          if (id === runId.current) setState({ data, error: null, loading: false });
        },
        (error: unknown) => {
          if (id === runId.current)
            setState({ data: null, error: toFailure(error), loading: false });
        },
      );
    }, debounceMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { ...state, reload };
}
