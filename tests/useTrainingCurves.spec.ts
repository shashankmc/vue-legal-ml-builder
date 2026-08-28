import { describe, expect, it, vi } from 'vitest'
import { useTrainingCurves } from '../src/composables/useTrainingCurves'
import { createTestAdapter } from './testAdapter'
import type { TrainingMetricPoint } from '../src/types'

function point(step: number, metric = 'loss', overrides: Partial<TrainingMetricPoint> = {}): TrainingMetricPoint {
  return { id: `p${step}`, training_job_id: 'job-1', step, epoch: step * 0.1, metric_name: metric, value: 1 - step * 0.05, created_at: '', ...overrides }
}

describe('useTrainingCurves', () => {
  it('accumulates points across successive fetches using the since_step cursor', async () => {
    const adapter = createTestAdapter({
      getTrainingMetrics: vi
        .fn()
        .mockResolvedValueOnce([point(0), point(1)])
        .mockResolvedValueOnce([point(2)]),
    })
    const { points, fetchNew } = useTrainingCurves(adapter)

    await fetchNew('job-1')
    expect(points.value.map((p) => p.step)).toEqual([0, 1])
    expect(adapter.getTrainingMetrics).toHaveBeenLastCalledWith('job-1', -1)

    await fetchNew('job-1')
    expect(points.value.map((p) => p.step)).toEqual([0, 1, 2])
    expect(adapter.getTrainingMetrics).toHaveBeenLastCalledWith('job-1', 1)
  })

  it('groups points by metric name for charting', async () => {
    const adapter = createTestAdapter({
      getTrainingMetrics: vi.fn().mockResolvedValue([point(0, 'loss'), point(1, 'accuracy'), point(2, 'loss')]),
    })
    const { byMetric, fetchNew } = useTrainingCurves(adapter)

    await fetchNew('job-1')

    expect(Object.keys(byMetric.value).sort()).toEqual(['accuracy', 'loss'])
    expect(byMetric.value.loss).toHaveLength(2)
    expect(byMetric.value.accuracy).toHaveLength(1)
  })

  it('stops polling once stopWhen returns true', async () => {
    vi.useFakeTimers()
    const adapter = createTestAdapter({ getTrainingMetrics: vi.fn().mockResolvedValue([]) })
    const { start } = useTrainingCurves(adapter, 10)

    start('job-1', () => true)
    await vi.advanceTimersByTimeAsync(10)

    // stopWhen becoming true should have stopped the interval — a further
    // tick must not trigger another fetch.
    const callsAfterFirstTick = (adapter.getTrainingMetrics as any).mock.calls.length
    await vi.advanceTimersByTimeAsync(50)
    expect((adapter.getTrainingMetrics as any).mock.calls.length).toBe(callsAfterFirstTick)

    vi.useRealTimers()
  })
})
