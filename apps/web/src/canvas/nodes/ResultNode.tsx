import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { apiOrigin } from '../../api/http';
import type { ResultFlowNode } from '../../graph/serialize';
import { useCanvas } from '../CanvasContext';

export const ResultNode = memo(function ResultNode({ id, data }: NodeProps<ResultFlowNode>) {
  // Изображение попадает только в ноду, чей id совпадает с resultNodeId генерации.
  const { generationsByResult } = useCanvas();
  const generation = generationsByResult.get(id) ?? null;

  return (
    <div className="node node--result">
      <p className="node__title">{data.label}</p>
      {generation?.status === 'succeeded' && generation.imageUrl ? (
        <img
          className="node__image"
          src={apiOrigin + generation.imageUrl}
          alt={`Изображение по запросу: ${generation.prompt}`}
        />
      ) : generation?.status === 'processing' ? (
        <p className="node__hint" role="status">
          <span className="spinner" aria-hidden="true" /> Генерация…
        </p>
      ) : generation?.status === 'failed' ? (
        <p className="node__hint">Генерация не удалась</p>
      ) : (
        <p className="node__hint">Здесь появится изображение</p>
      )}
      <Handle type="target" position={Position.Left} />
    </div>
  );
});
