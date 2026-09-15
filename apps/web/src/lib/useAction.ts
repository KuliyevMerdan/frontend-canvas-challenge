import { useCallback, useEffect, useRef, useState } from 'react';
import { toFailure, type ApiFailure } from '../api/http';

export interface ActionState<Args extends unknown[], T> {
  /** Возвращает результат или null при ошибке (она попадает в `error`). */
  run: (...args: Args) => Promise<T | null>;
  pending: boolean;
  error: ApiFailure | null;
  reset: () => void;
}

/**
 * Единственная реализация «выполнить действие»: занятость кнопки, защита от
 * двойного нажатия, перехват ошибки. Компоненты не пишут try/catch —
 * они получают результат или разобранную ошибку.
 */
export function useAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
): ActionState<Args, T> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiFailure | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: Args): Promise<T | null> => {
    if (busy.current) return null;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      return await actionRef.current(...args);
    } catch (caught) {
      if (mounted.current) setError(toFailure(caught));
      return null;
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
