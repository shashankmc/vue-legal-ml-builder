import type { AnnotationTask } from '../types'
import { count } from './annotationState'

/** legal-ml-core's default for `LLM_MAX_SYNC_TASKS`, for servers whose status does not report `max_sync_tasks`. */
export const SUGGEST_BATCH_SIZE = 10

/** Pending items as the queue serves them: scored items best first, the rest in row order. */
export function queueOrder(tasks: AnnotationTask[]): AnnotationTask[] {
  return [...tasks].sort((a, b) => {
    const sa = a.score ?? null
    const sb = b.score ?? null
    if (sa !== sb) {
      if (sa === null) return 1
      if (sb === null) return -1
      return sb - sa
    }
    return a.item_index - b.item_index
  })
}

/** What one round of suggesting produced, in counts. */
export function batchSummary({ created, skipped, invalid }: { created: number; skipped: number; invalid: number }): string {
  if (!created && !skipped && !invalid) return 'There were no pending items to suggest labels for.'
  const parts = [`${count(created, 'suggestion')} ready.`]
  if (skipped) parts.push(`${count(skipped, 'item already had one', 'items already had one')}.`)
  if (invalid) {
    parts.push(
      `${count(invalid, 'answer was', 'answers were')} discarded because ${invalid === 1 ? 'it' : 'they'} did not give one of your labels.`,
    )
  }
  return parts.join(' ')
}

export function tokens(value: number): string {
  return value.toLocaleString('en-GB')
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`
}
