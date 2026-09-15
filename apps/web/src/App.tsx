import { ReactFlowProvider } from '@xyflow/react';
import { api } from './api/endpoints';
import { ApiFailure, toFailure } from './api/http';
import type { SpaceData } from './api/types';
import { CanvasApp } from './canvas/CanvasApp';
import { buildGraph } from './graph/serialize';
import { readStorage, writeStorage } from './lib/storage';
import { useQuery } from './lib/useQuery';
import { Async } from './ui/Async';

const SPACE_KEY = 'canvas.spaceId';

/** Открыть сохранённое пространство или создать новое, загрузить граф и генерации. */
async function openSpace() {
  const persistedId = readStorage(SPACE_KEY);
  let space: SpaceData | null = null;
  if (persistedId) {
    try {
      space = await api.space(persistedId);
    } catch (caught) {
      // Пространство пропало (сброс данных) — создаём новое; остальное пробрасываем.
      if (toFailure(caught).status !== 404) throw caught;
    }
  }
  if (!space) {
    space = await api.createSpace('Мой канвас');
    writeStorage(SPACE_KEY, space.id);
  }
  const [graphResponse, generations, config] = await Promise.all([
    api.graph(space.id),
    api.generations(space.id),
    api.config(),
  ]);
  if (!graphResponse.etag) {
    throw new ApiFailure('parse', 'Сервер не вернул версию графа (ETag).');
  }
  const { nodes, edges, viewport } = graphResponse.data;
  // Нормализация через buildGraph: снимки дальше сравниваются побайтово.
  return {
    space,
    graph: buildGraph(nodes, edges, viewport),
    etag: graphResponse.etag,
    generations,
    config,
  };
}

export function App() {
  const boot = useQuery(openSpace, []);
  return (
    <div className="app">
      <Async state={boot}>
        {(data) => (
          <ReactFlowProvider>
            <CanvasApp {...data} />
          </ReactFlowProvider>
        )}
      </Async>
    </div>
  );
}
