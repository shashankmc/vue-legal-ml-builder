import { afterEach, describe, expect, it, vi } from 'vitest'
import { useModels } from '../src/composables/useModels'
import { createTestAdapter } from './testAdapter'
import type { MlModel } from '../src/types'

function model(overrides: Partial<MlModel> = {}): MlModel {
  return {
    id: 'm1',
    user_id: 'u1',
    dataset_id: 'd1',
    name: 'M',
    model_type: 'svm',
    parameters: {},
    status: 'training',
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('useModels', () => {
  it('polls while a model is training and stops once none are', async () => {
    vi.useFakeTimers()
    const adapter = createTestAdapter({
      listModels: vi
        .fn()
        .mockResolvedValueOnce([model({ status: 'training' })])
        .mockResolvedValueOnce([model({ status: 'training' })])
        .mockResolvedValueOnce([model({ status: 'completed' })]),
    })
    const { load, models } = useModels(adapter)

    await load()
    expect(models.value[0].status).toBe('training')

    await vi.advanceTimersByTimeAsync(10000)
    expect(adapter.listModels).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10000)
    expect(adapter.listModels).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(30000)
    expect(adapter.listModels).toHaveBeenCalledTimes(3)
  })

  it('survives a rejecting poll and keeps polling', async () => {
    vi.useFakeTimers()
    const adapter = createTestAdapter({
      listModels: vi
        .fn()
        .mockResolvedValueOnce([model({ status: 'training' })])
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce([model({ status: 'completed' })]),
    })
    const { load } = useModels(adapter)

    await load()
    await vi.advanceTimersByTimeAsync(10000)
    await vi.advanceTimersByTimeAsync(10000)
    expect(adapter.listModels).toHaveBeenCalledTimes(3)
  })

  it('does not start polling when nothing is training', async () => {
    vi.useFakeTimers()
    const adapter = createTestAdapter({ listModels: vi.fn().mockResolvedValue([model({ status: 'completed' })]) })
    const { load } = useModels(adapter)

    await load()
    await vi.advanceTimersByTimeAsync(60000)
    expect(adapter.listModels).toHaveBeenCalledTimes(1)
  })
})
