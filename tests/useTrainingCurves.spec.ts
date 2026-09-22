import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTrainingCurves } from '../src/composables/useTrainingCurves'
import { createTestAdapter } from './testAdapter'
import type { TrainingMetricPoint } from '../src/types'

function point(step: number, metric = 'loss', overrides: Partial<TrainingMetricPoint> = {}): TrainingMetricPoint {
  return { id: `p${step}`, training_job_id: 'job-1', step, epoch: step * 0.1, metric_name: metric, value: 1 - step * 0.05, created_at: '', ...overrides }
}

function hideDocument(hidden: { value: boolean }) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden.value })
}

afterEach(() => {
  vi.useRealTimers()
  delete (document as any).hidden
})

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

  it('accumulates 3×100 points and groups them incrementally', async () => {
    const batch = (base: number) => Array.from({ length: 100 }, (_, i) => point(base + i))
    const adapter = createTestAdapter({
      getTrainingMetrics: vi
        .fn()
        .mockResolvedValueOnce(batch(0))
        .mockResolvedValueOnce(batch(100))
        .mockResolvedValueOnce(batch(200)),
    })
    const { points, byMetric, fetchNew } = useTrainingCurves(adapter)

    await fetchNew('job-1')
    await fetchNew('job-1')
    await fetchNew('job-1')

    expect(points.value).toHaveLength(300)
    expect(byMetric.value.loss).toHaveLength(300)
    expect(byMetric.value.loss.map((p) => p.step)).toEqual(Array.from({ length: 300 }, (_, i) => i))
  })

  it('never overlaps requests when the adapter is slower than the interval', async () => {
    vi.useFakeTimers()
    let release: ((value: TrainingMetricPoint[]) => void) | null = null
    const adapter = createTestAdapter({
      getTrainingMetrics: vi.fn(
        () =>
          new Promise<TrainingMetricPoint[]>((resolve) => {
            release = resolve
          }),
      ),
    })
    const { start } = useTrainingCurves(adapter, 10)
    start('job-1')

    await vi.advanceTimersByTimeAsync(10)
    expect(adapter.getTrainingMetrics).toHaveBeenCalledTimes(1)

    // The first request is still pending, so several intervals must pass
    // without a second concurrent request.
    await vi.advanceTimersByTimeAsync(100)
    expect(adapter.getTrainingMetrics).toHaveBeenCalledTimes(1)

    release?.([])
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(10)
    expect(adapter.getTrainingMetrics).toHaveBeenCalledTimes(2)
  })

  it('makes no requests while the document is hidden and resumes on visibility', async () => {
    vi.useFakeTimers()
    const hidden = { value: true }
    hideDocument(hidden)
    const adapter = createTestAdapter({ getTrainingMetrics: vi.fn().mockResolvedValue([]) })
    const { start } = useTrainingCurves(adapter, 10)
    start('job-1')

    await vi.advanceTimersByTimeAsync(100)
    expect(adapter.getTrainingMetrics).not.toHaveBeenCalled()

    hidden.value = false
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.getTrainingMetrics).toHaveBeenCalledTimes(1)
  })

  it('keeps polling through a rejecting adapter', async () => {
    vi.useFakeTimers()
    const adapter = createTestAdapter({ getTrainingMetrics: vi.fn().mockRejectedValue(new Error('boom')) })
    const { start } = useTrainingCurves(adapter, 10)
    start('job-1')

    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(10)
    expect(adapter.getTrainingMetrics).toHaveBeenCalledTimes(2)
  })
})
