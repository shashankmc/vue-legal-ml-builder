import { ref } from 'vue'
import type { Dataset, DatasetUploadMeta, MLAdapter } from '../types'

export function useDatasets(adapter: MLAdapter) {
  const datasets = ref<Dataset[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    isLoading.value = true
    error.value = null
    try {
      datasets.value = await adapter.listDatasets()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load datasets'
    } finally {
      isLoading.value = false
    }
  }

  async function upload(file: File, meta: DatasetUploadMeta): Promise<Dataset> {
    const dataset = await adapter.uploadDataset(file, meta)
    datasets.value = [dataset, ...datasets.value]
    return dataset
  }

  async function remove(id: string) {
    await adapter.deleteDataset(id)
    datasets.value = datasets.value.filter((d) => d.id !== id)
  }

  return { datasets, isLoading, error, load, upload, remove }
}
