// Ported verbatim from the app's original models/create/+page.svelte —
// plain data, framework-agnostic.

import type { ParameterRule } from '../types'

export const modelsByTaskType: Record<string, string[]> = {
  classification: ['decision_tree', 'logistic_regression', 'naive_bayes', 'random_forest', 'svm', 'legalbert', 'roberta'],
  document_classification: ['decision_tree', 'logistic_regression', 'naive_bayes', 'random_forest', 'svm', 'legalbert', 'roberta'],
  judgment_prediction: ['decision_tree', 'logistic_regression', 'naive_bayes', 'random_forest', 'svm', 'legalbert', 'roberta'],
  clustering: ['kmeans', 'hierarchical', 'dbscan'],
  topic_modeling: ['lda', 'nmf'],
  ner: ['legalbert', 'roberta'],
  named_entity_recognition: ['legalbert', 'roberta'],
  summarization: ['legalbert', 'roberta'],
}

/** The model a no-code user starts from: Logistic Regression where it applies,
 * else the first model the catalogue lists for the task. */
export function defaultModelFor(available: string[]): string {
  return available.includes('logistic_regression') ? 'logistic_regression' : (available[0] ?? '')
}

export const quickGuides: Record<string, Array<{ q: string; a: string }>> = {
  classification: [
    { q: 'Need explainability?', a: 'Decision Tree or Logistic Regression' },
    { q: 'Large text corpus?', a: 'Naive Bayes (fast) or SVM (accurate)' },
    { q: 'Complex multi-factor analysis?', a: 'Random Forest' },
    { q: 'Similar document comparison?', a: 'SVM' },
  ],
  clustering: [
    { q: 'Known number of clusters?', a: 'K-Means or Hierarchical' },
    { q: 'Unknown cluster count?', a: 'DBSCAN' },
    { q: 'Need cluster hierarchy?', a: 'Hierarchical Clustering' },
  ],
  topic_modeling: [
    { q: 'Standard topic discovery?', a: 'LDA' },
    { q: 'Sharper topic boundaries?', a: 'NMF' },
  ],
  transformers: [
    { q: 'Legal domain NER or classification?', a: 'LegalBERT (recommended)' },
    { q: 'General-purpose transformer?', a: 'RoBERTa' },
  ],
}

export interface ModelInfo {
  label: string
  shortDesc: string
  whenToUse: string
  example: string
  strengths: string[]
  bestFor: string
}

export const allModelInfo: Record<string, ModelInfo> = {
  decision_tree: {
    label: 'Decision Tree',
    shortDesc: 'Tree-based classification with interpretable rules',
    whenToUse: 'Select this if you want to see clear reasoning behind each prediction',
    example: '"Why is this case classified as relevant? Based on jurisdiction, issue type, and year."',
    strengths: ['Highly interpretable — shows the decision path', 'Easy to explain to non-technical stakeholders', 'Works well with categorical features'],
    bestFor: 'Legal research categorisation, case relevance filtering, regulatory compliance checks',
  },
  logistic_regression: {
    label: 'Logistic Regression',
    shortDesc: 'Linear classification with probabilistic output',
    whenToUse: 'Best when you need probability scores and a fast, reliable baseline',
    example: '"This contract has a 92% probability of being a lease agreement."',
    strengths: ['Returns confidence scores (0–100%)', 'Fast to train and predict', 'Works well on linearly separable legal text'],
    bestFor: 'Document type classification, binary legal outcomes, quick baselines',
  },
  naive_bayes: {
    label: 'Naive Bayes',
    shortDesc: 'Probabilistic classifier based on Bayes theorem',
    whenToUse: 'Best for large datasets where speed matters more than maximum accuracy',
    example: '"Classify thousands of court filings by category in seconds."',
    strengths: ['Extremely fast to train', 'Works well even with small datasets', 'Handles high-dimensional text well'],
    bestFor: 'Document triage, high-volume classification, spam/non-spam filtering',
  },
  random_forest: {
    label: 'Random Forest',
    shortDesc: 'Ensemble of decision trees for robust classification',
    whenToUse: 'Best when accuracy is the priority and you have enough data',
    example: '"Analyse jurisdiction, precedent, and issue type together to predict outcomes."',
    strengths: ['High accuracy on complex datasets', 'Resistant to overfitting', 'Handles many features naturally'],
    bestFor: 'Judgment prediction, multi-factor legal analysis, complex document classification',
  },
  svm: {
    label: 'Support Vector Machine',
    shortDesc: 'Linear and non-linear classification using support vectors',
    whenToUse: 'Best for text classification with high-dimensional TF-IDF features',
    example: '"Find the boundary between contracts and non-contracts in a large document set."',
    strengths: ['Excellent with TF-IDF text features', 'Handles high-dimensional data well', 'Strong performance on legal text'],
    bestFor: 'Document classification, similarity-based categorisation, binary legal tasks',
  },
  kmeans: {
    label: 'K-Means Clustering',
    shortDesc: 'Partition documents into K groups by similarity',
    whenToUse: 'Best when you know roughly how many groups exist in your data',
    example: '"Group 1000 contracts into 5 clusters by topic automatically."',
    strengths: ['Fast and scalable', 'Simple to understand and configure', 'Works well when clusters are roughly equal-sized'],
    bestFor: 'Document discovery, topic grouping, dataset exploration',
  },
  hierarchical: {
    label: 'Hierarchical Clustering',
    shortDesc: 'Build a tree of nested clusters by linkage',
    whenToUse: 'Best when you want to explore structure at multiple levels of granularity',
    example: '"Group cases by broad area of law, then subdivide by specific issue."',
    strengths: ['No need to specify cluster count upfront', 'Produces a hierarchy for exploration', 'Multiple linkage strategies'],
    bestFor: 'Legal taxonomy building, exploratory document analysis',
  },
  dbscan: {
    label: 'DBSCAN',
    shortDesc: 'Density-based clustering; finds outliers automatically',
    whenToUse: 'Best when cluster count is unknown and you want to identify outlier documents',
    example: '"Find unusual contracts that don\'t fit any standard category."',
    strengths: ['Automatically finds number of clusters', 'Identifies outliers/noise documents', 'Handles irregular cluster shapes'],
    bestFor: 'Anomaly detection in legal documents, outlier contract identification',
  },
  lda: {
    label: 'LDA (Topic Modelling)',
    shortDesc: 'Latent Dirichlet Allocation for topic discovery',
    whenToUse: 'Best for discovering hidden topics across a large collection of documents',
    example: '"Find the 10 main topics discussed across 5000 court opinions."',
    strengths: ['Unsupervised — no labels needed', 'Interpretable topic-word distributions', 'Probabilistic framework'],
    bestFor: 'Case law topic discovery, legal corpus analysis, document grouping by theme',
  },
  nmf: {
    label: 'NMF (Topic Modelling)',
    shortDesc: 'Non-negative Matrix Factorisation for topics',
    whenToUse: 'Best when you want cleaner, more distinct topics than LDA',
    example: '"Extract the dominant themes from a legislative corpus."',
    strengths: ['Often produces sharper topic boundaries than LDA', 'Faster convergence', 'Parts-based representation'],
    bestFor: 'Legislative text analysis, contract clause extraction, legal theme identification',
  },
  legalbert: {
    label: 'LegalBERT',
    shortDesc: 'Pre-trained transformer fine-tuned on legal text',
    whenToUse: 'Best when accuracy is critical and you have GPU resources available',
    example: '"Fine-tune on case law to achieve state-of-the-art judgment prediction."',
    strengths: ['Pre-trained on legal corpora', 'Understands legal language nuances', 'Best accuracy for legal NLP tasks'],
    bestFor: 'High-stakes legal classification, NER in legal text, judgment prediction',
  },
  roberta: {
    label: 'RoBERTa',
    shortDesc: 'Robustly optimised BERT for general text',
    whenToUse: 'Best as a strong general-purpose baseline when LegalBERT is unavailable',
    example: '"Classify legal documents with a strong general-purpose language model."',
    strengths: ['State-of-the-art general NLP performance', 'Robust training procedure', 'Strong zero-shot capability'],
    bestFor: 'General legal text tasks, cross-domain transfer, when labelled data is limited',
  },
}

export interface ParameterFieldSchema {
  key: string
  label: string
  shortDesc: string
  type: 'number' | 'select' | 'boolean'
  default: unknown
  step?: number
  min?: number
  max?: number
  options?: string[]
  explanation: string
  optionsExplained?: Array<{ value: string; desc: string }>
  recommendation: string
  /** Shown only while these values are chosen; the setting has no effect otherwise. */
  showWhen?: Record<string, unknown>
}

const CLASS_WEIGHT: ParameterFieldSchema = { key: 'class_weight', label: 'Balance Labels', shortDesc: 'Give rare labels more weight in training', type: 'select', default: 'none', options: ['none', 'balanced'], explanation: 'When one label is much rarer than the others, the model can do well by mostly ignoring it. Balancing counts each example of a rare label for more.', optionsExplained: [{ value: 'none', desc: 'Every document counts the same.' }, { value: 'balanced', desc: 'Rare labels count for more, and the confidence shown is not calibrated.' }], recommendation: 'Use "balanced" if the rare label is the one you care about.' }
const MAX_LENGTH: ParameterFieldSchema = { key: 'max_length', label: 'Maximum Document Length', shortDesc: 'How much of each document the model reads', type: 'number', default: 256, step: 32, min: 128, max: 512, explanation: 'Longer documents are cut off at this length. Longer limits read more but train more slowly.', recommendation: '256 suits most documents. Use 512 for long judgments if training time allows.' }

export const parameterSchemas: Record<string, ParameterFieldSchema[]> = {
  svm: [
    { key: 'C', label: 'Regularisation (C)', shortDesc: 'Controls how strictly the model fits training data', type: 'number', default: 1.0, step: 0.1, min: 0.001, max: 100, explanation: 'A higher C tries to classify all training examples correctly but may overfit. A lower C allows more misclassifications for a smoother boundary.', recommendation: 'Start with 1.0. If overfitting, try 0.1 or 0.01.' },
    { key: 'kernel', label: 'Kernel', shortDesc: 'Mathematical function that transforms data for classification', type: 'select', default: 'rbf', options: ['rbf', 'linear', 'poly', 'sigmoid'], explanation: 'The kernel determines how the decision boundary is drawn in the feature space.', optionsExplained: [{ value: 'rbf', desc: 'Handles non-linear data well. Most commonly used.' }, { value: 'linear', desc: 'Best for linearly separable text data. Faster.' }, { value: 'poly', desc: 'Polynomial boundaries. Rarely needed for text.' }, { value: 'sigmoid', desc: 'Similar to neural network activation. Less common.' }], recommendation: 'Start with "rbf". Use "linear" if training is slow.' },
    { key: 'gamma', label: 'Gamma', shortDesc: 'Influence radius of each training sample', type: 'select', default: 'scale', options: ['scale', 'auto'], explanation: 'Controls how far the influence of a single training example reaches. Low gamma = far reach, high gamma = close reach.', optionsExplained: [{ value: 'scale', desc: 'Automatically scales with number of features. Recommended.' }, { value: 'auto', desc: 'Uses 1/n_features. Older default.' }], recommendation: 'Use "scale" (default).' },
    { key: 'degree', label: 'Degree', shortDesc: 'Polynomial degree — only applies when kernel is "poly"', type: 'number', default: 3, step: 1, min: 1, max: 10, explanation: 'Only relevant when kernel="poly". Higher degree = more complex decision boundary.', recommendation: 'Ignore unless using poly kernel.' },
    CLASS_WEIGHT,
  ],
  decision_tree: [
    { key: 'criterion', label: 'Split Criterion', shortDesc: 'How the tree decides the best split at each node', type: 'select', default: 'gini', options: ['gini', 'entropy'], explanation: 'Mathematical method to decide the best questions to ask at each branch of the tree.', optionsExplained: [{ value: 'gini', desc: 'Measures impurity. Fast and works well in most cases.' }, { value: 'entropy', desc: 'Information-theory based. May give slightly different trees.' }], recommendation: 'Both perform similarly. "gini" is faster.' },
    { key: 'max_depth', label: 'Maximum Tree Depth', shortDesc: 'How deep the tree is allowed to grow', type: 'number', default: null, step: 1, min: 1, explanation: 'Limits how deep the tree can grow. Deeper trees = more complex rules, higher risk of overfitting.', recommendation: 'Start with 10. Reduce to 5–6 if accuracy on new data is poor. Leave empty for unlimited depth.' },
    { key: 'min_samples_leaf', label: 'Min Samples per Category', shortDesc: 'Minimum samples that must end up in each leaf', type: 'number', default: 1, step: 1, min: 1, explanation: 'Each leaf node must have at least this many samples. Higher values smooth the model and reduce overfitting.', recommendation: '1 works for most cases. Increase to 3–5 on noisy datasets.' },
    { key: 'min_samples_split', label: 'Min Samples to Split', shortDesc: 'Minimum samples needed before splitting a node', type: 'number', default: 2, step: 1, min: 2, explanation: 'A node must have at least this many samples to be eligible for splitting. Higher = simpler tree.', recommendation: 'Keep at 2 for small datasets.' },
    CLASS_WEIGHT,
  ],
  random_forest: [
    { key: 'n_estimators', label: 'Number of Trees', shortDesc: 'How many decision trees to build in the forest', type: 'number', default: 100, step: 10, min: 1, max: 1000, explanation: 'More trees = better accuracy but slower training. The forest votes across all trees for the final prediction.', recommendation: '100 is a good default. Increase to 200–300 for harder problems.' },
    { key: 'max_depth', label: 'Maximum Tree Depth', shortDesc: 'Maximum depth of each individual tree', type: 'number', default: null, step: 1, min: 1, explanation: 'Limits depth of each tree in the forest. In an ensemble, shallower trees often generalise better.', recommendation: 'Leave empty to let trees grow fully. Set to 10–15 if training is slow.' },
    { key: 'min_samples_split', label: 'Min Samples to Split', shortDesc: 'Minimum samples to split a node', type: 'number', default: 2, step: 1, min: 2, explanation: 'Minimum samples required before a node can be split. Higher = simpler trees.', recommendation: '2 works for most cases.' },
    { key: 'min_samples_leaf', label: 'Min Samples per Leaf', shortDesc: 'Minimum samples in each leaf node', type: 'number', default: 1, step: 1, min: 1, explanation: 'Ensures each leaf has enough samples to be reliable. Higher values reduce variance.', recommendation: '1 works for most cases.' },
    CLASS_WEIGHT,
  ],
  naive_bayes: [
    { key: 'alpha', label: 'Alpha (Smoothing)', shortDesc: 'Prevents zero-probability for unseen words', type: 'number', default: 1.0, step: 0.1, min: 0.01, max: 10, explanation: 'Prevents the model from assigning zero probability to words not seen during training. Value of 1.0 = Laplace smoothing.', recommendation: '1.0 (Laplace smoothing) works well. Try 0.1 for less smoothing on large vocabularies.' },
    { key: 'fit_prior', label: 'Learn Class Probabilities', shortDesc: 'Whether to learn class prior probabilities from data', type: 'boolean', default: true, explanation: 'If true, learns the probability of each class from the training data. If false, assumes all classes are equally likely.', recommendation: 'Keep as true unless classes are perfectly balanced.' },
  ],
  logistic_regression: [
    { key: 'C', label: 'Regularisation (C)', shortDesc: 'Inverse of regularisation strength — smaller = stronger regularisation', type: 'number', default: 1.0, step: 0.1, min: 0.001, explanation: 'Smaller C = stronger regularisation = simpler model. Larger C = model fits training data more closely.', recommendation: 'Start with 1.0. Try 0.1 if the model is overfitting.' },
    { key: 'penalty', label: 'Penalty', shortDesc: 'Type of regularisation applied to the model', type: 'select', default: 'l2', options: ['l2', 'l1', 'elasticnet', 'none'], explanation: 'Regularisation penalises large coefficient values to prevent overfitting. Some penalties work only with certain solvers, so the Solver list below follows your choice here.', optionsExplained: [{ value: 'l2', desc: 'Ridge. Shrinks all coefficients. Works for most cases, with any solver.' }, { value: 'l1', desc: 'Lasso. Keeps only the words that matter most. Needs the liblinear or saga solver.' }, { value: 'elasticnet', desc: 'A mix of l1 and l2. Needs the saga solver.' }, { value: 'none', desc: 'No regularisation, so the Regularisation (C) setting has no effect. Risks memorising the training data. Cannot use the liblinear solver.' }], recommendation: '"l2" is the best default for legal text classification.' },
    { key: 'solver', label: 'Solver', shortDesc: 'The method used to find the best model', type: 'select', default: 'lbfgs', options: ['lbfgs', 'newton-cg', 'liblinear', 'sag', 'saga'], explanation: 'The method used internally to find the best model. Which ones are available depends on the Penalty you chose and on how many labels your Dataset has.', optionsExplained: [{ value: 'lbfgs', desc: 'A good general choice for small and medium Datasets.' }, { value: 'newton-cg', desc: 'Similar to lbfgs. Works with the l2 penalty or none.' }, { value: 'liblinear', desc: 'Efficient on small Datasets with exactly two labels. Works with l1 and l2.' }, { value: 'sag', desc: 'Fast on large Datasets. Works with the l2 penalty or none.' }, { value: 'saga', desc: 'Fast on large Datasets. Works with every penalty.' }], recommendation: '"lbfgs" for most cases. Use "saga" for l1 or elasticnet.' },
    { key: 'l1_ratio', label: 'Elasticnet Mix', shortDesc: 'Share of l1 in the elasticnet penalty', type: 'number', default: 0.5, step: 0.1, min: 0, max: 1, showWhen: { penalty: 'elasticnet' }, explanation: '0 behaves like l2, 1 behaves like l1, and values between mix the two.', recommendation: 'Keep at 0.5 unless you have a reason to change it.' },
    CLASS_WEIGHT,
  ],
  kmeans: [
    { key: 'n_clusters', label: 'Number of Clusters', shortDesc: 'How many groups to partition documents into', type: 'number', default: 8, step: 1, min: 2, explanation: 'The number of distinct groups to find. Choose based on domain knowledge or try multiple values.', recommendation: 'Start with a number reflecting your expected categories. Try 5–10.' },
    { key: 'init', label: 'Initialisation Method', shortDesc: 'How initial cluster centres are placed', type: 'select', default: 'k-means++', options: ['k-means++', 'random'], explanation: 'Controls how the initial cluster centres are placed, which affects convergence speed and quality.', optionsExplained: [{ value: 'k-means++', desc: 'Smart initialisation. Faster convergence, better results.' }, { value: 'random', desc: 'Random placement. Faster but less reliable.' }], recommendation: '"k-means++" almost always produces better results.' },
    { key: 'max_iter', label: 'Max Iterations', shortDesc: 'Maximum iterations before stopping', type: 'number', default: 300, step: 50, min: 10, explanation: 'Maximum number of iterations of the k-means algorithm for a single run.', recommendation: '300 is sufficient for most datasets.' },
    { key: 'random_state', label: 'Random Seed', shortDesc: 'Seed for reproducible results', type: 'number', default: 42, step: 1, min: 0, explanation: 'Setting this ensures the same clusters are found every run. Change it to try different initialisations.', recommendation: 'Keep at 42 for reproducible results.' },
  ],
  hierarchical: [
    { key: 'n_clusters', label: 'Number of Clusters', shortDesc: 'Where to cut the cluster hierarchy', type: 'number', default: 8, step: 1, min: 2, explanation: 'Cuts the dendrogram to produce this many clusters. The hierarchy is built bottom-up regardless.', recommendation: 'Start with your expected number of categories.' },
    { key: 'linkage', label: 'Linkage Method', shortDesc: 'How distance between clusters is measured when merging', type: 'select', default: 'ward', options: ['ward', 'complete', 'average', 'single'], explanation: 'Determines how two clusters are compared when deciding whether to merge them.', optionsExplained: [{ value: 'ward', desc: 'Minimises variance within clusters. Best for compact clusters.' }, { value: 'complete', desc: 'Uses maximum distance. Tends to produce similar-sized clusters.' }, { value: 'average', desc: 'Uses average distance. A balanced approach.' }, { value: 'single', desc: 'Uses minimum distance. Can create chain-like clusters.' }], recommendation: '"ward" produces the most compact, well-separated clusters.' },
    { key: 'affinity', label: 'Affinity (Distance Metric)', shortDesc: 'How similarity between documents is measured', type: 'select', default: 'euclidean', options: ['euclidean', 'l1', 'l2', 'manhattan', 'cosine'], explanation: 'The distance metric used when calculating similarity between documents. Ward linkage works only with euclidean or l2, so this list follows your Linkage choice.', optionsExplained: [{ value: 'euclidean', desc: 'Standard geometric distance. Works with every linkage.' }, { value: 'l2', desc: 'The same distance as euclidean. Works with every linkage.' }, { value: 'cosine', desc: 'Compares the angle between documents, so length matters less. Often better for text. Not with ward linkage.' }, { value: 'manhattan', desc: 'Sum of absolute differences. More robust to outliers. Not with ward linkage.' }, { value: 'l1', desc: 'The same distance as manhattan. Not with ward linkage.' }], recommendation: '"euclidean" with ward linkage. Use "cosine" with average or complete linkage for text.' },
  ],
  dbscan: [
    { key: 'eps', label: 'Epsilon (Neighbourhood Size)', shortDesc: 'Maximum distance between two points to be considered neighbours', type: 'number', default: 0.5, step: 0.1, min: 0.01, explanation: 'Defines the neighbourhood radius. Points within eps of each other are considered part of the same cluster.', recommendation: 'Start with 0.5. Increase if too many noise points; decrease if clusters are too large.' },
    { key: 'min_samples', label: 'Min Cluster Size', shortDesc: 'Minimum points required to form a cluster', type: 'number', default: 5, step: 1, min: 1, explanation: 'A region must contain at least this many points to be considered a cluster. Smaller values = more, smaller clusters.', recommendation: 'Use 5 for medium datasets. Increase for larger datasets.' },
    { key: 'metric', label: 'Distance Metric', shortDesc: 'How document similarity is measured', type: 'select', default: 'euclidean', options: ['euclidean', 'cosine', 'manhattan'], explanation: 'The metric used when determining if two points are within epsilon of each other.', optionsExplained: [{ value: 'euclidean', desc: 'Standard geometric distance.' }, { value: 'cosine', desc: 'Angle-based. Often better for TF-IDF text vectors.' }, { value: 'manhattan', desc: 'Sum of absolute differences. More robust to outliers.' }], recommendation: '"cosine" usually works better for text document vectors.' },
  ],
  lda: [
    { key: 'n_components', label: 'Number of Topics', shortDesc: 'How many distinct topics to discover', type: 'number', default: 10, step: 1, min: 2, explanation: 'The number of distinct topics the model will find in the corpus. Each document is represented as a mix of these topics.', recommendation: 'Try 5–20 topics. More = more specific themes but harder to interpret.' },
    { key: 'max_iter', label: 'Max Iterations', shortDesc: 'Maximum training iterations', type: 'number', default: 100, step: 10, min: 10, explanation: 'Number of passes over the data during training. More = better convergence but slower.', recommendation: '100 is sufficient for most datasets.' },
    { key: 'learning_decay', label: 'Learning Decay', shortDesc: 'Controls the forgetting rate in online learning', type: 'number', default: 0.7, step: 0.1, min: 0.5, max: 1.0, explanation: 'Controls how quickly old data is forgotten during online updates. Must be between 0.5 and 1.0.', recommendation: '0.7 is a good default. Increase toward 1.0 for more stable learning.' },
    { key: 'random_state', label: 'Random Seed', shortDesc: 'Seed for reproducible topic discovery', type: 'number', default: 42, step: 1, min: 0, explanation: 'Ensures the same topics are discovered each run.', recommendation: 'Keep at 42.' },
  ],
  nmf: [
    { key: 'n_components', label: 'Number of Topics', shortDesc: 'How many topics to extract', type: 'number', default: 10, step: 1, min: 2, explanation: 'The number of distinct topics (components) to extract from the corpus.', recommendation: 'Try 5–15 topics. Start small and increase if themes seem too broad.' },
    { key: 'max_iter', label: 'Max Iterations', shortDesc: 'Maximum training iterations', type: 'number', default: 1000, step: 100, min: 100, explanation: 'Maximum number of iterations for NMF convergence.', recommendation: '1000 is usually sufficient.' },
    { key: 'alpha', label: 'Alpha (Regularisation)', shortDesc: 'Regularisation strength', type: 'number', default: 0.0, step: 0.1, min: 0, explanation: 'Controls regularisation applied to the factorisation matrices. 0 = no regularisation.', recommendation: '0.0 is a good starting point.' },
    { key: 'random_state', label: 'Random Seed', shortDesc: 'Seed for reproducibility', type: 'number', default: 42, step: 1, min: 0, explanation: 'Ensures the same factorisation is found each run.', recommendation: 'Keep at 42.' },
  ],
  legalbert: [
    { key: 'model_name', label: 'Variant', shortDesc: 'Which LegalBERT model to start from', type: 'select', default: 'nlpaueb/legal-bert-base-uncased', options: ['nlpaueb/legal-bert-base-uncased'], explanation: 'The pre-trained model that training starts from.', recommendation: 'Keep the default.' },
    MAX_LENGTH,
    { key: 'learning_rate', label: 'Learning Rate', shortDesc: 'How fast the model adapts to your data', type: 'number', default: 2e-5, step: 1e-5, min: 1e-6, explanation: 'Controls how much model weights are updated per training step. Too high = unstable training. Too low = very slow convergence.', recommendation: '2e-5 is the standard for fine-tuning BERT models. Do not increase above 5e-5.' },
    { key: 'batch_size', label: 'Batch Size', shortDesc: 'Documents processed together per training step', type: 'number', default: 16, step: 4, min: 4, max: 32, explanation: 'Larger batches train faster but require more GPU memory. Smaller batches use less memory but are noisier.', recommendation: '16 for most GPUs. Use 8 if you run out of memory.' },
    { key: 'epochs', label: 'Training Epochs', shortDesc: 'How many times to train on the full dataset', type: 'number', default: 3, step: 1, min: 1, explanation: 'Number of complete passes through the training data. More epochs = more training but risk of overfitting.', recommendation: '3 epochs is the standard for BERT fine-tuning. Use 5 if accuracy is low.' },
  ],
  roberta: [
    { key: 'model_name', label: 'Model Size', shortDesc: 'Which RoBERTa model to start from', type: 'select', default: 'roberta-base', options: ['roberta-base', 'roberta-large'], explanation: 'The pre-trained model that training starts from. The large model needs more memory and time.', recommendation: 'Start with "roberta-base".' },
    MAX_LENGTH,
    { key: 'learning_rate', label: 'Learning Rate', shortDesc: 'How fast the model adapts to your data', type: 'number', default: 2e-5, step: 1e-5, min: 1e-6, explanation: 'Standard learning rate for RoBERTa fine-tuning. Determines the step size during gradient descent.', recommendation: '2e-5 is optimal for most legal text tasks.' },
    { key: 'batch_size', label: 'Batch Size', shortDesc: 'Documents processed per training step', type: 'number', default: 16, step: 4, min: 4, max: 32, explanation: 'Larger batches train faster but require more GPU memory.', recommendation: '16 is standard. Reduce to 8 if memory-constrained.' },
    { key: 'epochs', label: 'Training Epochs', shortDesc: 'Full passes over training data', type: 'number', default: 3, step: 1, min: 1, explanation: 'How many times the model sees the full training set.', recommendation: '3 is standard. Increase to 5 for small datasets.' },
  ],
}

/** The dependent options, for when the backend does not send its own. */
const ANY_PENALTY_BUT_LIBLINEAR = ['lbfgs', 'newton-cg', 'sag', 'saga']
export const parameterRules: Record<string, ParameterRule[]> = {
  logistic_regression: [
    { when: { penalty: 'l1' }, parameter: 'solver', options: ['liblinear', 'saga'], reason: 'The l1 penalty needs the liblinear or saga solver.' },
    { when: { penalty: 'elasticnet' }, parameter: 'solver', options: ['saga'], reason: 'The elasticnet penalty needs the saga solver.' },
    { when: { penalty: 'none' }, parameter: 'solver', options: ANY_PENALTY_BUT_LIBLINEAR, reason: 'Training with no penalty cannot use the liblinear solver.' },
    { when: { multiclass: true }, parameter: 'solver', options: ANY_PENALTY_BUT_LIBLINEAR, reason: 'The liblinear solver handles two labels only. Choose another solver for this Dataset.' },
  ],
  hierarchical: [
    { when: { linkage: 'ward' }, parameter: 'affinity', options: ['euclidean', 'l2'], reason: 'Ward linkage needs euclidean or l2 distance.' },
  ],
}

export function taskTypeLabel(taskType: string): string {
  const labels: Record<string, string> = {
    classification: 'text classification',
    document_classification: 'document classification',
    judgment_prediction: 'judgment prediction',
    clustering: 'clustering',
    topic_modeling: 'topic modelling',
    ner: 'named entity recognition',
    named_entity_recognition: 'named entity recognition',
    summarization: 'text summarisation',
  }
  return labels[taskType] || taskType
}

export function quickGuideFor(taskType: string): Array<{ q: string; a: string }> | null {
  if (['classification', 'document_classification', 'judgment_prediction'].includes(taskType)) return quickGuides.classification
  if (taskType === 'clustering') return quickGuides.clustering
  if (taskType === 'topic_modeling') return quickGuides.topic_modeling
  if (['ner', 'named_entity_recognition', 'summarization'].includes(taskType)) return quickGuides.transformers
  return null
}
