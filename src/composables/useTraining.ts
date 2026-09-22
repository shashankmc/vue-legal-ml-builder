import { ref } from 'vue'
import type { Id, MLAdapter, MlModel, TrainingJob } from '../types'
import { createPollLoop, type PollLoop } from '../utils/polling'

/** Starts a training job and polls its status until it settles. Mirrors the
 * pull-based polling pattern in vue-legal-summarizer's usePolling composable. */
export function useTraining(adapter: MLAdapter, pollIntervalMs = 5000) {
  const job = ref<TrainingJob | null>(null)
  const model = ref<MlModel | null>(null)
  const isStarting = ref(false)
  const error = ref<string | null>(null)
  let loop: PollLoop | null = null

  function stopPolling() {
    loop?.stop()
    loop = null
  }

  function pollStatus(jobId: Id) {
    stopPolling()
    loop = createPollLoop(async () => {
      const status = await adapter.getTrainingStatus(jobId)
      job.value = status.job
      model.value = status.model
      if (['completed', 'failed', 'cancelled'].includes(status.job.status)) {
        stopPolling()
      }
    }, pollIntervalMs)
    loop.start()
  }

  async function start(modelId: Id, options?: Parameters<MLAdapter['startTraining']>[1]) {
    isStarting.value = true
    error.value = null
    try {
      const { job_id } = await adapter.startTraining(modelId, options)
      const status = await adapter.getTrainingStatus(job_id)
      job.value = status.job
      model.value = status.model
      pollStatus(job_id)
      return job_id
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to start training'
      throw err
    } finally {
      isStarting.value = false
    }
  }

  async function loadStatus(jobId: Id) {
    const status = await adapter.getTrainingStatus(jobId)
    job.value = status.job
    model.value = status.model
    if (['pending', 'running'].includes(status.job.status)) {
      pollStatus(jobId)
    }
  }

  async function stop() {
    if (!job.value) return
    await adapter.stopTraining(job.value.id)
    stopPolling()
  }

  return { job, model, isStarting, error, start, loadStatus, stop, stopPolling }
}
