import { allModelInfo, parameterRules, parameterSchemas } from '../components/modelCatalogData'
import { mergeSchema, reconcileChoices } from '../components/parameterOptions'
import type { ModelTypeInfo } from '../types'

export interface GuideOption {
  label: string
  next?: string
  recommend?: string
  note?: string
  /** Settings that come with the recommendation, and why, as a clause that
   * completes "Recommended because …, and …". */
  settings?: { parameters: Record<string, unknown>; why: string }
}

export interface GuideNode {
  question: string
  help?: string
  options: GuideOption[]
}

export interface DecisionTree {
  root: string
  nodes: Record<string, GuideNode>
}

// Each question asks what the user wants to achieve, in words a no-code legal
// user knows. Each note says why the answer leads to its Model, and is shown
// again as the reason on the recommendation.
const CLASSIFICATION: DecisionTree = {
  root: 'priority',
  nodes: {
    priority: {
      question: 'What matters most to you?',
      help: 'There is no wrong answer. You can change the model before you train it.',
      options: [
        { label: 'Being able to explain each result', next: 'explain' },
        { label: 'Getting as many results right as possible', recommend: 'random_forest', note: 'It combines many simple rules, which tends to get more results right.' },
        { label: 'Quick results on a lot of documents', recommend: 'naive_bayes', note: 'It learns from thousands of documents in seconds.' },
        { label: 'Telling apart documents that use similar words', recommend: 'svm', note: 'It draws a sharp line between labels that look alike.' },
        { label: 'The best results, even if training takes much longer', recommend: 'legalbert', note: 'It reads each word in its context and has already read a lot of legal text, but training can take hours.' },
      ],
    },
    explain: {
      question: 'How would you like each result explained?',
      options: [
        { label: 'As rules a colleague can follow', recommend: 'decision_tree', note: 'Each result follows a path of yes-or-no questions that you can read.', settings: { parameters: { max_depth: 5 }, why: 'its tree stops after five questions, so each path stays short enough to follow' } },
        { label: 'As how strongly the text points to each label', recommend: 'logistic_regression', note: 'Each result shows which words pushed it towards each label.' },
      ],
    },
  },
}

const CLUSTERING: DecisionTree = {
  root: 'known',
  nodes: {
    known: {
      question: 'Do you already know roughly how many groups to expect?',
      options: [
        { label: 'Yes, roughly', next: 'nested' },
        { label: 'No, let the documents decide', next: 'outliers' },
      ],
    },
    nested: {
      question: 'Would you like to see smaller groups inside bigger ones?',
      options: [
        { label: 'Yes, groups within groups', recommend: 'hierarchical', note: 'It builds a family tree of groups, so you choose how broad or fine they are.' },
        { label: 'No, separate groups are enough', recommend: 'kmeans', note: 'It is quick, and its groups are easy to read.' },
      ],
    },
    outliers: {
      question: 'Should unusual documents be set aside rather than put in a group?',
      options: [
        { label: 'Yes, set them aside', recommend: 'dbscan', note: 'It finds groups of any size and lists the documents that fit none.' },
        { label: 'No, put every document in a group', recommend: 'hierarchical', note: 'Every document joins a group, and you choose how broad the groups are.' },
      ],
    },
  },
}

const TOPIC: DecisionTree = {
  root: 'mix',
  nodes: {
    mix: {
      question: 'Is each document mostly about one topic?',
      options: [
        { label: 'Yes, keep the topics distinct', recommend: 'nmf', note: 'Each topic gets its own clear set of words, so topics overlap less.' },
        { label: 'No, a document can cover several topics', recommend: 'lda', note: 'It shows each document as a mix of topics, such as mostly lease with some employment.' },
      ],
    },
  },
}

export function decisionTreeFor(taskType: string): DecisionTree | null {
  if (['classification', 'document_classification', 'judgment_prediction'].includes(taskType)) return CLASSIFICATION
  if (taskType === 'clustering') return CLUSTERING
  if (taskType === 'topic_modeling') return TOPIC
  return null
}

/** What the wizard knows about the Dataset, which can change the advice. */
export interface DatasetFacts {
  rowCount?: number
  /** How many documents carry each label, from the Dataset's overview. */
  labelCounts?: Record<string, number> | null
}

/** What the backend offers, when the host can say. */
export interface GuideContext {
  catalogue?: Record<string, ModelTypeInfo>
  /** The Models the Dataset can use. The guide steers only to one of these. */
  available?: string[]
}

/** What the guide recommends once an answer is reached: the Model, the settings
 * that come with it, and one or two plain sentences on why. */
export interface GuideAdvice {
  modelType: string
  parameters: Record<string, unknown>
  why: string
}

/** Fewer documents than this are too few for a Model that has read a lot of text
 * in advance to learn from. */
export const SMALL_DATASET_ROWS = 1000
// Models that need a lot of documents, and what to steer to instead, in order.
const NEEDS_MANY_DOCUMENTS = ['legalbert', 'roberta']
const FOR_FEWER_DOCUMENTS = ['random_forest', 'logistic_regression', 'svm', 'decision_tree', 'naive_bayes']

/** The most common label at least this many times the rarest counts as imbalanced. */
export const IMBALANCE_RATIO = 3

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const upperFirst = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function imbalanced(labelCounts?: Record<string, number> | null): boolean {
  const counts = Object.values(labelCounts ?? {}).filter((n) => n > 0)
  return counts.length > 1 && Math.max(...counts) >= IMBALANCE_RATIO * Math.min(...counts)
}

/** The Model and settings an answer leads to, fitted to the Dataset. The settings
 * go through the same schema and rules as the settings form, so the backend
 * accepts them: a setting the Model lacks is left out, a number is kept in range,
 * and a choice a rule forbids is moved as the form would move it. */
export function adviseFor(option: GuideOption, facts: DatasetFacts = {}, context: GuideContext = {}): GuideAdvice {
  const recommended = option.recommend ?? ''
  const small = facts.rowCount !== undefined && facts.rowCount < SMALL_DATASET_ROWS
  const instead = small && NEEDS_MANY_DOCUMENTS.includes(recommended)
    ? FOR_FEWER_DOCUMENTS.find((type) => context.available?.includes(type) ?? true)
    : undefined
  const modelType = instead ?? recommended
  const schema = mergeSchema(parameterSchemas[modelType] ?? [], context.catalogue?.[modelType], facts.rowCount)
  const has = (key: string) => schema.some((p) => p.key === key)
  const label = (type: string) => allModelInfo[type]?.label ?? type
  const reasons = [
    instead
      ? `Recommended because this Dataset has only ${facts.rowCount!.toLocaleString('en-GB')} documents, which is too few for ${label(recommended)} to learn from, and ${label(instead)} gets good results from fewer.`
      : option.note ? `Recommended because ${lowerFirst(option.note)}` : '',
  ]
  const preset: Record<string, unknown> = {}
  const clauses: string[] = []

  const settings = instead ? undefined : option.settings
  if (settings && Object.keys(settings.parameters).every(has)) {
    Object.assign(preset, settings.parameters)
    clauses.push(settings.why)
  }
  if (imbalanced(facts.labelCounts) && has('class_weight')) {
    preset.class_weight = 'balanced'
    clauses.push('rare labels count for more, because some labels in this Dataset are much rarer than others')
  }

  const chosen: Record<string, unknown> = Object.fromEntries(schema.map((p) => [p.key, p.default]))
  for (const [key, value] of Object.entries(preset)) {
    const field = schema.find((p) => p.key === key)!
    chosen[key] = typeof value === 'number'
      ? Math.min(Math.max(value, field.min ?? value), field.max ?? value)
      : value
  }
  const rules = context.catalogue?.[modelType]?.rules ?? parameterRules[modelType] ?? []
  const moved = reconcileChoices(schema, rules, chosen, Object.keys(facts.labelCounts ?? {}).length > 2)
  const parameters = Object.fromEntries(Object.keys({ ...preset, ...moved }).map((key) => [key, chosen[key]]))

  if (clauses.length) reasons.push(`${upperFirst(clauses.join(', and '))}.`)
  return { modelType, parameters, why: reasons.filter(Boolean).join(' ') }
}
