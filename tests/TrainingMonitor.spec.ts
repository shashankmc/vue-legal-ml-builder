import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TrainingMonitor from '../src/components/TrainingMonitor.vue'
import { createTestAdapter } from './testAdapter'
import type { MlModel, TrainingJob } from '../src/types'

function job(overrides: Partial<TrainingJob> = {}): TrainingJob {
  return { id: 'job-1', user_id: 'u1', model_id: 'm1', status: 'running', progress: 40, created_at: '', ...overrides }
}
function model(overrides: Partial<MlModel> = {}): MlModel {
  return { id: 'm1', user_id: 'u1', dataset_id: 'd1', name: 'Deontic classifier', model_type: 'svm', parameters: {}, status: 'training', created_at: '', updated_at: '', ...overrides }
}

// A running job that the server cancels once Stop is sent.
function runningAdapter() {
  let current = job()
  return createTestAdapter({
    getTrainingStatus: vi.fn().mockImplementation(async () => ({
      job: current,
      model: model({ status: current.status === 'cancelled' ? 'failed' : 'training' }),
    })),
    getTrainingMetrics: vi.fn().mockResolvedValue([]),
    stopTraining: vi.fn().mockImplementation(async () => { current = job({ status: 'cancelled' }) }),
  })
}

async function mountRunning(adapter = runningAdapter()) {
  const wrapper = mount(TrainingMonitor, { props: { adapter, modelId: 'm1', jobId: 'job-1' } })
  await flushPromises()
  return { wrapper, adapter }
}

function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

describe('TrainingMonitor: stopping a run', () => {
  it('asks before stopping, then stops the run and says it was stopped', async () => {
    const { wrapper, adapter } = await mountRunning()

    await button(wrapper, 'Stop training')!.trigger('click')
    expect(wrapper.text()).toContain('Stop this run?')
    expect(adapter.stopTraining).not.toHaveBeenCalled()

    await wrapper.find('.vmlb-stop-confirm .vmlb-btn-danger').trigger('click')
    await flushPromises()

    expect(adapter.stopTraining).toHaveBeenCalledWith('job-1')
    expect(wrapper.text()).toContain('Training stopped')
    expect(wrapper.text()).not.toContain('Training failed')
    expect(button(wrapper, 'Train again')).toBeTruthy()
    expect(wrapper.emitted('stopped')).toHaveLength(1)
  })

  it('keeps training when the user changes their mind', async () => {
    const { wrapper, adapter } = await mountRunning()

    await button(wrapper, 'Stop training')!.trigger('click')
    await button(wrapper, 'Keep training')!.trigger('click')

    expect(adapter.stopTraining).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Training in progress')
    expect(wrapper.text()).not.toContain('Stop this run?')
  })

  it('shows a run that was stopped earlier as stopped, not failed', async () => {
    const adapter = createTestAdapter({
      getTrainingStatus: vi.fn().mockResolvedValue({ job: job({ status: 'cancelled' }), model: model({ status: 'failed' }) }),
    })
    const wrapper = mount(TrainingMonitor, { props: { adapter, modelId: 'm1', jobId: 'job-1' } })
    await flushPromises()

    expect(wrapper.text()).toContain('Training stopped')
    expect(wrapper.text()).not.toContain('Training failed')
  })
})
