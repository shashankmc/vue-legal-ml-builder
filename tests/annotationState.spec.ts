import { describe, expect, it } from 'vitest'
import {
  ANNOTATION_STATE,
  addEntity,
  annotationControls,
  annotationState,
  canSaveAnnotation,
  labelledRows,
  nerSegments,
  nothingToAnnotateReason,
  toggleLabel,
} from '../src/annotation/annotationState'

const state = (overrides = {}) =>
  annotationState({ taskType: 'classification', hasItem: false, total: 0, annotated: 0, unlabelledRows: 0, ...overrides })

describe('annotationState', () => {
  it('is in progress while an item is on screen', () => {
    expect(state({ hasItem: true, total: 4, annotated: 1 })).toBe(ANNOTATION_STATE.IN_PROGRESS)
  })
  it('never reports success at 0/0', () => {
    expect(state()).toBe(ANNOTATION_STATE.NOTHING_TO_ANNOTATE)
  })
  it('does not call a dataset with blank labels complete when its queue is empty', () => {
    expect(state({ unlabelledRows: 12 })).toBe(ANNOTATION_STATE.QUEUE_UNAVAILABLE)
  })
  it('is finished once every real item is annotated', () => {
    expect(state({ total: 4, annotated: 4 })).toBe(ANNOTATION_STATE.FINISHED)
  })
  it('is not finished while skipped items remain', () => {
    expect(state({ total: 4, annotated: 3 })).toBe(ANNOTATION_STATE.SKIPPED_REMAINING)
  })
  it('is not success when every item was skipped', () => {
    expect(state({ total: 4, annotated: 0 })).toBe(ANNOTATION_STATE.SKIPPED_REMAINING)
  })
  it('has nothing to annotate on a task type with no controls', () => {
    expect(state({ taskType: 'summarization', total: 4 })).toBe(ANNOTATION_STATE.NOTHING_TO_ANNOTATE)
  })
  it('is not finished while only held-back items remain', () => {
    expect(state({ total: 10, annotated: 8, holdoutRemaining: 2 })).toBe(ANNOTATION_STATE.HOLDOUT_REMAINING)
  })
  it('still reports skipped items alongside held-back ones', () => {
    expect(state({ total: 10, annotated: 7, holdoutRemaining: 2 })).toBe(ANNOTATION_STATE.SKIPPED_REMAINING)
  })
})

describe('annotation controls', () => {
  it('maps task types to their selector', () => {
    expect(annotationControls('classification')).toBe('single')
    expect(annotationControls('judgment_prediction')).toBe('single')
    expect(annotationControls('multi-label')).toBe('multi')
    expect(annotationControls('ner')).toBe('entities')
    expect(annotationControls('summarization')).toBeNull()
  })
  it('lets NER save with no entities, and refuses a blank label elsewhere', () => {
    expect(canSaveAnnotation('ner', '')).toBe(true)
    expect(canSaveAnnotation('classification', '  ')).toBe(false)
    expect(canSaveAnnotation('classification', 'civil')).toBe(true)
    expect(canSaveAnnotation('summarization', 'x')).toBe(false)
  })
  it('explains why there is nothing to annotate', () => {
    expect(nothingToAnnotateReason('clustering')).toBe('Clustering groups documents by itself, so these rows need no labels.')
    expect(nothingToAnnotateReason('classification')).toBe('Every row with text already has a label, so it is ready to train a Model.')
  })
})

describe('labelledRows', () => {
  it('counts every queue item not annotated as a row without a label', () => {
    expect(labelledRows({ rowCount: 20, total: 12, annotated: 3 })).toEqual({ labelled: 11, rows: 20, percentage: 55 })
  })
  it('counts held-back rows as unlabelled until someone labels them', () => {
    expect(labelledRows({ rowCount: 10, total: 10, annotated: 8 })).toEqual({ labelled: 8, rows: 10, percentage: 80 })
  })
  it('is 0% with no rows', () => {
    expect(labelledRows({ rowCount: 0, total: 0, annotated: 0 }).percentage).toBe(0)
  })
})

describe('multi-label and NER helpers', () => {
  it('toggles a label in a comma list', () => {
    expect(toggleLabel('a,b', 'c')).toBe('a,b,c')
    expect(toggleLabel('a,b', 'a')).toBe('b')
  })
  it('splits text into entity segments', () => {
    expect(nerSegments('Alice met Bob', [{ text: 'Bob', start: 10, end: 13, type: 'Person' }])).toEqual([
      { text: 'Alice met ', type: null },
      { text: 'Bob', type: 'Person' },
    ])
  })
  it('refuses an overlapping span', () => {
    const entities = [{ text: 'Alice', start: 0, end: 5, type: 'Person' }]
    expect(addEntity(entities, { text: 'lic', start: 1, end: 4 }, 'Misc')).toEqual(entities)
    expect(addEntity(entities, { text: 'met', start: 6, end: 9 }, 'Misc')).toHaveLength(2)
  })
})
