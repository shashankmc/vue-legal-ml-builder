import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '../src/demo/mockAdapter'

afterEach(() => {
  vi.useRealTimers()
})

describe('the demo adapter', () => {
  it('produces grouped points for a training run, with fine-tuning steps', async () => {
    vi.useFakeTimers()
    const adapter = createMockAdapter()
    const started = adapter.startTraining('seed-svm-3')
    await vi.advanceTimersByTimeAsync(60_000)
    const { job_id } = await started

    const metrics = adapter.getTrainingMetrics(job_id, -1)
    await vi.advanceTimersByTimeAsync(1_000)
    const points = await metrics

    expect(new Set(points.map((p) => p.group))).toEqual(new Set(['stage', 'train', 'eval']))
    const curve = points.filter((p) => p.group === 'train')
    expect(curve.length).toBeGreaterThan(3)
    expect(curve.every((p) => typeof p.training_step === 'number')).toBe(true)
    expect(points.filter((p) => p.group === 'stage').every((p) => p.training_step === null)).toBe(true)
  })
})
