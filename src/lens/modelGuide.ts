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
        { label: 'As rules a colleague can follow', recommend: 'decision_tree', note: 'Each result follows a path of yes-or-no questions that you can read.' },
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
