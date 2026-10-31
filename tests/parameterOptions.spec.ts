import { describe, expect, it } from 'vitest'
import { allowedOptions, mergeSchema, reconcileChoices } from '../src/components/parameterOptions'
import { parameterRules, parameterSchemas } from '../src/components/modelCatalogData'
import type { ModelTypeInfo, ParameterRule } from '../src/types'

const rules: ParameterRule[] = [
  { when: { penalty: 'l1' }, parameter: 'solver', options: ['liblinear', 'saga'], reason: 'The l1 penalty needs the liblinear or saga solver.' },
  { when: { penalty: 'elasticnet' }, parameter: 'solver', options: ['saga'], reason: 'The elasticnet penalty needs the saga solver.' },
  { when: { multiclass: true }, parameter: 'solver', options: ['lbfgs', 'saga'], reason: 'The liblinear solver handles two labels only.' },
]
const solver = { key: 'solver', label: 'Solver', shortDesc: '', type: 'select' as const, default: 'lbfgs', options: ['lbfgs', 'liblinear', 'saga'], explanation: '', recommendation: '' }

describe('mergeSchema', () => {
  const backend: ModelTypeInfo = {
    name: 'Logistic Regression',
    description: '',
    parameters: {
      C: { type: 'float', min: 0.5, max: 9, default: 2, description: 'Strength' },
      penalty: { type: 'select', options: ['l2'], default: 'l2', description: 'Penalty' },
      brand_new: { type: 'int', min: 1, max: 3, default: 2, description: 'A setting from the backend' },
    },
  }

  it('takes options, ranges and defaults from the backend and keeps the explanations', () => {
    const merged = mergeSchema(parameterSchemas.logistic_regression, backend)
    const c = merged.find((f) => f.key === 'C')!

    expect([c.min, c.max, c.default]).toEqual([0.5, 9, 2])
    expect(c.label).toBe('Regularisation (C)')
    expect(merged.find((f) => f.key === 'penalty')!.options).toEqual(['l2'])
  })

  it('leaves out what the backend does not take', () => {
    expect(mergeSchema(parameterSchemas.logistic_regression, backend).map((f) => f.key)).not.toContain('solver')
  })

  it('shows a setting only the backend knows, in its own words', () => {
    const field = mergeSchema(parameterSchemas.logistic_regression, backend).find((f) => f.key === 'brand_new')!

    expect(field).toMatchObject({ label: 'A setting from the backend', type: 'number', default: 2, min: 1, max: 3 })
  })

  it('falls back to the package data without a backend answer', () => {
    expect(mergeSchema(parameterSchemas.svm, undefined)).toBe(parameterSchemas.svm)
    expect(mergeSchema(parameterSchemas.svm, {} as ModelTypeInfo)).toBe(parameterSchemas.svm)
  })

  it('caps a count at the rows of the Dataset', () => {
    const clusters: ModelTypeInfo = {
      name: 'K-Means',
      description: '',
      parameters: { n_clusters: { type: 'int', min: 2, max: 20, default: 8, at_most_rows: true, description: 'Number of clusters' } },
    }

    expect(mergeSchema(parameterSchemas.kmeans, clusters, 6)[0]).toMatchObject({ max: 6, default: 6 })
    expect(mergeSchema(parameterSchemas.kmeans, clusters, 100)[0]).toMatchObject({ max: 20, default: 8 })
  })
})

describe('allowedOptions', () => {
  it('offers everything while no rule applies', () => {
    expect(allowedOptions(solver, rules, { penalty: 'l2' }, false)).toEqual({ options: ['lbfgs', 'liblinear', 'saga'], reasons: [] })
  })

  it('narrows to what the chosen option allows and says why', () => {
    expect(allowedOptions(solver, rules, { penalty: 'elasticnet' }, false)).toEqual({
      options: ['saga'],
      reasons: ['The elasticnet penalty needs the saga solver.'],
    })
  })

  it('takes liblinear away when the Dataset has more than two labels', () => {
    expect(allowedOptions(solver, rules, { penalty: 'l2' }, true).options).toEqual(['lbfgs', 'saga'])
  })

  it('applies a penalty rule and the label rule together', () => {
    expect(allowedOptions(solver, rules, { penalty: 'l1' }, true).options).toEqual(['saga'])
  })
})

describe('reconcileChoices', () => {
  it('moves a choice that is no longer allowed and says what happened', () => {
    const parameters = { penalty: 'elasticnet', solver: 'lbfgs' }

    expect(reconcileChoices([solver], rules, parameters, false)).toEqual({
      solver: 'Solver changed to saga. The elasticnet penalty needs the saga solver.',
    })
    expect(parameters.solver).toBe('saga')
  })

  it('leaves an allowed choice alone', () => {
    const parameters = { penalty: 'l1', solver: 'liblinear' }

    expect(reconcileChoices([solver], rules, parameters, false)).toEqual({})
    expect(parameters.solver).toBe('liblinear')
  })

  it('prefers the default when it is allowed', () => {
    const parameters = { penalty: 'l2', solver: 'liblinear' }

    reconcileChoices([solver], rules, parameters, true)

    expect(parameters.solver).toBe('lbfgs')
  })
})

describe('the data the wizard falls back on', () => {
  it('offers no solver or penalty the core refuses', () => {
    const fields = parameterSchemas.logistic_regression

    expect(fields.find((f) => f.key === 'solver')!.options).toEqual(['lbfgs', 'newton-cg', 'liblinear', 'sag', 'saga'])
    expect(fields.find((f) => f.key === 'penalty')!.options).toEqual(['l2', 'l1', 'elasticnet', 'none'])
  })

  it('has the dependent options the core has', () => {
    const when = (type: string) => parameterRules[type].map((rule) => rule.when)

    expect(when('logistic_regression')).toEqual([{ penalty: 'l1' }, { penalty: 'elasticnet' }, { penalty: 'none' }, { multiclass: true }])
    expect(when('hierarchical')).toEqual([{ linkage: 'ward' }])
  })

  it('explains every option it offers', () => {
    for (const fields of Object.values(parameterSchemas)) {
      for (const field of fields) {
        if (!field.optionsExplained) continue
        expect(field.optionsExplained.map((o) => o.value).sort()).toEqual([...field.options!].sort())
      }
    }
  })

  it('speaks UK English', () => {
    expect(JSON.stringify(parameterSchemas)).not.toMatch(/penalizes|optimization|initialization|factorization|minimizes|generalize|centers/i)
  })
})
