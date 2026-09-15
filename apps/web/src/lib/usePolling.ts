import { useEffect, useRef, useState } from 'react';
import { toFailure, type ApiFailure } from '../api/http';

/**
 * Единственная реализация опроса: читает ресурс раз в `intervalMs`, пока
 * `isDone(data)` не вернёт true или компонент не размонтируется.
 * `fetcher: null` — опрос не нужен. Временный сбой (сеть, 5xx) не
 * останавливает опрос; невосстановимая ошибка — останавливает.
 */
export function usePolling<T>(
  fetcher: (() => Promise<T>) | null,
  deps: readonly unknown[],
  isDone: (value: T) => boolean,
  intervalMs = 750,
): { data: T | null; error: ApiFailure | null } {
  const [state, setState] = useState<{ data: T | null; error: ApiFailure | null }>({
    data: null,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const isDoneRef = useRef(isDone);
  isDoneRef.current = isDone;

  useEffect(() => {
    // Смена цели опроса: прежние данные не должны выдаваться за новые.
    setState({ data: null, error: null });
    if (!fetcherRef.current) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const cycle = () => {
      fetcherRef.current?.().then(
        (data) => {
          if (!alive) return;
          setState({ data, error: null });
          if (!isDoneRef.current(data)) timer = setTimeout(cycle, intervalMs);
        },
        (caught: unknown) => {
          if (!alive) return;
          const error = toFailure(caught);
          setState((prev) => ({ data: prev.data, error }));
          if (error.retryable) timer = setTimeout(cycle, intervalMs);
        },
      );
    };
    cycle();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs]);

  return state;
}
