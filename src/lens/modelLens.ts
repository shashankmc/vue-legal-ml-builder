export type LensFamily = 'tree' | 'linear' | 'cluster' | 'topic' | 'transformer'

const FAMILY_BY_TYPE: Record<string, LensFamily> = {
  decision_tree: 'tree',
  random_forest: 'tree',
  logistic_regression: 'linear',
  naive_bayes: 'linear',
  svm: 'linear',
  kmeans: 'cluster',
  hierarchical: 'cluster',
  dbscan: 'cluster',
  lda: 'topic',
  nmf: 'topic',
  legalbert: 'transformer',
  roberta: 'transformer',
}

export function lensFamily(modelType: string): LensFamily {
  return FAMILY_BY_TYPE[modelType] ?? 'linear'
}

export const LENS_FAMILY_LABEL: Record<LensFamily, string> = {
  tree: 'Rule tree',
  linear: 'Decision boundary',
  cluster: 'Similarity map',
  topic: 'Topic mix',
  transformer: 'Contextual attention',
}

const CLASS_TOKENS = [
  'var(--vmlb-lens-class-a, #2563eb)',
  'var(--vmlb-lens-class-b, #d97706)',
  'var(--vmlb-lens-class-c, #059669)',
  'var(--vmlb-lens-class-d, #db2777)',
  'var(--vmlb-lens-class-e, #7c3aed)',
]

export function classColor(index: number): string {
  return CLASS_TOKENS[((index % CLASS_TOKENS.length) + CLASS_TOKENS.length) % CLASS_TOKENS.length]
}

export function defaultLabels(taskType: string, labels?: string[] | null): string[] {
  if (labels && labels.length) return labels.slice(0, 5)
  if (['clustering', 'topic_modeling'].includes(taskType)) return []
  return ['Category A', 'Category B']
}

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface LensPoint {
  x: number
  y: number
  cls: number
  outlier?: boolean
}

export function scatterPoints(seed: string, classCount: number, perClass = 9): LensPoint[] {
  const rand = mulberry32(hashSeed(seed))
  const count = Math.max(classCount, 1)
  const columns = count <= 2 ? count : Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / columns)
  const points: LensPoint[] = []
  for (let c = 0; c < count; c++) {
    const col = c % columns
    const row = Math.floor(c / columns)
    const cx = columns === 1 ? 0.5 : 0.2 + (col / (columns - 1 || 1)) * 0.6
    const cy = rows === 1 ? 0.5 : 0.22 + (row / (rows - 1 || 1)) * 0.56
    for (let i = 0; i < perClass; i++) {
      const angle = rand() * Math.PI * 2
      const radius = count === 1 ? rand() * 0.4 : rand() * 0.13
      points.push({
        x: Math.min(0.96, Math.max(0.04, cx + Math.cos(angle) * radius)),
        y: Math.min(0.94, Math.max(0.06, cy + Math.sin(angle) * radius * 0.85)),
        cls: c,
      })
    }
  }
  return points
}

export interface LensCopy {
  headline: string
  reading: string
  legend: Array<{ label: string; detail: string }>
}

function num(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function lensCopy(modelType: string, parameters: Record<string, unknown>, labels: string[]): LensCopy {
  const family = lensFamily(modelType)
  const a = labels[0] ?? 'class A'
  const b = labels[1] ?? 'class B'

  if (family === 'tree') {
    const depth = parameters.max_depth == null ? 5 : Math.min(5, Math.max(1, Math.round(num(parameters.max_depth, 5))))
    const trees = num(parameters.n_estimators, 1)
    const criterion = String(parameters.criterion ?? 'gini')
    if (modelType === 'random_forest') {
      return {
        headline: `${Math.round(trees)} trees vote on every document`,
        reading: `Each tree asks its own questions and casts one vote; the majority decides. More trees smooth out any single tree's mistakes. Shallow trees alone would underfit, but averaged across the forest the boundary holds.`,
        legend: [
          { label: 'One path', detail: `A document follows one branch per tree to a leaf verdict` },
          { label: 'Vote tally', detail: `Leaf verdicts summed across ${Math.round(trees)} trees` },
          { label: 'Depth cap', detail: `Each tree is limited to ${depth} level${depth === 1 ? '' : 's'}` },
        ],
      }
    }
    return {
      headline: `A chain of if/then questions, ${depth} level${depth === 1 ? '' : 's'} deep`,
      reading: `The tree asks the most separating question first, then splits again inside each answer. A document drops through the questions until it lands in a leaf, and the leaf's majority label is its verdict. Deeper trees carve finer rules — and fit noise more.`,
      legend: [
        { label: 'Split', detail: `Chosen by ${criterion} to separate the classes fastest` },
        { label: 'Lit path', detail: `The questions one document answers on its way down` },
        { label: 'Leaf', detail: `Where a document lands; its colour is the majority verdict` },
      ],
    }
  }

  if (family === 'cluster') {
    const k = num(parameters.n_clusters, 8)
    if (modelType === 'dbscan') {
      const eps = num(parameters.eps, 0.5)
      return {
        headline: `Dense neighbourhoods become clusters`,
        reading: `Documents within reach of enough neighbours join a cluster; documents in sparse space are flagged as noise rather than forced into a group. Nothing must be assigned — outliers stay outliers.`,
        legend: [
          { label: 'Dense core', detail: `Points with enough neighbours inside ε = ${eps}` },
          { label: 'Hollow point', detail: `Noise — too isolated to belong to any cluster` },
          { label: 'No cluster count', detail: `The data decides how many groups exist` },
        ],
      }
    }
    if (modelType === 'hierarchical') {
      return {
        headline: `A family tree of documents, cut where you choose`,
        reading: `Every document starts alone and the closest pairs merge upward. The dendrogram shows the whole structure; cutting it at ${Math.round(k)} groups gives the model's answer, and moving the cut reveals finer or coarser topics.`,
        legend: [
          { label: 'Merge', detail: `The two closest groups at that step join` },
          { label: 'Cut line', detail: `Your chosen level — ${Math.round(k)} groups` },
          { label: 'Linkage', detail: `How distance is measured when merging` },
        ],
      }
    }
    return {
      headline: `Documents pulled into ${Math.round(k)} similarity groups`,
      reading: `The model places ${Math.round(k)} centres, then assigns every document to the nearest one and nudges the centres until the groups settle. Each group is a topic the model found on its own — no labels required.`,
      legend: [
        { label: 'Centre', detail: `The average position of one group` },
        { label: 'Assignment', detail: `Each document belongs to its nearest centre` },
        { label: 'Group count', detail: `${Math.round(k)} groups — your choice, not the data's` },
      ],
    }
  }

  if (family === 'topic') {
    const topics = num(parameters.n_components, 10)
    return {
      headline: `${Math.round(topics)} topics, each a weighted mix of words`,
      reading: `Every document is read as a blend of ${Math.round(topics)} topics; every topic is a blend of words. The bars show which words define each topic, and the strip shows how strongly one document leans on each.`,
      legend: [
        { label: 'Topic', detail: `A recurring theme found across the corpus` },
        { label: 'Term weight', detail: `How strongly a word signals this topic` },
        { label: 'Document mix', detail: `One document's proportion of each topic` },
      ],
    }
  }

  if (family === 'transformer') {
    const epochs = num(parameters.epochs, 3)
    const lr = num(parameters.learning_rate, 2e-5)
    return {
      headline: `Every word read in the context of every other`,
      reading: `Rather than counting words, the model weighs each word against the rest of the sentence, so "not liable" and "liable" separate cleanly. ${Math.round(epochs)} passes over your data fine-tune those weights from a legal-language starting point.`,
      legend: [
        { label: 'Attention', detail: `How strongly each word attends to the others` },
        { label: 'Fine-tuning', detail: `${Math.round(epochs)} passes at learning rate ${lr}` },
        { label: 'Coarse curve', detail: `Only phase markers are logged, not per-step curves` },
      ],
    }
  }

  const c = num(parameters.C, 1)
  const kernel = String(parameters.kernel ?? 'linear')
  const curved = kernel === 'rbf' || kernel === 'poly' || kernel === 'sigmoid'
  const marginWord = c <= 0.25 ? 'wide and forgiving' : c >= 2 ? 'narrow and strict' : 'moderate'
  return {
    headline: `A boundary drawn between ${a} and ${b}`,
    reading: `The model looks for the line (or curve) that separates ${a} from ${b} with the widest possible gap. Documents near the boundary are the ones it is least sure about${modelType === 'naive_bayes' ? '; Naive Bayes instead weighs each word independently and multiplies the evidence' : ''}.`,
    legend: [
      { label: 'Boundary', detail: `${curved ? 'Curved' : 'Straight'} line the model would draw` },
      { label: 'Margin', detail: `${marginWord} gap, set by C = ${c}` },
      { label: 'Edge documents', detail: `Points nearest the line change the verdict most` },
    ],
  }
}
