import { describe, expect, it } from 'vitest'
import { STRATEGY_COPY, retrainPrompt, verificationText } from '../src/annotation/activeLearning'
import type { ActiveLearningState } from '../src/types'

function state(overrides: Partial<ActiveLearningState> = {}): ActiveLearningState {
  return {
    active: true,
    strategy: 'prediction_entropy',
    seed_source: 'random',
    batch_size: 20,
    min_per_class: 5,
    model_id: null,
    round: { number: 0, status: 'labelling', strategy: 'random', model_id: null, job_id: null, labels_used: null, metrics: null, error: null, created_at: '', completed_at: null },
    label_counts: {},
    retrain: { new_labels: 0, allowed: false, suggested: false, classes_short: {}, needs_second_label: false },
    holdout: { percent: 20, size: 10, labelled: 0, needed: 10, verification: null },
    ...overrides,
  }
}

describe('strategy copy', () => {
  it('calls entropy "hardest cases first" and names every strategy in plain language', () => {
    expect(STRATEGY_COPY.prediction_entropy.label).toBe('Hardest cases first')
    expect(Object.keys(STRATEGY_COPY).sort()).toEqual([
      'breaking_ties',
      'embedding_kmeans',
      'least_confidence',
      'prediction_entropy',
      'random',
    ])
  })
})

describe('retrainPrompt', () => {
  it('asks once enough new labels exist', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 20, allowed: true, suggested: true, classes_short: {}, needs_second_label: false } }))
    expect(prompt).toEqual({ message: '20 new labels, retrain?', canRetrain: true, emphasised: true })
  })
  it('stays available but quiet below the batch size', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 1, allowed: true, suggested: false, classes_short: {}, needs_second_label: false } }))
    expect(prompt).toEqual({ message: '1 new label so far.', canRetrain: true, emphasised: false })
  })
  it('names what each short label still needs', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 8, allowed: false, suggested: false, classes_short: { Civil: 3, Criminal: 5 }, needs_second_label: false } }))
    expect(prompt.message).toBe('Before the first training: 3 more Civil, 5 more Criminal.')
    expect(prompt.canRetrain).toBe(false)
  })
  it('asks for a second label when only one exists', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 8, allowed: false, suggested: false, classes_short: {}, needs_second_label: true } }))
    expect(prompt.message).toBe('Training needs examples of at least two labels.')
  })
  it('claims nothing while there is nothing new', () => {
    expect(retrainPrompt(state())).toEqual({ message: '', canRetrain: false, emphasised: false })
  })
  it('reports the work in progress', () => {
    const round = { ...state().round, status: 'training' as const }
    expect(retrainPrompt(state({ round })).message).toBe('Training on your labels…')
    expect(retrainPrompt(state({ round: { ...round, status: 'scoring' } })).message).toBe('Reordering the queue…')
  })
})

describe('verificationText', () => {
  it('says nothing before a Model exists', () => {
    expect(verificationText(state())).toBe('')
  })
  it('never grades without a labelled holdout', () => {
    const holdout = { percent: 20, size: 10, labelled: 2, needed: 10, verification: 'not_independently_verified' as const }
    expect(verificationText(state({ holdout }))).toBe('Not independently verified')
  })
  it('names what the score was checked on', () => {
    const holdout = { percent: 20, size: 10, labelled: 10, needed: 10, verification: 'holdout' as const }
    expect(verificationText(state({ holdout }))).toBe('Checked on 10 held-back items')
  })
})
