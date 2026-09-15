import type { ReactNode } from 'react';
import type { QueryState } from '../lib/useQuery';
import { Notice } from './Notice';

/**
 * Единственная реализация «загрузка → ошибка → данные» для useQuery.
 * Страницы описывают только то, как показать готовые данные.
 */
export function Async<T>({
  state,
  children,
}: {
  state: QueryState<T>;
  children: (data: T) => ReactNode;
}) {
  if (state.data !== null) return <>{children(state.data)}</>;
  if (state.loading) {
    return (
      <p className="async-loading" role="status">
        <span className="spinner" aria-hidden="true" /> Загрузка…
      </p>
    );
  }
  return <Notice failure={state.error} onRetry={state.reload} />;
}
