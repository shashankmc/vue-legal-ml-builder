import { ref } from 'vue'
import type { AnnotationStats, AnnotationTask, Id, MLAdapter } from '../types'

export function useAnnotation(adapter: MLAdapter) {
  const task = ref<AnnotationTask | null>(null)
  const stats = ref<AnnotationStats | null>(null)
  const isLoading = ref(false)
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)
  /** Labelling held-back items, which the queue only serves when asked. */
  const holdout = ref(false)
  const skippedToReview = ref<AnnotationTask[]>([])

  function fail(err: unknown, fallback: string) {
    error.value = err instanceof Error ? err.message : fallback
  }

  async function fetchNext(projectId: Id, datasetId?: Id) {
    return holdout.value
      ? adapter.getNextAnnotationTask(projectId, datasetId, { holdout: true })
      : adapter.getNextAnnotationTask(projectId, datasetId)
  }

  async function loadNext(projectId: Id, datasetId?: Id) {
    isLoading.value = true
    error.value = null
    try {
      let result = await fetchNext(projectId, datasetId)
      if (!result.task && holdout.value) {
        holdout.value = false
        result = await fetchNext(projectId, datasetId)
      }
      const next = result.task ?? skippedToReview.value[0] ?? null
      skippedToReview.value = skippedToReview.value.filter((item) => item.id !== next?.id)
      task.value = next
      stats.value = result.stats
    } catch (err) {
      fail(err, 'Failed to load annotation task')
    } finally {
      isLoading.value = false
    }
  }

  /** The queue only hands out pending items, so skipped ones are fetched here
   * and worked through once it has run out. */
  async function reviewSkipped(projectId: Id, datasetId?: Id) {
    error.value = null
    try {
      skippedToReview.value = (await adapter.listAnnotationTasks?.(projectId, { status: 'skipped', datasetId })) ?? []
      await loadNext(projectId, datasetId)
    } catch (err) {
      fail(err, 'Failed to load skipped items')
    }
  }

  async function submit(action: () => Promise<unknown>, projectId: Id, datasetId: Id | undefined, fallback: string) {
    if (!task.value || isSubmitting.value) return false
    isSubmitting.value = true
    error.value = null
    try {
      await action()
      await loadNext(projectId, datasetId)
      return true
    } catch (err) {
      // The item stays on screen, so the work is not lost.
      fail(err, fallback)
      return false
    } finally {
      isSubmitting.value = false
    }
  }

  function save(label: unknown, projectId: Id, datasetId?: Id) {
    return submit(() => adapter.saveAnnotation(task.value!.id, label), projectId, datasetId, 'Failed to save annotation')
  }

  function skip(projectId: Id, datasetId?: Id) {
    return submit(() => adapter.skipAnnotation(task.value!.id), projectId, datasetId, 'Failed to skip item')
  }

  function setHoldout(value: boolean, projectId: Id, datasetId?: Id) {
    holdout.value = value
    return loadNext(projectId, datasetId)
  }

  return { task, stats, isLoading, isSubmitting, error, holdout, loadNext, save, skip, reviewSkipped, setHoldout }
}
