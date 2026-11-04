import { describe, expect, it } from 'vitest'
import { adviseFor, decisionTreeFor } from '../src/lens/modelGuide'
import type { DatasetFacts, GuideOption } from '../src/lens/modelGuide'
import { modelsByTaskType, parameterRules, parameterSchemas } from '../src/components/modelCatalogData'
import { reconcileChoices } from '../src/components/parameterOptions'
import { coreParameterLimits } from './fixtures/coreParameterLimits'

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
    const advice = adviseFor(optionFor('classification', 'Telling apart documents that use similar words'), { labelCounts: { Granted: 60, Refused: 40 } })
    expect(advice.parameters).toEqual({})
    expect(advice.why).toBe('Recommended because it draws a sharp line between labels that look alike.')
  })

  it('does not offer weighting to a Model that has no such setting', () => {
    const advice = adviseFor(optionFor('classification', 'Quick results on a lot of documents'), { labelCounts: { Granted: 90, Refused: 10 } })
    expect(advice.parameters).toEqual({})
    expect(advice.why).not.toContain('rare labels')
  })

  it('weights rare labels up only when the backend offers it for that Model', () => {
    const catalogue = { svm: { name: 'Support Vector Machine', description: '', parameters: { C: { type: 'float' as const, default: 1, min: 0.001, max: 100 } } } }
    const advice = adviseFor(optionFor('classification', 'Telling apart documents that use similar words'), { labelCounts: { Granted: 90, Refused: 10 } }, { catalogue })
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

  it('keeps a preset within the range the backend allows', () => {
    const catalogue = { random_forest: { name: 'Random Forest', description: '', parameters: { n_estimators: { type: 'int' as const, default: 50, min: 1, max: 150 } } } }
    const advice = adviseFor(optionFor('classification', 'Getting as many results right as possible'), {}, { catalogue })
    expect(advice.parameters).toEqual({ n_estimators: 150 })
  })

  it('steers only to a Model the Dataset can use', () => {
    const best = optionFor('classification', 'The best results, even if training takes much longer')
    expect(adviseFor(best, { rowCount: 300 }, { available: ['logistic_regression', 'legalbert'] }).modelType).toBe('logistic_regression')
    expect(adviseFor(best, { rowCount: 300 }, { available: ['legalbert'] }).modelType).toBe('legalbert')
  })
})

describe('every guide recommendation', () => {
  const datasets: Record<string, DatasetFacts> = {
    'no facts': {},
    'tiny, two even labels': { rowCount: 4, labelCounts: { Granted: 2, Refused: 2 } },
    'small, two even labels': { rowCount: 200, labelCounts: { Granted: 100, Refused: 100 } },
    'large, two uneven labels': { rowCount: 20000, labelCounts: { Granted: 19000, Refused: 1000 } },
    'large, several uneven labels': { rowCount: 20000, labelCounts: { Lease: 15000, Loan: 4000, Tort: 1000 } },
  }
  const recommendations = Object.keys(modelsByTaskType).flatMap((task) =>
    Object.values(decisionTreeFor(task)?.nodes ?? {}).flatMap((node) => node.options)
      .filter((option) => option.recommend)
      .flatMap((option) => Object.entries(datasets).map(([name, facts]) => ({ task, option, name, facts }))),
  )

  it('passes the settings schema and rules the backend checks', () => {
    for (const { task, option, name, facts } of recommendations) {
      const where = `${task} / ${option.label} / ${name}`
      const { modelType, parameters } = adviseFor(option, facts, { available: modelsByTaskType[task] })
      expect(modelsByTaskType[task], where).toContain(modelType)
      const schema = parameterSchemas[modelType] ?? []
      for (const [key, value] of Object.entries(parameters)) {
        const field = schema.find((p) => p.key === key)
        expect(field, `${where}: ${key}`).toBeDefined()
        if (field!.type === 'select') expect(field!.options, `${where}: ${key}`).toContain(value)
        if (field!.type === 'boolean') expect(typeof value, `${where}: ${key}`).toBe('boolean')
        if (field!.type === 'number') {
          // Checked against core's own limits, not the package's copy of them.
          const limit = coreParameterLimits[modelType]?.[key]
          expect(typeof value, `${where}: ${key}`).toBe('number')
          expect(limit, `${where}: ${key} is a number core checks`).toBeDefined()
          expect(value as number, `${where}: ${key}`).toBeGreaterThanOrEqual(limit!.min)
          expect(value as number, `${where}: ${key}`).toBeLessThanOrEqual(limit!.max)
          if (limit!.atMostRows && facts.rowCount !== undefined) expect(value as number, `${where}: ${key}`).toBeLessThanOrEqual(facts.rowCount)
        }
      }
      const chosen = { ...Object.fromEntries(schema.map((p) => [p.key, p.default])), ...parameters }
      const multiclass = Object.keys(facts.labelCounts ?? {}).length > 2
      expect(reconcileChoices(schema, parameterRules[modelType] ?? [], chosen, multiclass), where).toEqual({})
      // The settings the answer names are applied as they are, so its reason still holds.
      if (modelType === option.recommend) expect(parameters, where).toMatchObject(option.settings?.parameters ?? {})
    }
  })

  it('weights rare labels up on an uneven Dataset, wherever the Model can', () => {
    for (const { option, name, facts } of recommendations.filter((r) => r.name.includes('uneven'))) {
      const { modelType, parameters } = adviseFor(option, facts)
      const canWeight = (parameterSchemas[modelType] ?? []).some((p) => p.key === 'class_weight')
      expect(parameters.class_weight, `${option.label} / ${name}`).toBe(canWeight ? 'balanced' : undefined)
    }
  })

  it('never offers a small Dataset a Model that needs a lot of documents', () => {
    for (const { task, option, facts } of recommendations.filter((r) => r.name.startsWith('small'))) {
      expect(['legalbert', 'roberta'], `${task} / ${option.label}`).not.toContain(adviseFor(option, facts, { available: modelsByTaskType[task] }).modelType)
    }
  })

  it('explains itself in one or two plain sentences', () => {
    const jargon = /tf-?idf|dendrogram|gpu|high-dimensional|bayes|\blda\b|\bnmf\b|probabilistic|calibrated|corpus|algorithm|transformer|density|ensemble|vector|feature|hierarch|baseline|pre-trained|class_weight|parameter/i
    for (const { task, option, name, facts } of recommendations) {
      const { why } = adviseFor(option, facts, { available: modelsByTaskType[task] })
      const where = `${task} / ${option.label} / ${name}`
      expect(why, where).toMatch(/^Recommended because /)
      expect(why.split(/(?<=\.) (?=[A-Z])/).length, `${where}: ${why}`).toBeLessThanOrEqual(2)
      expect(why, where).not.toMatch(jargon)
    }
  })
})
