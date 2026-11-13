// What the annotation screen shows, decided from what the queue reports.

export const ANNOTATION_STATE = {
  IN_PROGRESS: 'in_progress',
  NOTHING_TO_ANNOTATE: 'nothing_to_annotate',
  QUEUE_UNAVAILABLE: 'queue_unavailable',
  SKIPPED_REMAINING: 'skipped_remaining',
  HOLDOUT_REMAINING: 'holdout_remaining',
  FINISHED: 'finished',
} as const

export type AnnotationScreenState = (typeof ANNOTATION_STATE)[keyof typeof ANNOTATION_STATE]
export type AnnotationControls = 'single' | 'multi' | 'entities'

// Which selector each task type labels with. A type left out has no controls, and
// legal-ml-core does not queue it either.
const CONTROLS: Record<string, AnnotationControls> = {
  classification: 'single',
  document_classification: 'single',
  judgment_prediction: 'single',
  'multi-label': 'multi',
  ner: 'entities',
  named_entity_recognition: 'entities',
}

export function annotationControls(taskType: string): AnnotationControls | null {
  return CONTROLS[taskType] ?? null
}

const NO_ANNOTATION_REASONS: Record<string, string> = {
  topic_modeling: 'Topic modelling finds themes by itself, so these rows need no labels.',
  clustering: 'Clustering groups documents by itself, so these rows need no labels.',
  summarization: 'Summaries are read from the Dataset file, not written here.',
}

export function nothingToAnnotateReason(taskType: string): string {
  return NO_ANNOTATION_REASONS[taskType] ?? 'Every row with text already has a label, so it is ready to train a Model.'
}

/** Labelled rows out of all rows, the meaning of a host's Annotated figure. Every
 * queue item not yet annotated is a row still without a label. */
export function labelledRows({ rowCount, total, annotated }: { rowCount: number; total: number; annotated: number }) {
  const labelled = rowCount - (total - annotated)
  return {
    labelled,
    rows: rowCount,
    percentage: rowCount > 0 ? Math.floor((labelled / rowCount) * 100) : 0,
  }
}

/** `total` and `annotated` count queue items; `unlabelledRows` counts the
 * Dataset's rows still without a label. Success is only ever reported for real
 * items: an empty queue is not finished work, and skipped items are not done.
 * Held-back items sit in `total` but are never served by the queue. */
export function annotationState({
  taskType,
  hasItem,
  total,
  annotated,
  unlabelledRows,
  holdoutRemaining = 0,
}: {
  taskType: string
  hasItem: boolean
  total: number
  annotated: number
  unlabelledRows: number
  holdoutRemaining?: number
}): AnnotationScreenState {
  if (!annotationControls(taskType)) return ANNOTATION_STATE.NOTHING_TO_ANNOTATE
  if (hasItem) return ANNOTATION_STATE.IN_PROGRESS
  if (total === 0) {
    return unlabelledRows > 0 ? ANNOTATION_STATE.QUEUE_UNAVAILABLE : ANNOTATION_STATE.NOTHING_TO_ANNOTATE
  }
  if (annotated === total) return ANNOTATION_STATE.FINISHED
  return annotated + holdoutRemaining === total ? ANNOTATION_STATE.HOLDOUT_REMAINING : ANNOTATION_STATE.SKIPPED_REMAINING
}

/** `count(2, 'item')` reads "2 items". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? singular : plural}`
}
