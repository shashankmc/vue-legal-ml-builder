import { ref } from 'vue'
import type { EdaResult, Id, MLAdapter } from '../types'

export function useEda(adapter: MLAdapter) {
  const result = ref<EdaResult | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function load(datasetId: Id) {
    isLoading.value = true
    error.value = null
    try {
      result.value = await adapter.getEdaData(datasetId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load EDA data'
    } finally {
      isLoading.value = false
    }
  }

  return { result, isLoading, error, load }
}
