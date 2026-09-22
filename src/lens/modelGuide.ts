export interface GuideOption {
  label: string
  next?: string
  recommend?: string
  note?: string
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

const CLASSIFICATION: DecisionTree = {
  root: 'priority',
  nodes: {
    priority: {
      question: 'What matters most for this task?',
      help: 'Pick the value you would trade accuracy for.',
      options: [
        { label: 'I must explain each decision', next: 'explain' },
        { label: 'Accuracy on complex cases', recommend: 'random_forest', note: 'Many weak rules averaged into a strong one.' },
        { label: 'Speed on a large corpus', recommend: 'naive_bayes', note: 'Fast to train and predict, surprisingly strong on text.' },
        { label: 'Precise boundaries in high-dimensional text', recommend: 'svm', note: 'Strong with TF-IDF features.' },
        { label: 'The best accuracy, GPU available', recommend: 'legalbert', note: 'Context-aware, but slower and heavier.' },
      ],
    },
    explain: {
      question: 'How should that explanation read?',
      options: [
        { label: 'As if/then rules a colleague can follow', recommend: 'decision_tree', note: 'Each prediction traces a visible path.' },
        { label: 'As a confidence score per class', recommend: 'logistic_regression', note: 'Returns calibrated probabilities.' },
      ],
    },
  },
}

const CLUSTERING: DecisionTree = {
  root: 'known',
  nodes: {
    known: {
      question: 'Do you know how many groups exist?',
      options: [
        { label: 'Yes, roughly', next: 'shape' },
        { label: 'No, let the data decide', next: 'outliers' },
      ],
    },
    shape: {
      question: 'Do you need nested structure to explore?',
      options: [
        { label: 'Yes, a hierarchy of topics', recommend: 'hierarchical', note: 'Build a dendrogram and cut it where you like.' },
        { label: 'No, flat groups are fine', recommend: 'kmeans', note: 'Simple, fast, and easy to read.' },
      ],
    },
    outliers: {
      question: 'Should odd documents be flagged rather than grouped?',
      options: [
        { label: 'Yes, surface the outliers', recommend: 'dbscan', note: 'Finds clusters of any shape and marks noise.' },
        { label: 'No, group everything', recommend: 'hierarchical', note: 'Every document joins the tree.' },
      ],
    },
  },
}

const TOPIC: DecisionTree = {
  root: 'sharpen',
  nodes: {
    sharpen: {
      question: 'Do you want sharper, more distinct topics?',
      options: [
        { label: 'Yes, clean boundaries', recommend: 'nmf', note: 'Parts-based topics, often crisper than LDA.' },
        { label: 'No, a probabilistic topic mix', recommend: 'lda', note: 'Interprets each document as a blend of topics.' },
      ],
    },
  },
}

const TRANSFORMER: DecisionTree = {
  root: 'domain',
  nodes: {
    domain: {
      question: 'Is the text legal-domain specific?',
      options: [
        { label: 'Yes, strongly legal', recommend: 'legalbert', note: 'Pre-trained on legal corpora.' },
        { label: 'No, general text', recommend: 'roberta', note: 'Strong general-purpose baseline.' },
      ],
    },
  },
}

export function decisionTreeFor(taskType: string): DecisionTree | null {
  if (['classification', 'document_classification', 'judgment_prediction'].includes(taskType)) return CLASSIFICATION
  if (taskType === 'clustering') return CLUSTERING
  if (taskType === 'topic_modeling') return TOPIC
  if (['ner', 'named_entity_recognition', 'summarization'].includes(taskType)) return TRANSFORMER
  return null
}
