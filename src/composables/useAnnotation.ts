import { ref } from 'vue'
import type { AnnotationTask, Id, MLAdapter } from '../types'

export function useAnnotation(adapter: MLAdapter) {
  const task = ref<AnnotationTask | null>(null)
  const stats = ref<{ total: number; annotated: number; percentage: number } | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function loadNext(projectId: Id, datasetId?: Id) {
    isLoading.value = true
    error.value = null
    try {
      const result = await adapter.getNextAnnotationTask(projectId, datasetId)
      task.value = result.task
      stats.value = result.stats
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load annotation task'
    } finally {
      isLoading.value = false
    }
  }

  async function save(label: unknown, projectId: Id, datasetId?: Id) {
    if (!task.value) return
    await adapter.saveAnnotation(task.value.id, label)
    await loadNext(projectId, datasetId)
  }

  async function skip(projectId: Id, datasetId?: Id) {
    if (!task.value) return
    await adapter.skipAnnotation(task.value.id)
    await loadNext(projectId, datasetId)
  }

  return { task, stats, isLoading, error, loadNext, save, skip }
}
