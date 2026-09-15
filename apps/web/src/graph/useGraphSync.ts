import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/endpoints';
import { toFailure, type ApiFailure } from '../api/http';
import type { GraphData } from '../api/types';
import { buildGraph } from './serialize';

export type SaveState =
  | { kind: 'saved' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'error'; failure: ApiFailure }
  | { kind: 'conflict' };

interface GraphSyncOptions {
  spaceId: string;
  /** Граф, как он был загружен (нормализованный через buildGraph). */
  initialGraph: GraphData;
  /** ETag загруженного графа — как получен, с кавычками. */
  initialEtag: string;
  debounceMs: number;
  /** Текущее локальное состояние в момент сохранения. */
  snapshot: () => GraphData;
}

export interface GraphSync {
  state: SaveState;
  /** Отметить локальное изменение: сохранение уйдёт после паузы debounceMs. */
  markDirty: () => void;
  /** Сохранить всё несохранённое сейчас; ETag сохранённого графа или null при неудаче. */
  flush: () => Promise<string | null>;
  /** Повторить сохранение после ошибки. */
  retry: () => void;
  /** При конфликте: перечитать серверный граф (локальные правки заменяются). */
  reload: () => Promise<{ graph: GraphData; etag: string } | null>;
}

/**
 * Единственная реализация автосохранения графа.
 *
 * Очередь длиной один: пока PUT в полёте, новые правки только копятся локально;
 * после ответа сохраняется последнее состояние с ETag из этого ответа. Ответ
 * старого запроса никогда не записывается в локальное состояние — из него
 * берётся только ETag, поэтому он не может затереть более свежие правки.
 *
 * Потерянный ответ PUT: перечитываем граф и сравниваем со снимком, который
 * отправляли — совпал, значит запись дошла (принимаем новый ETag); не совпал —
 * одна автоматическая повторная попытка с перечитанным ETag, дальше ошибка
 * с ручным повтором. 412 — конфликт версий: правки остаются локально,
 * пользователь решает, перечитывать ли серверный граф.
 */
export function useGraphSync(options: GraphSyncOptions): GraphSync {
  const { spaceId, debounceMs } = options;
  const [state, setState] = useState<SaveState>({ kind: 'saved' });
  const stateRef = useRef(state);
  const setStatus = useCallback((next: SaveState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const snapshotRef = useRef(options.snapshot);
  snapshotRef.current = options.snapshot;
  const etagRef = useRef(options.initialEtag);
  const savedJsonRef = useRef(JSON.stringify(options.initialGraph));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef<Promise<void> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const drain = useCallback((): Promise<void> => {
    if (savingRef.current) return savingRef.current;
    savingRef.current = (async () => {
      let recovered = false;
      try {
        for (;;) {
          const snapshotGraph = snapshotRef.current();
          const snapshotJson = JSON.stringify(snapshotGraph);
          if (snapshotJson === savedJsonRef.current) {
            setStatus({ kind: 'saved' });
            return;
          }
          // Пользователь продолжает редактировать — дожидаемся его паузы.
          if (timerRef.current !== null) {
            setStatus({ kind: 'dirty' });
            return;
          }
          setStatus({ kind: 'saving' });
          try {
            const { etag } = await api.putGraph(spaceId, snapshotGraph, etagRef.current);
            if (etag) etagRef.current = etag;
            savedJsonRef.current = snapshotJson;
          } catch (caught) {
            const failure = toFailure(caught);
            if (failure.status === 412 || failure.status === 428) {
              setStatus({ kind: 'conflict' });
              return;
            }
            if (failure.kind === 'network' && !recovered) {
              recovered = true;
              // Ответ мог потеряться после записи: сверяем сервер со снимком.
              const server = await api.graph(spaceId);
              if (server.etag) etagRef.current = server.etag;
              const serverJson = JSON.stringify(
                buildGraph(server.data.nodes, server.data.edges, server.data.viewport),
              );
              if (serverJson === snapshotJson) savedJsonRef.current = snapshotJson;
              continue; // запись дошла — цикл увидит «чисто»; нет — повтор со свежим ETag
            }
            setStatus({ kind: 'error', failure });
            return;
          }
        }
      } catch (caught) {
        // Сбой при перечитывании графа во время восстановления.
        setStatus({ kind: 'error', failure: toFailure(caught) });
      } finally {
        savingRef.current = null;
      }
    })();
    return savingRef.current;
  }, [spaceId, setStatus]);

  const markDirty = useCallback(() => {
    if (stateRef.current.kind === 'conflict') return; // ждём решения пользователя
    if (stateRef.current.kind === 'saved') setStatus({ kind: 'dirty' });
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void drain();
    }, debounceMs);
  }, [clearTimer, drain, debounceMs, setStatus]);

  const flush = useCallback(async (): Promise<string | null> => {
    // Пользователь может продолжать печатать во время flush — несколько кругов.
    for (let round = 0; round < 3; round += 1) {
      clearTimer();
      await (savingRef.current ?? Promise.resolve());
      await drain();
      const { kind } = stateRef.current;
      if (kind === 'saved') return etagRef.current;
      if (kind !== 'dirty') return null; // error или conflict
    }
    return null;
  }, [clearTimer, drain]);

  const retry = useCallback(() => {
    if (stateRef.current.kind === 'error') void drain();
  }, [drain]);

  const reload = useCallback(async (): Promise<{ graph: GraphData; etag: string } | null> => {
    const server = await api.graph(spaceId);
    if (!server.etag) return null;
    const graph = buildGraph(server.data.nodes, server.data.edges, server.data.viewport);
    etagRef.current = server.etag;
    savedJsonRef.current = JSON.stringify(graph);
    clearTimer();
    setStatus({ kind: 'saved' });
    return { graph, etag: server.etag };
  }, [spaceId, clearTimer, setStatus]);

  // Уход со страницы: таймер не должен стрелять после размонтирования.
  useEffect(() => clearTimer, [clearTimer]);

  return useMemo(
    () => ({ state, markDirty, flush, retry, reload }),
    [state, markDirty, flush, retry, reload],
  );
}
