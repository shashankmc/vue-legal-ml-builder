import type { MlBuilderTheme } from './theme'

// ---------------------------------------------------------------------------
// Core entities — mirror legal-ml-core's `to_dict()` shapes.
// Hand-kept in sync (no shared codegen yet) — a flagged drift risk.
// ---------------------------------------------------------------------------

export type Id = string

export interface Dataset {
  id: Id
  user_id: Id
  name: string
  description?: string | null
  file_path: string
  row_count: number
  columns: Array<{ name: string; type: string; null_count: number; unique_count: number }>
  task_type: string
  project_id?: Id | null
  dataset_type: 'unlabeled' | 'training' | 'test'
  annotation_progress: number
  annotated_count: number
  total_count: number
  text_column?: string | null
  label_column?: string | null
  labels?: string[] | null
  created_at: string
  updated_at: string
}

export type ModelStatus = 'pending' | 'training' | 'completed' | 'failed'

export interface MlModel {
  id: Id
  user_id: Id
  dataset_id: Id
  project_id?: Id | null
  name: string
  model_type: string
  parameters: Record<string, unknown>
  status: ModelStatus
  file_path?: string | null
  /** accuracy/precision/recall/f1_score are numbers; confusion_matrix,
   * confusion_matrix_labels, classification_report, silhouette_score etc.
   * vary by model family — kept loose rather than modeling every shape. */
  metrics?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type TrainingJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface TrainingJob {
  id: Id
  user_id: Id
  model_id: Id
  status: TrainingJobStatus
  progress: number
  metrics?: Record<string, number> | null
  error_message?: string | null
  started_at?: string | null
  completed_at?: string | null
  created_at: string
}

export interface TrainingMetricPoint {
  id: Id
  training_job_id: Id
  step: number
  epoch: number | null
  metric_name: string
  value: number
  created_at: string
}

export interface ModelComparison {
  id: Id
  user_id: Id
  name: string
  model_ids: Id[]
  comparison_metrics: {
    metrics: Array<Record<string, unknown>>
    chart: string
  }
  created_at: string
}

export interface AnnotationTask {
  id: Id
  dataset_id: Id
  item_index: number
  text: string
  annotation_label?: string | null
  status: 'pending' | 'annotated' | 'skipped'
  label_source?: string | null
  score?: number | null
  is_holdout?: boolean
  created_at: string
  updated_at: string
}

export interface AnnotationStats {
  total: number
  annotated: number
  percentage: number
  /** Held-back items still without a label. The queue never serves these. */
  holdout_remaining?: number
}

// ---------------------------------------------------------------------------
// Active learning — mirrors legal-ml-core's /api/active-learning responses.
// ---------------------------------------------------------------------------

export interface ActiveLearningSettings {
  strategies: string[]
  default_strategy: string
  default_batch_size: number
  min_per_class: number
  default_holdout_percent: number
  max_holdout_percent: number
  seed_sources: { random: boolean; llm: boolean }
}

export interface ActiveLearningStartOptions {
  strategy?: string
  batch_size?: number
  min_per_class?: number
  holdout_percent?: number
  seed_source?: 'random' | 'llm'
}

export interface ActiveLearningRound {
  number: number
  status: 'labelling' | 'training' | 'scoring' | 'completed'
  strategy: string
  model_id: Id | null
  job_id: Id | null
  labels_used: number | null
  metrics: Record<string, unknown> | null
  error: string | null
  created_at: string
  completed_at: string | null
}

export interface ActiveLearningState {
  active: true
  strategy: string
  seed_source: string
  batch_size: number
  min_per_class: number
  model_id: Id | null
  round: ActiveLearningRound
  label_counts: Record<string, number>
  /** The Dataset names no labels, so one can be typed wrong and corrected. */
  typed_labels: boolean
  retrain: {
    new_labels: number
    allowed: boolean
    suggested: boolean
    classes_short: Record<string, number>
    needs_second_label: boolean
    labels_total: number
    /** Past this many labels, a short label no longer holds training back. */
    label_cap: number
    /** Labels with one example: training leaves them out. */
    classes_left_out: string[]
    /** Labels the Dataset names, with no examples yet. */
    classes_unseen: string[]
    classes_to_train: number
    /** Examples still needed for the split to show each label once. */
    labels_needed: number
  }
  holdout: {
    percent: number
    size: number
    labelled: number
    label_counts: Record<string, number>
    needed: number
    verification: 'holdout' | 'not_independently_verified' | null
  }
}

// ---------------------------------------------------------------------------
// Model catalog / parameter schema — mirrors legal-ml-core's AVAILABLE_MODELS
// and the parameterSchemas convention from the app's original model-create wizard.
// ---------------------------------------------------------------------------

export type ParameterFieldType = 'int' | 'float' | 'boolean' | 'select' | 'string'

export interface ParameterFieldSchema {
  type: ParameterFieldType
  default?: unknown
  min?: number
  max?: number
  options?: Array<string | number>
  description?: string
  /** Optional in-workflow copy on why this parameter affects performance —
   * shown by ParameterPerformanceExplorer, not present in the raw backend
   * catalog (backend only sends `description`); the host app or this
   * package's own model-info tables may enrich entries with this field. */
  explanation?: string
  recommendation?: string
}

export interface ModelTypeInfo {
  name: string
  description: string
  parameters: Record<string, ParameterFieldSchema>
}

export type ModelCatalog = Record<string, Record<string, ModelTypeInfo>>

// ---------------------------------------------------------------------------
// Backend adapter — the entire contract a host app must implement. Components
// never call an API directly; they call these methods (mirrors
// vue-legal-summarizer's SummarizationAdapter/SummaryStoreAdapter pattern).
// ---------------------------------------------------------------------------

export interface DatasetUploadMeta {
  name: string
  description?: string
  task_type: string
  annotation_mode?: boolean
  labels?: string[]
}

export interface ColumnAnalysis {
  dtype: string
  null_count: number
  null_percentage: number
  unique_count: number
  unique_percentage: number
  [extra: string]: unknown
}

export interface DataQualityIssue {
  type: string
  message: string
  severity: 'warning' | 'info'
  details?: unknown
}

export interface EdaResult {
  dataset_overview: { shape: { rows: number; columns: number }; memory_usage?: number; dtypes?: Record<string, string>; column_names?: string[] }
  column_analysis: Record<string, ColumnAnalysis>
  data_quality: { issues: DataQualityIssue[]; overall_quality_score: number }
  statistical_summary: { numeric_summary: Record<string, unknown>; categorical_summary: Record<string, unknown> }
  task_specific_analysis: Record<string, unknown>
  insights: Array<{ type: string; title: string; message: string; priority: string }>
}

export interface ParameterComparisonPoint {
  model_id: Id
  training_job_id: Id
  parameters: Record<string, unknown>
  metric_value: number
}

export interface PredictionResult {
  text: string
  prediction: string
  confidence?: number
  all_confidences?: Record<string, number>
  cluster_id?: number
  dominant_topic?: number
  topic_weights?: number[]
}

export interface ExplanationResult {
  predicted_class?: string
  type?: string
  features?: Array<{ feature: string; weight: number }>
  feature_importance?: Array<{ feature: string; shap_value: number }>
  error?: string
}

export interface MLAdapter {
  // Datasets
  listDatasets(): Promise<Dataset[]>
  getDataset(id: Id): Promise<Dataset>
  uploadDataset(file: File, meta: DatasetUploadMeta): Promise<Dataset>
  deleteDataset(id: Id): Promise<void>
  getEdaData(datasetId: Id): Promise<EdaResult>

  // Models
  listModels(datasetId?: Id): Promise<MlModel[]>
  getModel(id: Id): Promise<MlModel>
  getAvailableModelTypes(taskType?: string): Promise<ModelCatalog>
  createModel(config: { name: string; dataset_id: Id; model_type: string; parameters: Record<string, unknown>; project_id?: Id }): Promise<MlModel>
  deleteModel(id: Id): Promise<void>

  // Training
  startTraining(modelId: Id, options?: { preprocessing_options?: Record<string, unknown>; test_size?: number; random_state?: number }): Promise<{ job_id: Id }>
  getTrainingStatus(jobId: Id): Promise<{ job: TrainingJob; model: MlModel | null }>
  stopTraining(jobId: Id): Promise<void>
  getTrainingMetrics(jobId: Id, sinceStep?: number): Promise<TrainingMetricPoint[]>

  // Predict / explain
  predict(modelId: Id, texts: string[]): Promise<PredictionResult[]>
  explain(modelId: Id, text: string, method?: 'lime' | 'shap'): Promise<ExplanationResult>

  // Visualization
  getModelPerformance(modelId: Id): Promise<{ performance_data: Record<string, number>; performance_chart: string }>
  getConfusionMatrix(modelId: Id): Promise<{ confusion_matrix: number[][]; labels: string[] }>
  compareModels(modelIds: Id[], name: string): Promise<ModelComparison>
  getParameterComparison(modelType: string, metric: string): Promise<ParameterComparisonPoint[]>

  // Annotation
  getNextAnnotationTask(projectId: Id, datasetId?: Id, options?: { holdout?: boolean }): Promise<{ task: AnnotationTask | null; stats: AnnotationStats }>
  saveAnnotation(taskId: Id, label: unknown): Promise<AnnotationTask>
  skipAnnotation(taskId: Id): Promise<AnnotationTask>
  /** Optional: lets a user return to skipped items. */
  listAnnotationTasks?(projectId: Id, filter: { status?: string; datasetId?: Id }): Promise<AnnotationTask[]>

  // Active learning. Optional: without these the workspace is plain annotation.
  getActiveLearningSettings?(): Promise<ActiveLearningSettings>
  getActiveLearningState?(datasetId: Id): Promise<ActiveLearningState | { active: false }>
  startActiveLearning?(datasetId: Id, options: ActiveLearningStartOptions): Promise<ActiveLearningState>
  setActiveLearningStrategy?(datasetId: Id, strategy: string): Promise<ActiveLearningState>
  correctActiveLearningLabel?(datasetId: Id, from: string, to: string): Promise<ActiveLearningState>
  retrainActiveLearning?(datasetId: Id): Promise<{ job_id: Id | null }>
  verifyActiveLearning?(datasetId: Id): Promise<void>
}

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface MLBuilderPluginOptions {
  /** A pre-built adapter instance, or preset name + connection info. */
  adapter: MLAdapter | { apiUrl: string; getAuthToken?: () => string | null | undefined }
  pollInterval?: number
  /** Theme preset ('ink' | 'dark'), token overrides, or a preset + overrides.
   * Applied to `themeTarget` (document root by default). */
  theme?: MlBuilderTheme
  /** Element the plugin writes theme tokens onto. Defaults to documentElement. */
  themeTarget?: HTMLElement
  /** Hide the builder's annotation views and skip annotation operations, for
   * hosts with their own annotation (Legal Blocks). Default false (shown). */
  hideAnnotation?: boolean
}
