import { describe, expect, it } from 'vitest'
import { adviseFor, decisionTreeFor } from '../src/lens/modelGuide'
import type { GuideOption } from '../src/lens/modelGuide'

const optionFor = (task: string, label: string): GuideOption =>
  Object.values(decisionTreeFor(task)!.nodes).flatMap((n) => n.options).find((o) => o.label === label)!

describe('adviseFor', () => {
  it('carries the settings an answer comes with, and says why', () => {
    const advice = adviseFor(optionFor('classification', 'As rules a colleague can follow'))
    expect(advice.modelType).toBe('decision_tree')
    expect(advice.parameters).toEqual({ max_depth: 5 })
    expect(advice.why).toBe(
      'Recommended because each result follows a path of yes-or-no questions that you can read. '
      + 'Its tree stops after five questions, so each path stays short enough to follow.',
    )
  })

  it('weights rare labels up when some labels are much rarer than others', () => {
    const advice = adviseFor(optionFor('classification', 'As rules a colleague can follow'), { labelCounts: { Granted: 90, Refused: 10 } })
    expect(advice.parameters).toEqual({ max_depth: 5, class_weight: 'balanced' })
    expect(advice.why).toBe(
      'Recommended because each result follows a path of yes-or-no questions that you can read. '
      + 'Its tree stops after five questions, so each path stays short enough to follow, '
      + 'and rare labels count for more, because some labels in this Dataset are much rarer than others.',
    )
  })

  it('leaves the weighting alone when the labels are roughly even', () => {
    const advice = adviseFor(optionFor('classification', 'Getting as many results right as possible'), { labelCounts: { Granted: 60, Refused: 40 } })
    expect(advice.parameters).toEqual({})
    expect(advice.why).toBe('Recommended because it combines many simple rules, which tends to get more results right.')
  })

  it('does not offer weighting to a Model that has no such setting', () => {
    const advice = adviseFor(optionFor('classification', 'Quick results on a lot of documents'), { labelCounts: { Granted: 90, Refused: 10 } })
    expect(advice.parameters).toEqual({})
    expect(advice.why).not.toContain('rare labels')
  })

  it('weights rare labels up only when the backend offers it for that Model', () => {
    const catalogue = { random_forest: { name: 'Random Forest', description: '', parameters: { n_estimators: { type: 'int' as const, default: 100, min: 1, max: 1000 } } } }
    const advice = adviseFor(optionFor('classification', 'Getting as many results right as possible'), { labelCounts: { Granted: 90, Refused: 10 } }, { catalogue })
    expect(advice.parameters).toEqual({})
  })

  it('steers a small Dataset away from a Model that needs a lot of documents', () => {
    const best = optionFor('classification', 'The best results, even if training takes much longer')
    const advice = adviseFor(best, { rowCount: 300 })
    expect(advice.modelType).toBe('random_forest')
    expect(advice.why).toBe(
      'Recommended because this Dataset has only 300 documents, which is too few for LegalBERT to learn from, '
      + 'and Random Forest gets good results from fewer.',
    )
    expect(adviseFor(best, { rowCount: 5000 }).modelType).toBe('legalbert')
  })

  it('steers only to a Model the Dataset can use', () => {
    const best = optionFor('classification', 'The best results, even if training takes much longer')
    expect(adviseFor(best, { rowCount: 300 }, { available: ['logistic_regression', 'legalbert'] }).modelType).toBe('logistic_regression')
    expect(adviseFor(best, { rowCount: 300 }, { available: ['legalbert'] }).modelType).toBe('legalbert')
  })
})
