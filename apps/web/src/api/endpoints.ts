import { request, send } from './http';
import type { Config, GenerationData, GenerationRequest, GraphData, SpaceData } from './types';

/**
 * Каждый вызов описывает только особенности своей операции: путь, метод,
 * тело и тип результата. Всё общее делает send()/request().
 * Графовые операции возвращают и ETag — он нужен для следующего PUT.
 */
export const api = {
  config: () => request<Config>('/api/config'),

  createSpace: (title: string) =>
    request<SpaceData>('/api/spaces', { method: 'POST', body: { title } }),
  space: (spaceId: string) => request<SpaceData>(`/api/spaces/${spaceId}`),

  graph: (spaceId: string) => send<GraphData>(`/api/spaces/${spaceId}/graph`),
  putGraph: (spaceId: string, graph: GraphData, ifMatch: string) =>
    send<GraphData>(`/api/spaces/${spaceId}/graph`, { method: 'PUT', body: graph, ifMatch }),

  generations: (spaceId: string) => request<GenerationData[]>(`/api/spaces/${spaceId}/generations`),
  createGeneration: (spaceId: string, body: GenerationRequest, idempotencyKey: string) =>
    request<GenerationData>(`/api/spaces/${spaceId}/generations`, {
      method: 'POST',
      body,
      idempotencyKey,
    }),
  generation: (spaceId: string, generationId: string) =>
    request<GenerationData>(`/api/spaces/${spaceId}/generations/${generationId}`),
};
