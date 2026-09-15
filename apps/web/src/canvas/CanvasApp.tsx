import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
} from '@xyflow/react';
import type { Config, GenerationData, GraphData, NodeKind, SpaceData } from '../api/types';
import { flowFromGraph, buildGraph, type CanvasEdge, type CanvasNode } from '../graph/serialize';
import { useGraphSync } from '../graph/useGraphSync';
import { useAction } from '../lib/useAction';
import { Button } from '../ui/Button';
import { CanvasContext, type CanvasContextValue } from './CanvasContext';
import { GeneratorNode } from './nodes/GeneratorNode';
import { PromptNode } from './nodes/PromptNode';
import { ResultNode } from './nodes/ResultNode';
import { SaveIndicator } from './SaveIndicator';

const nodeTypes = { prompt: PromptNode, generator: GeneratorNode, result: ResultNode };

const NEW_NODE: Record<NodeKind, { title: string; data: CanvasNode['data'] }> = {
  prompt: { title: '+ Текст', data: { text: '' } },
  generator: { title: '+ Генератор', data: { label: 'Генератор' } },
  result: { title: '+ Результат', data: { label: 'Результат' } },
};

interface CanvasAppProps {
  space: SpaceData;
  /** Нормализованный через buildGraph серверный граф. */
  graph: GraphData;
  etag: string;
  generations: GenerationData[];
  config: Config;
}

export function CanvasApp({ space, graph, etag, generations, config }: CanvasAppProps) {
  const initialFlow = useMemo(() => flowFromGraph(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(initialFlow.edges);
  const viewportRef = useRef(graph.viewport);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const { screenToFlowPosition, setViewport } = useReactFlow();

  const sync = useGraphSync({
    spaceId: space.id,
    initialGraph: graph,
    initialEtag: etag,
    debounceMs: config.debounceMs,
    snapshot: () => buildGraph(nodesRef.current, edgesRef.current, viewportRef.current),
  });

  // --- Локальные изменения: интерфейс обновляется сразу, сохранение — после паузы ---

  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      onNodesChange(changes);
      for (const change of changes) {
        // Выделение и измеренные размеры — служебные, в снимок не входят.
        if (change.type !== 'select' && change.type !== 'dimensions') {
          sync.markDirty();
          break;
        }
      }
    },
    [onNodesChange, sync.markDirty],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<CanvasEdge>[]) => {
      onEdgesChange(changes);
      for (const change of changes) {
        if (change.type !== 'select') {
          sync.markDirty();
          break;
        }
      }
    },
    [onEdgesChange, sync.markDirty],
  );

  const handleMoveEnd = useCallback(
    (_event: unknown, viewport: Viewport) => {
      viewportRef.current = viewport;
      sync.markDirty();
    },
    [sync.markDirty],
  );

  // --- Правила связей: prompt → generator, generator → result ---

  const nodeKindById = useMemo(() => {
    const map = new Map<string, NodeKind | undefined>();
    for (const node of nodes) map.set(node.id, node.type);
    return map;
  }, [nodes]);

  // Занятые порты: один вход у любой ноды, один выход у генератора.
  const occupiedPorts = useMemo(() => {
    const targets = new Set<string>();
    const sources = new Set<string>();
    for (const edge of edges) {
      targets.add(edge.target);
      sources.add(edge.source);
    }
    return { targets, sources };
  }, [edges]);

  const isValidConnection = useCallback(
    (connection: Connection | CanvasEdge) => {
      const { source, target } = connection;
      if (!source || !target || source === target) return false;
      if (edges.length >= config.maxEdges) return false;
      const sourceKind = nodeKindById.get(source);
      const targetKind = nodeKindById.get(target);
      const pairAllowed =
        (sourceKind === 'prompt' && targetKind === 'generator') ||
        (sourceKind === 'generator' && targetKind === 'result');
      if (!pairAllowed) return false;
      if (occupiedPorts.targets.has(target)) return false;
      if (sourceKind === 'generator' && occupiedPorts.sources.has(source)) return false;
      return true;
    },
    [nodeKindById, occupiedPorts, edges.length, config.maxEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      // Свой id: сервер принимает только UUID, а не автогенерируемые id React Flow.
      setEdges((current) => [
        ...current,
        { id: crypto.randomUUID(), source: connection.source, target: connection.target },
      ]);
      sync.markDirty();
    },
    [setEdges, sync.markDirty],
  );

  const addNode = useCallback(
    (kind: NodeKind) => {
      const center = screenToFlowPosition({
        x: window.innerWidth / 2 + (Math.random() - 0.5) * 120,
        y: window.innerHeight / 2 + (Math.random() - 0.5) * 120,
      });
      setNodes((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          type: kind,
          position: center,
          data: NEW_NODE[kind].data,
        } as CanvasNode,
      ]);
      sync.markDirty();
    },
    [screenToFlowPosition, setNodes, sync.markDirty],
  );

  // --- Генерации ---

  const [generationsByNode, setGenerationsByNode] = useState(() => {
    // Список приходит от новых к старым: первая запись на генератор — актуальная.
    const map = new Map<string, GenerationData>();
    for (const generation of generations) {
      if (!map.has(generation.nodeId)) map.set(generation.nodeId, generation);
    }
    return map;
  });

  const updateGeneration = useCallback((next: GenerationData) => {
    setGenerationsByNode((prev) => {
      const current = prev.get(next.nodeId);
      // Опрос присылает то же состояние — не создаём новую Map без изменений.
      if (current && current.id === next.id && current.status === next.status) return prev;
      const copy = new Map(prev);
      copy.set(next.nodeId, next);
      return copy;
    });
  }, []);

  const generationsByResult = useMemo(() => {
    const map = new Map<string, GenerationData>();
    for (const generation of generationsByNode.values()) {
      map.set(generation.resultNodeId, generation);
    }
    return map;
  }, [generationsByNode]);

  const canvasValue = useMemo<CanvasContextValue>(
    () => ({
      spaceId: space.id,
      config,
      generationsByNode,
      generationsByResult,
      updateGeneration,
      saveGraph: sync.flush,
    }),
    [space.id, config, generationsByNode, generationsByResult, updateGeneration, sync.flush],
  );

  // --- Конфликт версий: перечитать серверный граф по решению пользователя ---

  const reload = useAction(sync.reload);
  const handleReload = async () => {
    const result = await reload.run();
    if (result) {
      const flow = flowFromGraph(result.graph);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      viewportRef.current = result.graph.viewport;
      void setViewport(result.graph.viewport);
    }
  };

  return (
    <CanvasContext.Provider value={canvasValue}>
      <div className="layout">
        <header className="topbar">
          <h1 className="topbar__title">{space.title}</h1>
          <div className="topbar__actions" role="group" aria-label="Добавить ноду">
            {(Object.keys(NEW_NODE) as NodeKind[]).map((kind) => (
              <Button
                key={kind}
                variant="secondary"
                disabled={nodes.length >= config.maxNodes}
                onClick={() => addNode(kind)}
              >
                {NEW_NODE[kind].title}
              </Button>
            ))}
          </div>
          <SaveIndicator
            state={sync.state}
            onRetry={sync.retry}
            onReload={handleReload}
            reloading={reload.pending}
          />
        </header>
        <div className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onMoveEnd={handleMoveEnd}
            defaultViewport={graph.viewport}
            minZoom={0.1}
            maxZoom={4}
            nodeExtent={[
              [-10000, -10000],
              [10000, 10000],
            ]}
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </CanvasContext.Provider>
  );
}
