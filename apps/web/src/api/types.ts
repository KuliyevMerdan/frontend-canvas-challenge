export type {
  GraphData,
  NodeData,
  GenerationData,
  GenerationRequest,
  SpaceData,
} from '@canvas/contracts';

import type { GraphData, NodeData } from '@canvas/contracts';

export type NodeKind = NodeData['type'];
export type GraphEdge = GraphData['edges'][number];
export type Viewport = GraphData['viewport'];
export type Scenario = 'success' | 'failure';

export interface Config {
  debounceMs: number;
  pollIntervalMs: number;
  generationDelayMs: number;
  maxNodes: number;
  maxEdges: number;
  nodeTypes: string[];
}
