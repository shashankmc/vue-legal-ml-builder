import { describe, expect, it } from 'vitest'
import {
  ANNOTATION_STATE,
  annotationControls,
  annotationState,
  labelledRows,
  nothingToAnnotateReason,
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
