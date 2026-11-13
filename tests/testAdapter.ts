import { vi } from 'vitest'
import type { Assignment } from 'legal-annotation-kit'
import type { AnnotationTask, MLAdapter } from '../src/types'

/** A task's empty Assignment, as legal-ml-core opens an unlabelled task. */
export function emptyAssignment(taskId: string): Assignment {
  return {
    id: taskId, annotator: 'u1', order: 1, status: 'pending', confidence: 0,
    annotations: [], document_annotations: [], document_relations: [],
  }
}

/** A fully-mocked MLAdapter for component/composable tests — every method is
 * a vi.fn() so individual tests can override return values as needed. */
export function createTestAdapter(overrides: Partial<MLAdapter> = {}): MLAdapter {
  const adapter: MLAdapter = {
    listDatasets: vi.fn().mockResolvedValue([]),
    getDataset: vi.fn(),
    uploadDataset: vi.fn(),
    deleteDataset: vi.fn(),
    getEdaData: vi.fn(),

    listModels: vi.fn().mockResolvedValue([]),
    getModel: vi.fn(),
    getAvailableModelTypes: vi.fn().mockResolvedValue({}),
    createModel: vi.fn(),
    updateModel: vi.fn(),
    deleteModel: vi.fn(),

    startTraining: vi.fn(),
    getTrainingStatus: vi.fn(),
    stopTraining: vi.fn(),
    getTrainingMetrics: vi.fn().mockResolvedValue([]),

    predict: vi.fn(),
    explain: vi.fn(),

    getModelPerformance: vi.fn(),
    getConfusionMatrix: vi.fn(),
    compareModels: vi.fn(),
    getParameterComparison: vi.fn().mockResolvedValue([]),

    getNextAnnotationTask: vi.fn(),
    saveAnnotation: vi.fn(),
    skipAnnotation: vi.fn(),
    getAnnotationAssignment: vi.fn(async (taskId: string) => ({
      document: { name: 'Item', full_text: served.get(taskId)?.text ?? '' },
      assignment: emptyAssignment(taskId),
      labels: [],
      annotationLevel: 'document' as const,
    })),
    saveAnnotationAssignment: vi.fn().mockResolvedValue({}),

    ...overrides,
  }
  // The default getAnnotationAssignment opens whatever task the queue (or the
  // skipped list) handed out, with its text, as the server would.
  const served = new Map<string, AnnotationTask>()
  const record = <T extends (...args: never[]) => Promise<unknown>>(fn: T | undefined, pick: (r: never) => AnnotationTask[]) =>
    fn &&
    (vi.fn(async (...args: Parameters<T>) => {
      const result = await fn(...args)
      for (const task of pick(result as never)) if (task) served.set(task.id, task)
      return result
    }) as unknown as T)
  adapter.getNextAnnotationTask = record(adapter.getNextAnnotationTask, (r: { task: AnnotationTask | null }) => (r?.task ? [r.task] : []))!
  adapter.listAnnotationTasks = record(adapter.listAnnotationTasks, (r: AnnotationTask[]) => r ?? [])
  return adapter
}
