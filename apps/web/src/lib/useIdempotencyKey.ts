import { useCallback, useRef } from 'react';

/**
 * Ключ идемпотентности, привязанный к «смыслу» операции. Пока scope не
 * меняется (то же тело заказа, та же попытка оплаты), повтор после сбоя сети
 * уходит с прежним ключом и не создаёт дубликата. Новый scope — новый ключ.
 */
export function useIdempotencyKey(): (scope: string) => string {
  const last = useRef<{ scope: string; key: string } | null>(null);
  return useCallback((scope: string) => {
    if (last.current?.scope !== scope) last.current = { scope, key: crypto.randomUUID() };
    return last.current.key;
  }, []);
}
