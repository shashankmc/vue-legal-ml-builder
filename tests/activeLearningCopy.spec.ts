import { describe, expect, it } from 'vitest'
import { STRATEGY_COPY, holdoutClassText, retrainPrompt, trainingWarning, verificationText } from '../src/annotation/activeLearning'
import type { ActiveLearningState } from '../src/types'

const READINESS = { labels_total: 40, label_cap: 100, classes_left_out: [], classes_unseen: [], classes_to_train: 2, labels_needed: 0 }

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
    typed_labels: false,
    retrain: { new_labels: 0, allowed: false, suggested: false, classes_short: {}, needs_second_label: false, ...READINESS },
    holdout: { percent: 20, size: 10, labelled: 0, label_counts: {}, needed: 10, verification: null },
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
    const prompt = retrainPrompt(state({ retrain: { new_labels: 20, allowed: true, suggested: true, classes_short: {}, needs_second_label: false, ...READINESS } }))
    expect(prompt).toEqual({ message: '20 new labels, retrain?', canRetrain: true, emphasised: true })
  })
  it('stays available but quiet below the batch size', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 1, allowed: true, suggested: false, classes_short: {}, needs_second_label: false, ...READINESS } }))
    expect(prompt).toEqual({ message: '1 new label so far.', canRetrain: true, emphasised: false })
  })
  it('names what each short label still needs', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 8, allowed: false, suggested: false, classes_short: { Civil: 3, Criminal: 5 }, needs_second_label: false, ...READINESS } }))
    expect(prompt.message).toBe('Before the first training: 3 more Civil, 5 more Criminal, or 100 labels in all (40 so far).')
    expect(prompt.canRetrain).toBe(false)
  })
  it('asks for a second label when only one exists', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 8, allowed: false, suggested: false, classes_short: {}, needs_second_label: true, ...READINESS } }))
    expect(prompt.message).toBe('Training needs at least 2 examples each of two labels.')
  })
  it('asks for more examples when there are too few to split every label', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 24, allowed: false, suggested: false, classes_short: { a: 3 }, needs_second_label: false, ...READINESS, label_cap: 20, labels_total: 24, classes_to_train: 12, labels_needed: 32 } }))
    expect(prompt.message).toBe('With 12 labels, training needs 32 more examples.')
    expect(prompt.canRetrain).toBe(false)
  })
  it('offers Retrain at the cap with labels still short', () => {
    const prompt = retrainPrompt(state({ retrain: { new_labels: 100, allowed: true, suggested: true, classes_short: { Rare: 2 }, needs_second_label: false, ...READINESS, labels_total: 100 } }))
    expect(prompt).toEqual({ message: '100 new labels, retrain?', canRetrain: true, emphasised: true })
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

describe('trainingWarning', () => {
  const allowed = { new_labels: 100, allowed: true, suggested: true, needs_second_label: false, ...READINESS, labels_total: 100 }

  it('says nothing when every label has its minimum', () => {
    expect(trainingWarning(state({ retrain: { ...allowed, classes_short: {} } }))).toBe('')
  })
  it('says nothing while training is not open', () => {
    expect(trainingWarning(state({ retrain: { ...allowed, allowed: false, classes_short: { Rare: 2 } } }))).toBe('')
  })
  it('names the short labels with how many examples each has', () => {
    const warning = trainingWarning(state({ label_counts: { Common: 90, Frist: 3, Recht: 2 }, retrain: { ...allowed, classes_short: { Frist: 2, Recht: 3 } } }))
    expect(warning).toBe('Few examples of Frist (3) and Recht (2), so the Model may miss them.')
  })
  it('says a label with one example is left out', () => {
    const warning = trainingWarning(state({ label_counts: { Common: 99, Lone: 1 }, retrain: { ...allowed, classes_short: { Lone: 4 }, classes_left_out: ['Lone'] } }))
    expect(warning).toBe('Only one example of Lone, so training leaves it out.')
  })
  it('names several left-out labels, and those with no examples', () => {
    const warning = trainingWarning(state({ label_counts: { Common: 97, Short: 2, a: 1 }, retrain: { ...allowed, classes_short: { Short: 3, a: 4, b: 4 }, classes_left_out: ['a', 'b'], classes_unseen: ['c'] } }))
    expect(warning).toBe('Few examples of Short (2), so the Model may miss it. Only one example each of a and b, so training leaves them out. No examples of c yet, so the Model cannot predict it.')
  })
})

describe('holdoutClassText', () => {
  it('counts held-back labels, the largest first', () => {
    const holdout = { percent: 20, size: 20, labelled: 10, label_counts: { Gebot: 2, Verbot: 8 }, needed: 10, verification: null }
    expect(holdoutClassText(state({ holdout }))).toBe('Held back so far: 8 Verbot, 2 Gebot.')
  })
  it('says nothing with no held-back labels', () => {
    expect(holdoutClassText(state())).toBe('')
  })
})

describe('verificationText', () => {
  it('says nothing before a Model exists', () => {
    expect(verificationText(state())).toBe('')
  })
  it('never grades without a labelled holdout', () => {
    const holdout = { percent: 20, size: 10, labelled: 2, label_counts: {}, needed: 10, verification: 'not_independently_verified' as const }
    expect(verificationText(state({ holdout }))).toBe('Not independently verified')
  })
  it('names what the score was checked on', () => {
    const holdout = { percent: 20, size: 10, labelled: 10, label_counts: {}, needed: 10, verification: 'holdout' as const }
    expect(verificationText(state({ holdout }))).toBe('Checked on 10 held-back items')
  })
})

describe('retrainPrompt on later rounds', () => {
  it('does not call a retrain the first training', () => {
    const round = { ...state().round, number: 2 }
    const retrain = { new_labels: 3, allowed: false, suggested: false, classes_short: { Civil: 3 }, needs_second_label: false, ...READINESS }
    expect(retrainPrompt(state({ round, retrain })).message).toBe('Before retraining: 3 more Civil, or 100 labels in all (40 so far).')
  })
})
