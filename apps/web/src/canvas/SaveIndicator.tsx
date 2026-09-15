import type { SaveState } from '../graph/useGraphSync';
import { Button } from '../ui/Button';

interface SaveIndicatorProps {
  state: SaveState;
  onRetry: () => void;
  onReload: () => void;
  reloading: boolean;
}

/** Единственное место отображения состояния сохранения графа. */
export function SaveIndicator({ state, onRetry, onReload, reloading }: SaveIndicatorProps) {
  switch (state.kind) {
    case 'saved':
      return <span className="save-state save-state--ok">Все изменения сохранены</span>;
    case 'dirty':
      return <span className="save-state">Изменения будут сохранены…</span>;
    case 'saving':
      return (
        <span className="save-state" role="status">
          <span className="spinner" aria-hidden="true" /> Сохранение…
        </span>
      );
    case 'error':
      return (
        <span className="save-state save-state--error" role="alert">
          Не удалось сохранить: {state.failure.message}
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        </span>
      );
    case 'conflict':
      return (
        <span className="save-state save-state--error" role="alert">
          Граф изменён в другом месте. Локальные правки не сохранены.
          <Button variant="secondary" busy={reloading} onClick={onReload}>
            Загрузить серверную версию
          </Button>
        </span>
      );
  }
}
