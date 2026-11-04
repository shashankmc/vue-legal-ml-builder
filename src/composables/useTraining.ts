import { ref } from 'vue'
import type { Id, MLAdapter, MlModel, TrainingJob } from '../types'
import { createPollLoop, type PollLoop } from '../utils/polling'

export type StopOutcome = 'stopped' | 'finished' | 'error'

const TERMINAL: string[] = ['completed', 'failed', 'cancelled']

/** Starts a training job and polls its status until it settles. Mirrors the
 * pull-based polling pattern in vue-legal-summarizer's usePolling composable. */
export function useTraining(adapter: MLAdapter, pollIntervalMs = 5000) {
  const job = ref<TrainingJob | null>(null)
  const model = ref<MlModel | null>(null)
  const isStarting = ref(false)
  const isStopping = ref(false)
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
      if (TERMINAL.includes(status.job.status)) {
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

  /** Asks the server to stop the run, then reads the job back to learn what
   * happened: `stopped`, `finished` (it ended before the stop arrived), or
   * `error` (still running; `error` says why, and polling goes on). The status
   * read decides, because a refusal does not say whether the run had ended. */
  async function stop(): Promise<StopOutcome | undefined> {
    if (!job.value || isStopping.value) return
    const jobId = job.value.id
    isStopping.value = true
    error.value = null
    let refusal: unknown = null
    try {
      await adapter.stopTraining(jobId)
    } catch (err) {
      refusal = err
    }
    try {
      const status = await adapter.getTrainingStatus(jobId)
      job.value = status.job
      model.value = status.model
      if (status.job.status === 'cancelled') {
        stopPolling()
        return 'stopped'
      }
      if (TERMINAL.includes(status.job.status)) {
        stopPolling()
        return 'finished'
      }
    } catch {
      // The status read failed too; report the stop's own failure below.
    } finally {
      isStopping.value = false
    }
    error.value = refusal instanceof Error ? refusal.message : 'Could not stop training. Try again.'
    return 'error'
  }

  return { job, model, isStarting, isStopping, error, start, loadStatus, stop, stopPolling }
}
