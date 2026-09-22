import { ref } from 'vue'
import type { Id, MLAdapter, TrainingMetricPoint } from '../types'
import { createPollLoop, type PollLoop } from '../utils/polling'

/** Incrementally polls getTrainingMetrics and accumulates a reactive series —
 * the mlop.ai-style live-curve piece of experiment monitoring. Real per-step
 * curves only exist for the LegalBERT/RoBERTa path; classical sklearn
 * algorithms only produce a handful of coarse phase-marker points (see
 * legal-ml-core's README) — this composable renders whatever comes back
 * either way. */
export function useTrainingCurves(adapter: MLAdapter, pollIntervalMs = 3000) {
  const points = ref<TrainingMetricPoint[]>([])
  const byMetric = ref<Record<string, TrainingMetricPoint[]>>({})
  const isPolling = ref(false)
  let loop: PollLoop | null = null
  let lastStep = -1

  async function fetchNew(jobId: Id) {
    const newPoints = await adapter.getTrainingMetrics(jobId, lastStep)
    if (newPoints.length) {
      points.value.push(...newPoints)
      const grouped = byMetric.value
      for (const p of newPoints) {
        ;(grouped[p.metric_name] ??= []).push(p)
      }
      lastStep = Math.max(...newPoints.map((p) => p.step))
    }
  }

  function start(jobId: Id, stopWhen?: () => boolean) {
    stop()
    isPolling.value = true
    loop = createPollLoop(async () => {
      await fetchNew(jobId)
      if (stopWhen?.()) stop()
    }, pollIntervalMs)
    loop.start()
  }

  function stop() {
    loop?.stop()
    loop = null
    isPolling.value = false
  }

  function reset() {
    points.value = []
    byMetric.value = {}
    lastStep = -1
  }

  return { points, byMetric, isPolling, start, stop, reset, fetchNew }
}
