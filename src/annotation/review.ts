// The review of existing labels (BAIGLE #148).
import type { Assignment } from 'legal-annotation-kit'

const tagKey = (a: Assignment) => a.document_annotations.map((t) => t.label).sort()
const spanKey = (a: Assignment) =>
  a.annotations.map((s) => `${s.start}:${s.end}:${s.label}`).sort()

/** Whether the labels or spans differ. Ids, order and anything the review hides
 * do not count, so moving past an item unchanged never saves it, and a label
 * from the file stays the file's. */
export function assignmentChanged(before: Assignment, after: Assignment): boolean {
  return (
    JSON.stringify(tagKey(before)) !== JSON.stringify(tagKey(after)) ||
    JSON.stringify(spanKey(before)) !== JSON.stringify(spanKey(after))
  )
}

const SOURCES: Record<string, string> = {
  file: 'Label from the file',
  human: 'Labelled by a person',
  llm_confirmed: 'LLM suggestion, accepted',
  llm_bulk: 'LLM suggestion, bulk accepted',
}

/** Where a label came from, in words; empty when unknown. */
export function labelSourceText(source: string | null | undefined): string {
  return (source && SOURCES[source]) || ''
}
