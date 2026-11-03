import { describe, expect, it, vi } from 'vitest'
import { useTraining } from '../src/composables/useTraining'
import { createTestAdapter } from './testAdapter'
import type { MlModel, TrainingJob } from '../src/types'

function job(overrides: Partial<TrainingJob> = {}): TrainingJob {
  return { id: 'job-1', user_id: 'u1', model_id: 'm1', status: 'running', progress: 0, created_at: '', ...overrides }
}
function model(overrides: Partial<MlModel> = {}): MlModel {
  return { id: 'm1', user_id: 'u1', dataset_id: 'd1', name: 'M', model_type: 'svm', parameters: {}, status: 'training', created_at: '', updated_at: '', ...overrides }
}

describe('useTraining', () => {
  it('starts training and stores the initial job/model status', async () => {
    const adapter = createTestAdapter({
      startTraining: vi.fn().mockResolvedValue({ job_id: 'job-1' }),
      getTrainingStatus: vi.fn().mockResolvedValue({ job: job(), model: model() }),
    })
    const { start, job: jobRef, model: modelRef } = useTraining(adapter, 100000)

    const jobId = await start('m1')

    expect(jobId).toBe('job-1')
    expect(jobRef.value?.id).toBe('job-1')
    expect(modelRef.value?.status).toBe('training')
  })

  it('polls until the job settles, then stops', async () => {
    vi.useFakeTimers()
    const statuses = [job({ status: 'running' }), job({ status: 'running' }), job({ status: 'completed' })]
    let call = 0
    const adapter = createTestAdapter({
      startTraining: vi.fn().mockResolvedValue({ job_id: 'job-1' }),
      getTrainingStatus: vi.fn().mockImplementation(async () => ({ job: statuses[Math.min(call++, statuses.length - 1)], model: model() })),
    })
    const { start, job: jobRef } = useTraining(adapter, 10)

    await start('m1')
    expect(jobRef.value?.status).toBe('running')

    await vi.advanceTimersByTimeAsync(10)
    expect(jobRef.value?.status).toBe('running')

    await vi.advanceTimersByTimeAsync(10)
    expect(jobRef.value?.status).toBe('completed')

    const callsAtCompletion = (adapter.getTrainingStatus as any).mock.calls.length
    await vi.advanceTimersByTimeAsync(50)
    expect((adapter.getTrainingStatus as any).mock.calls.length).toBe(callsAtCompletion)

    vi.useRealTimers()
  })

  it('surfaces an error message when starting fails', async () => {
    const adapter = createTestAdapter({ startTraining: vi.fn().mockRejectedValue(new Error('boom')) })
    const { start, error } = useTraining(adapter)

    await expect(start('m1')).rejects.toThrow('boom')
    expect(error.value).toBe('boom')
  })

  describe('stop', () => {
    function running(overrides = {}) {
      const statuses: TrainingJob[] = [job({ status: 'running' })]
      const adapter = createTestAdapter({
        startTraining: vi.fn().mockResolvedValue({ job_id: 'job-1' }),
        getTrainingStatus: vi.fn().mockImplementation(async () => ({ job: statuses[statuses.length - 1], model: model() })),
        ...overrides,
      })
      return { adapter, statuses }
    }

    it('stops the run and reports it stopped once the server says cancelled', async () => {
      const { adapter, statuses } = running({
        stopTraining: vi.fn().mockImplementation(async () => { statuses.push(job({ status: 'cancelled' })) }),
      })
      const training = useTraining(adapter, 100000)
      await training.start('m1')

      await expect(training.stop()).resolves.toBe('stopped')

      expect(adapter.stopTraining).toHaveBeenCalledWith('job-1')
      expect(training.job.value?.status).toBe('cancelled')
      expect(training.isStopping.value).toBe(false)
      expect(training.error.value).toBeNull()
    })

    it('reports a run that ended before the stop arrived, without an error', async () => {
      const { adapter, statuses } = running({
        stopTraining: vi.fn().mockImplementation(async () => {
          statuses.push(job({ status: 'completed', progress: 100 }))
          throw new Error('Training job is not active')
        }),
      })
      const training = useTraining(adapter, 100000)
      await training.start('m1')

      await expect(training.stop()).resolves.toBe('finished')

      expect(training.job.value?.status).toBe('completed')
      expect(training.error.value).toBeNull()
    })

    it('keeps watching a run the server would not stop, and says why', async () => {
      vi.useFakeTimers()
      const { adapter } = running({ stopTraining: vi.fn().mockRejectedValue(new Error('Training job not found')) })
      const training = useTraining(adapter, 10)
      await training.start('m1')

      await expect(training.stop()).resolves.toBe('error')

      expect(training.error.value).toBe('Training job not found')
      expect(training.job.value?.status).toBe('running')
      const calls = (adapter.getTrainingStatus as any).mock.calls.length
      await vi.advanceTimersByTimeAsync(10)
      expect((adapter.getTrainingStatus as any).mock.calls.length).toBeGreaterThan(calls)
      training.stopPolling()
      vi.useRealTimers()
    })
  })
})
