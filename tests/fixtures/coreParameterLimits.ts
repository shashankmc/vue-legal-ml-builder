// The numeric limits legal-ml-core refuses outside of, copied from AVAILABLE_MODELS
// in legal-ml-core src/legal_ml_core/routes/models.py (Phase 2c branch, 7f8fe54). parameter_refusal
// reads min and max, and at_most_rows also caps a setting at the Dataset's rows.
// Update this with core: a guide preset or mirror that passes here is one core accepts.
export interface CoreLimit { min: number; max: number; atMostRows?: true }

export const coreParameterLimits: Record<string, Record<string, CoreLimit>> = {
  svm: { C: { min: 0.001, max: 100 }, degree: { min: 1, max: 10 } },
  decision_tree: { max_depth: { min: 1, max: 50 }, min_samples_split: { min: 2, max: 100 }, min_samples_leaf: { min: 1, max: 50 } },
  random_forest: { n_estimators: { min: 1, max: 1000 }, max_depth: { min: 1, max: 50 }, min_samples_split: { min: 2, max: 100 }, min_samples_leaf: { min: 1, max: 50 } },
  naive_bayes: { alpha: { min: 0.01, max: 10 } },
  logistic_regression: { C: { min: 0.001, max: 100 }, l1_ratio: { min: 0, max: 1 } },
  kmeans: { n_clusters: { min: 2, max: 20, atMostRows: true }, max_iter: { min: 10, max: 1000 }, random_state: { min: 0, max: 1000 } },
  hierarchical: { n_clusters: { min: 2, max: 20, atMostRows: true } },
  dbscan: { eps: { min: 0.01, max: 10 }, min_samples: { min: 1, max: 100 } },
  lda: { n_components: { min: 2, max: 50 }, max_iter: { min: 10, max: 1000 }, learning_decay: { min: 0.5, max: 1 }, random_state: { min: 0, max: 1000 } },
  nmf: { n_components: { min: 2, max: 50 }, max_iter: { min: 100, max: 2000 }, alpha: { min: 0, max: 1 }, random_state: { min: 0, max: 1000 } },
  legalbert: { max_length: { min: 128, max: 512 }, learning_rate: { min: 1e-6, max: 0.01 }, batch_size: { min: 4, max: 32 }, epochs: { min: 1, max: 10 } },
  roberta: { max_length: { min: 128, max: 512 }, learning_rate: { min: 1e-6, max: 0.01 }, batch_size: { min: 4, max: 32 }, epochs: { min: 1, max: 10 } },
}
