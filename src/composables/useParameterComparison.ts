import { ref } from 'vue'
import type { MLAdapter, ParameterComparisonPoint } from '../types'

/** Retrospective cross-run hyperparameter-vs-performance comparison — the
 * "learn how parameters affect performance" piece of experiment monitoring.
 * Purely reads already-stored parameters/metrics, no live polling needed. */
export function useParameterComparison(adapter: MLAdapter) {
  const points = ref<ParameterComparisonPoint[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function load(modelType: string, metric: string) {
    isLoading.value = true
    error.value = null
    try {
      points.value = await adapter.getParameterComparison(modelType, metric)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load parameter comparison'
    } finally {
      isLoading.value = false
    }
  }

  return { points, isLoading, error, load }
}
