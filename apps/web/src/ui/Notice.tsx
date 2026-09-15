import type { ReactNode } from 'react';
import type { ApiFailure } from '../api/http';
import { Button } from './Button';

interface NoticeProps {
  tone?: 'error' | 'info' | 'success';
  /** Разобранная ошибка запроса: показываем её сообщение. */
  failure?: ApiFailure | null;
  /** Свой текст (вместо или вместе с ошибкой). */
  children?: ReactNode;
  /** Действие повтора; кнопка появляется, только если оно передано. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Единственная реализация сообщения о состоянии. Ошибки уже разобраны
 * request-слоем — здесь только отображение и необязательное действие.
 */
export function Notice({
  tone = 'error',
  failure = null,
  children,
  onRetry,
  retryLabel = 'Повторить',
}: NoticeProps) {
  if (!failure && !children) return null;
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="notice__text">
        {children ?? failure?.message}
        {children && failure && <div className="notice__detail">{failure.message}</div>}
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
