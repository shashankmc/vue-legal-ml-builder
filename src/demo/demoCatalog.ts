import type { ModelCatalog } from '../types'

export const AVAILABLE_MODELS_DEMO: ModelCatalog = {
  classification: {
    svm: {
      name: 'Support Vector Machine',
      description: 'Linear and non-linear classification using support vectors',
      parameters: {
        kernel: { type: 'select', options: ['linear', 'rbf', 'poly', 'sigmoid'], default: 'rbf', description: 'Kernel type' },
        C: { type: 'float', min: 0.1, max: 100, default: 1.0, description: 'Regularization parameter' },
      },
    },
    naive_bayes: {
      name: 'Naive Bayes',
      description: 'Probabilistic classifier based on Bayes theorem',
      parameters: {
        alpha: { type: 'float', min: 0.1, max: 10, default: 1.0, description: 'Smoothing parameter' },
      },
    },
  },
}
