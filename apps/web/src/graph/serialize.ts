import type { Edge, Node } from '@xyflow/react';
import type { GraphData, GraphEdge, NodeData, Viewport } from '../api/types';

// Типы нод React Flow: data совпадает с постоянной схемой API, а служебные
// поля RF (selected, dragging, measured…) живут рядом и в снимок не попадают.
export type PromptFlowNode = Node<{ text: string }, 'prompt'>;
export type GeneratorFlowNode = Node<{ label: string }, 'generator'>;
export type ResultFlowNode = Node<{ label: string }, 'result'>;
export type CanvasNode = PromptFlowNode | GeneratorFlowNode | ResultFlowNode;
export type CanvasEdge = Edge;

const POSITION_LIMIT = 10000;
const clampPosition = (value: number) => Math.min(POSITION_LIMIT, Math.max(-POSITION_LIMIT, value));
const clampZoom = (value: number) => Math.min(4, Math.max(0.1, value));

interface AnyNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: { text?: string; label?: string };
}

interface AnyEdge {
  id: string;
  source: string;
  target: string;
}

/**
 * Единственный построитель снимка графа. Принимает и ноды React Flow, и граф
 * сервера: один проход по нодам, один по связям, литералы с фиксированным
 * порядком ключей — поэтому JSON.stringify двух снимков можно сравнивать
 * побайтово (проверка «дошёл ли потерянный PUT»).
 */
export function buildGraph(
  nodes: readonly AnyNode[],
  edges: readonly AnyEdge[],
  viewport: Viewport,
): GraphData {
  const outNodes: NodeData[] = [];
  for (const node of nodes) {
    const position = { x: clampPosition(node.position.x), y: clampPosition(node.position.y) };
    if (node.type === 'prompt') {
      outNodes.push({
        id: node.id,
        type: 'prompt',
        position,
        data: { text: node.data.text ?? '' },
      });
    } else if (node.type === 'generator' || node.type === 'result') {
      outNodes.push({
        id: node.id,
        type: node.type,
        position,
        data: { label: node.data.label ?? '' },
      });
    }
  }
  const outEdges: GraphEdge[] = [];
  for (const edge of edges) {
    outEdges.push({ id: edge.id, source: edge.source, target: edge.target });
  }
  return {
    nodes: outNodes,
    edges: outEdges,
    viewport: { x: viewport.x, y: viewport.y, zoom: clampZoom(viewport.zoom) },
  };
}

/** Граф сервера → состояние React Flow (данные копируются, чтобы RF мог их мутировать). */
export function flowFromGraph(graph: GraphData): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const nodes: CanvasNode[] = [];
  for (const node of graph.nodes) {
    nodes.push({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: { ...node.data },
    } as CanvasNode);
  }
  const edges: CanvasEdge[] = [];
  for (const edge of graph.edges) {
    edges.push({ id: edge.id, source: edge.source, target: edge.target });
  }
  return { nodes, edges };
}
