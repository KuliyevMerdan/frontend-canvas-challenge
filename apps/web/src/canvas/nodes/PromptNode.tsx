import { memo } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import type { PromptFlowNode } from '../../graph/serialize';

export const PromptNode = memo(function PromptNode({ id, data }: NodeProps<PromptFlowNode>) {
  const { updateNodeData } = useReactFlow();
  const fieldId = `prompt-${id}`;
  return (
    <div className="node node--prompt">
      <label className="node__title" htmlFor={fieldId}>
        Описание изображения
      </label>
      <textarea
        id={fieldId}
        className="node__textarea nodrag"
        rows={4}
        maxLength={2000}
        placeholder="Например: горы на рассвете"
        value={data.text}
        onChange={(event) => updateNodeData(id, { text: event.target.value })}
      />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
