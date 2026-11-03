import { describe, expect, it } from 'vitest'
import { classColor, defaultLabels, lensCopy, lensFamily, scatterPoints } from '../src/lens/modelLens'
import { decisionTreeFor } from '../src/lens/modelGuide'
import type { DecisionTree } from '../src/lens/modelGuide'
import { modelsByTaskType } from '../src/components/modelCatalogData'

describe('lensFamily', () => {
  it('maps every catalog model type to a family', () => {
    expect(lensFamily('decision_tree')).toBe('tree')
    expect(lensFamily('random_forest')).toBe('tree')
    expect(lensFamily('svm')).toBe('linear')
    expect(lensFamily('logistic_regression')).toBe('linear')
    expect(lensFamily('naive_bayes')).toBe('linear')
    expect(lensFamily('kmeans')).toBe('cluster')
    expect(lensFamily('hierarchical')).toBe('cluster')
    expect(lensFamily('dbscan')).toBe('cluster')
    expect(lensFamily('lda')).toBe('topic')
    expect(lensFamily('nmf')).toBe('topic')
    expect(lensFamily('legalbert')).toBe('transformer')
    expect(lensFamily('roberta')).toBe('transformer')
  })

  it('falls back to linear for an unknown type', () => {
    expect(lensFamily('mystery')).toBe('linear')
  })
})

describe('defaultLabels', () => {
  it('uses dataset labels when present', () => {
    expect(defaultLabels('classification', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('returns no labels for unsupervised tasks', () => {
    expect(defaultLabels('clustering')).toEqual([])
    expect(defaultLabels('topic_modeling')).toEqual([])
  })

  it('falls back to two generic classes', () => {
    expect(defaultLabels('classification')).toEqual(['Category A', 'Category B'])
  })
})

describe('lensCopy', () => {
  it('reflects max_depth in the tree headline', () => {
    const copy = lensCopy('decision_tree', { max_depth: 2 }, ['A', 'B'])
    expect(copy.headline).toContain('2 levels')
    expect(copy.legend.some((l) => l.detail.includes('gini'))).toBe(true)
  })

  it('reflects n_estimators in the forest headline', () => {
    const copy = lensCopy('random_forest', { n_estimators: 200 }, ['A', 'B'])
    expect(copy.headline).toContain('200 trees')
  })

  it('reflects C in the linear margin legend', () => {
    const tight = lensCopy('svm', { C: 4 }, ['A', 'B'])
    expect(tight.legend.some((l) => l.detail.includes('narrow'))).toBe(true)
    const loose = lensCopy('svm', { C: 0.1 }, ['A', 'B'])
    expect(loose.legend.some((l) => l.detail.includes('wide'))).toBe(true)
  })

  it('names the topic count for topic models', () => {
    expect(lensCopy('lda', { n_components: 6 }, []).headline).toContain('6 topics')
  })

  it('states the coarse-curve caveat for transformers', () => {
    const copy = lensCopy('legalbert', { epochs: 3, learning_rate: 2e-5 }, ['A', 'B'])
    expect(copy.legend.some((l) => l.detail.includes('phase markers'))).toBe(true)
  })

  it('always returns a headline, reading and legend', () => {
    for (const type of ['decision_tree', 'svm', 'kmeans', 'lda', 'roberta']) {
      const copy = lensCopy(type, {}, ['A', 'B'])
      expect(copy.headline.length).toBeGreaterThan(0)
      expect(copy.reading.length).toBeGreaterThan(0)
      expect(copy.legend.length).toBeGreaterThan(0)
    }
  })
})

describe('scatterPoints', () => {
  it('is deterministic for the same seed', () => {
    expect(scatterPoints('seed', 2)).toEqual(scatterPoints('seed', 2))
  })

  it('produces perClass points for every class within bounds', () => {
    const points = scatterPoints('seed', 3, 5)
    expect(points).toHaveLength(15)
    expect(points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true)
    expect(new Set(points.map((p) => p.cls))).toEqual(new Set([0, 1, 2]))
  })
})

describe('classColor', () => {
  it('wraps around the palette', () => {
    expect(classColor(0)).toBe(classColor(5))
  })
})

describe('decisionTreeFor', () => {
  const leavesOf = (tree: DecisionTree): string[] =>
    Object.values(tree.nodes).flatMap((node) => node.options.flatMap((o) => (o.recommend ? [o.recommend] : [])))

  it('gives every task type that offers Models a guide whose root exists', () => {
    for (const [task, models] of Object.entries(modelsByTaskType)) {
      if (!models.length) continue
      const tree = decisionTreeFor(task)
      expect(tree, task).not.toBeNull()
      expect(tree!.nodes[tree!.root], task).toBeDefined()
    }
  })

  it('only recommends Models that the task type offers', () => {
    for (const task of Object.keys(modelsByTaskType)) {
      const tree = decisionTreeFor(task)
      if (!tree) continue
      for (const leaf of leavesOf(tree)) expect(modelsByTaskType[task], `${task} -> ${leaf}`).toContain(leaf)
    }
  })

  it('offers no Model, and no guide, for a task type the backend cannot train yet', () => {
    for (const task of ['ner', 'named_entity_recognition', 'summarization']) {
      expect(modelsByTaskType[task] ?? []).toEqual([])
      expect(decisionTreeFor(task)).toBeNull()
    }
  })

  it('asks and answers in plain words, with no algorithm terms or things a user cannot know', () => {
    const jargon = /tf-?idf|dendrogram|gpu|high-dimensional|bayes|\blda\b|\bnmf\b|probabilistic|calibrated|corpus|cluster|algorithm|transformer|density|ensemble|vector|feature|hierarch|baseline|pre-trained/i
    for (const task of Object.keys(modelsByTaskType)) {
      const tree = decisionTreeFor(task)
      if (!tree) continue
      for (const node of Object.values(tree.nodes)) {
        for (const text of [node.question, node.help, ...node.options.flatMap((o) => [o.label, o.note])]) {
          if (text) expect(text, task).not.toMatch(jargon)
        }
      }
    }
  })

  it('returns null for an unknown task', () => {
    expect(decisionTreeFor('regression')).toBeNull()
  })

  it('ends every branch of every guide in a recommendation', () => {
    for (const task of Object.keys(modelsByTaskType)) {
      const tree = decisionTreeFor(task)
      if (!tree) continue
      const walk = (id: string, seen: Set<string>): boolean => {
        if (seen.has(id)) return false
        const node = tree.nodes[id]
        if (!node) return false
        return node.options.every((o) => (o.recommend ? true : o.next ? walk(o.next, new Set([...seen, id])) : false))
      }
      expect(walk(tree.root, new Set()), task).toBe(true)
    }
  })
})
