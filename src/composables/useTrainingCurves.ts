import { computed, ref } from 'vue'
import type { Id, MLAdapter, TrainingMetricPoint } from '../types'

/** Incrementally polls getTrainingMetrics and accumulates a reactive series —
 * the mlop.ai-style live-curve piece of experiment monitoring. Real per-step
 * curves only exist for the LegalBERT/RoBERTa path; classical sklearn
 * algorithms only produce a handful of coarse phase-marker points (see
 * legal-ml-core's README) — this composable renders whatever comes back
 * either way. */
export function useTrainingCurves(adapter: MLAdapter, pollIntervalMs = 3000) {
  const points = ref<TrainingMetricPoint[]>([])
  const isPolling = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let lastStep = -1

  const byMetric = computed<Record<string, TrainingMetricPoint[]>>(() => {
    const grouped: Record<string, TrainingMetricPoint[]> = {}
    for (const p of points.value) {
      ;(grouped[p.metric_name] ??= []).push(p)
    }
    return grouped
  })

  async function fetchNew(jobId: Id) {
    const newPoints = await adapter.getTrainingMetrics(jobId, lastStep)
    if (newPoints.length) {
      points.value = [...points.value, ...newPoints]
      lastStep = Math.max(...newPoints.map((p) => p.step))
    }
  }

  function start(jobId: Id, stopWhen?: () => boolean) {
    stop()
    isPolling.value = true
    timer = setInterval(async () => {
      await fetchNew(jobId)
      if (stopWhen?.()) stop()
    }, pollIntervalMs)
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    isPolling.value = false
  }

  function reset() {
    points.value = []
    lastStep = -1
  }

  return { points, byMetric, isPolling, start, stop, reset, fetchNew }
}
