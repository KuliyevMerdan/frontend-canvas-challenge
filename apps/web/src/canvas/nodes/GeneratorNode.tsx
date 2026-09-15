import { memo, useEffect, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { api } from '../../api/endpoints';
import { ApiFailure } from '../../api/http';
import type { Scenario } from '../../api/types';
import type { GeneratorFlowNode } from '../../graph/serialize';
import { useAction } from '../../lib/useAction';
import { useIdempotencyKey } from '../../lib/useIdempotencyKey';
import { usePolling } from '../../lib/usePolling';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { useCanvas } from '../CanvasContext';

export const GeneratorNode = memo(function GeneratorNode({
  id,
  data,
}: NodeProps<GeneratorFlowNode>) {
  const { spaceId, config, generationsByNode, updateGeneration, saveGraph } = useCanvas();
  const generation = generationsByNode.get(id) ?? null;
  const [scenario, setScenario] = useState<Scenario>('success');
  const keyFor = useIdempotencyKey();

  const start = useAction(async (chosen: Scenario) => {
    // Сначала сброс debounce и ожидание текущего сохранения; без ETag не запускаем.
    const etag = await saveGraph();
    if (etag === null) {
      throw new ApiFailure(
        'state',
        'Граф не сохранён — генерация не запущена. Разберитесь с сохранением и повторите.',
      );
    }
    // Scope ключа: та же цепочка (прошлая генерация + версия графа + сценарий) —
    // повтор после сбоя сети идёт с прежним ключом, новый запуск получает новый.
    return api.createGeneration(
      spaceId,
      { nodeId: id, graphETag: etag, scenario: chosen },
      keyFor(`${generation?.id ?? 'first'}:${etag}:${chosen}`),
    );
  });

  const run = async () => {
    const created = await start.run(scenario);
    if (created) updateGeneration(created);
  };

  const processing = generation !== null && generation.status === 'processing';
  const pollId = processing ? generation.id : null;
  const polled = usePolling(
    pollId !== null ? () => api.generation(spaceId, pollId) : null,
    [pollId],
    (item) => item.status !== 'processing',
    config.pollIntervalMs,
  );
  useEffect(() => {
    if (polled.data) updateGeneration(polled.data);
  }, [polled.data, updateGeneration]);

  const scenarioId = `scenario-${id}`;
  return (
    <div className="node node--generator">
      <p className="node__title">{data.label}</p>
      <div className="node__field nodrag">
        <label htmlFor={scenarioId}>Сценарий</label>
        <select
          id={scenarioId}
          value={scenario}
          disabled={processing || start.pending}
          onChange={(event) => setScenario(event.target.value as Scenario)}
        >
          <option value="success">Успех</option>
          <option value="failure">Тестовый отказ</option>
        </select>
      </div>
      <Button
        className="nodrag"
        busy={start.pending || processing}
        onClick={run}
        aria-label={`Сгенерировать изображение: ${data.label}`}
      >
        {processing ? 'Генерация…' : 'Сгенерировать'}
      </Button>
      {start.error && <Notice failure={start.error} />}
      {!start.pending && !start.error && generation?.status === 'failed' && (
        <Notice>Генерация не удалась (тестовый отказ). Нажмите «Сгенерировать» для повтора.</Notice>
      )}
      {polled.error && <Notice tone="info">Связь прервалась — продолжаем проверять статус.</Notice>}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
});
