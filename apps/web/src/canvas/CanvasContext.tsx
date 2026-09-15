import { createContext, useContext } from 'react';
import type { Config, GenerationData } from '../api/types';

export interface CanvasContextValue {
  spaceId: string;
  config: Config;
  /** Последняя генерация каждого генератора (по id ноды-генератора). */
  generationsByNode: ReadonlyMap<string, GenerationData>;
  /** Та же генерация, найденная по сохранённому в ней resultNodeId. */
  generationsByResult: ReadonlyMap<string, GenerationData>;
  updateGeneration: (generation: GenerationData) => void;
  /** Сохранить граф немедленно; ETag сохранённого графа или null при неудаче. */
  saveGraph: () => Promise<string | null>;
}

export const CanvasContext = createContext<CanvasContextValue | null>(null);

export function useCanvas(): CanvasContextValue {
  const value = useContext(CanvasContext);
  if (!value) throw new Error('useCanvas вызывается только внутри CanvasContext');
  return value;
}
