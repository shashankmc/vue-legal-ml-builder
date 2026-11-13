import type { AnnotationLevel, Assignment } from 'legal-annotation-kit'
import type { MlBuilderTheme } from './theme'
import type { CurveChartOptions } from './utils/trainingCharts'

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

/** How a training run is monitored, under `parameters.monitoring`. A setting a
 * run leaves out takes the host's default, then legal-ml-core's. Include and
 * exclude are name globs (`eval_*`) for which metric points are stored; stage
 * markers always are. `flush_every_points` and `flush_every_seconds` say how
 * often the worker writes metric points in a batch. `learning_curve` adds a
 * learning curve to a classical Text Classification run, which makes it slower.
 * `system_metrics` records memory, GPU use, speed and time left as `system`
 * points. A bad value is refused with
 * `field: 'monitoring.<setting>'`. */
export interface MonitoringSettings {
  log_every_n_steps: number
  eval_strategy: 'epoch' | 'steps'
  /** Read only when `eval_strategy` is `steps`. */
  eval_steps: number
  include: string[]
  exclude: string[]
  learning_curve: boolean
  /** Record memory, GPU use when there is a GPU, speed and time left as
   * `system` points. Off by default. */
  system_metrics: boolean
  /** Whole number above 0; legal-ml-core's default is 50. */
  flush_every_points: number
  /** Above 0; legal-ml-core's default is 2. */
  flush_every_seconds: number
}

/** A Model's settings, by catalogue name, plus its own monitoring. A run's
 * recorded settings carry every monitoring setting, defaults filled in. */
export type ModelParameters = Record<string, unknown> & { monitoring?: Partial<MonitoringSettings> }

export interface MlModel {
  id: Id
  user_id: Id
  dataset_id: Id
  project_id?: Id | null
  name: string
  model_type: string
  parameters: ModelParameters
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

/** Which chart a metric point belongs on: `train` (loss, learning rate),
 * `eval` (scores on the evaluation split), `system` (resources and
 * throughput) or `stage` (the run's milestones, drawn as events). */
export type TrainingMetricGroup = 'train' | 'eval' | 'system' | 'stage'

/** What a metric point's `training_step` counts: the trainer's steps, a
 * classical run's iterations (loss by iteration), or training examples (a
 * learning curve). */
export type TrainingXKind = 'step' | 'iteration' | 'training_examples'

export interface TrainingMetricPoint {
  id: Id
  training_job_id: Id
  /** Write counter and polling cursor, not the trainer's step. */
  step: number
  epoch: number | null
  /** The trainer's own step, for fine-tuning; the iteration, for a classical
   * run's loss by iteration; the training-set size, for `learning_curve_*`
   * points; null otherwise. */
  training_step?: number | null
  metric_name: string
  /** Left out by hosts on an older legal-ml-core; `metricGroupOf` then
   * derives it from the name. */
  group?: TrainingMetricGroup
  /** Left out by hosts on an older legal-ml-core; `xKindOf` then derives it
   * from the name. */
  x_kind?: TrainingXKind
  /** A system point's unit (`MB`, `%`, `samples/s`, `s`), null for other
   * points. Left out by older hosts; `metricUnitOf` then reads it from the name. */
  unit?: string | null
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

/** A task opened for legal-annotation-kit: legal-ml-core's
 * `GET /annotation/tasks/<id>/assignment`. */
export interface AnnotationAssignment {
  document: { name: string; full_text: string }
  /** As last saved, or built by the server from the task's label. */
  assignment: Assignment
  /** The Dataset's labels; for typed labels, those saved on it so far. */
  labels: string[]
  /** `document` for single-label tasks, `word` for NER; null when not annotated. */
  annotationLevel: AnnotationLevel | null
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
  /** Required, true, with an LLM seed: the user has seen `estimateActiveLearningSeed`. */
  confirm_estimate?: boolean
}

/** The LLM job choosing an LLM-suggested first batch. `unknown` once the server forgets it. */
export interface ActiveLearningSeed {
  job_id?: Id
  status: LlmJobStatus | 'unknown'
  done?: number
  total?: number
  error?: string
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
  /** Only with an LLM-suggested first batch. */
  seed?: ActiveLearningSeed
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
// LLM assistance — mirrors legal-ml-core's /api/llm responses. Single-label
// classification only. A suggestion is not a label until a person confirms it.
// ---------------------------------------------------------------------------

/** Whose key a request would use: the platform's shared key, the user's own, or none. */
export type LlmMode = 'shared' | 'byok' | 'none'

export interface LlmStatus {
  mode: LlmMode
  /** Where text is sent, named as the user must acknowledge it. Null without access. */
  destination: string | null
  model: string | null
  shared_key_allowed: boolean
  /** The user's own key, without the key itself, which is never returned. */
  key: { base_url: string; model: string } | null
  /** Tokens left this month on the shared key; null for an own key or no limit. */
  remaining_tokens: number | null
  /** The most items one suggestions request may ask for. Older servers omit it. */
  max_sync_tasks?: number
  /** Sent when asked about a Dataset: whether its Project acknowledged `destination`. */
  acknowledged?: boolean
}

export interface LlmKeyInput {
  base_url: string
  model: string
  api_key: string
}

export interface LlmAcknowledgement {
  destination: string
  created_at: string
}

export interface LlmPrompt {
  /** 0 is the unedited default. */
  version: number
  template: string
  /** Label name to its definition. */
  definitions: Record<string, string>
  created_at?: string
}

export type LlmSuggestionStatus = 'pending' | 'accepted' | 'corrected' | 'rejected' | 'bulk_accepted'

export interface LlmSuggestion {
  id: Id
  task_id: Id
  model: string
  prompt_version: number
  label: string
  rationale: string
  status: LlmSuggestionStatus
  created_at: string
}

export interface LlmSuggestionBatch {
  suggestions: LlmSuggestion[]
  /** Items that already had a suggestion from this model and prompt. */
  skipped: number
  /** Answers that failed the output check and were discarded. */
  invalid: number
}

/** How often the latest model and prompt matched people's decisions. Bulk accept
 * unlocks at `min_sample` checked items with a `rate` of at least `threshold`. */
export interface LlmAgreement {
  model: string | null
  prompt_version: number | null
  checked: number
  agreed: number
  rate: number | null
  min_sample: number
  threshold: number
  unlocked: boolean
}

export interface LlmEstimate {
  tasks: number
  estimated_tokens: number
  remaining_tokens: number | null
  within_budget: boolean
  destination: string
}

export type LlmJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'budget_exhausted'

export interface LlmJob {
  status: LlmJobStatus
  total: number
  done: number
  created?: number
  invalid?: number
  error?: string
}

/** The `code` legal-ml-core puts on an LLM refusal. */
export type LlmErrorCode =
  | 'no_llm_access'
  | 'acknowledgement_required'
  | 'destination_changed'
  | 'budget_exhausted'
  | 'prompt_rejected'
  | 'agreement_not_met'
  | 'credential_unusable'
  | 'llm_failed'

/** An adapter's rejection of an LLM call. `code` says what to offer next, and
 * `destination` is the current one when it must be acknowledged again. */
export interface LlmRefusalError extends Error {
  code?: LlmErrorCode | string
  destination?: string
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
  /** Also capped at the rows of the Dataset, as a cluster count is. */
  at_most_rows?: boolean
  description?: string
  /** Optional in-workflow copy on why this parameter affects performance —
   * shown by ParameterPerformanceExplorer, not present in the raw backend
   * catalog (backend only sends `description`); the host app or this
   * package's own model-info tables may enrich entries with this field. */
  explanation?: string
  recommendation?: string
}

/** Limits `parameter` to `options` while `when` holds, and `reason` says why.
 * `when` names chosen values, or `multiclass` for over two labels in the Dataset. */
export interface ParameterRule {
  when: Record<string, unknown>
  parameter: string
  options: string[]
  reason: string
}

export interface ModelTypeInfo {
  name: string
  description: string
  parameters: Record<string, ParameterFieldSchema>
  rules?: ParameterRule[]
  /** Whether a run can record a learning curve (`monitoring.learning_curve`).
   * Left out by hosts on an older legal-ml-core. */
  supports_learning_curve?: boolean
}

export type ModelCatalog = Record<string, Record<string, ModelTypeInfo>>

/** Every model fitted to one Dataset: whether it can train it and, if not, why;
 * `advice` says what would make the Dataset trainable when no model can. */
export interface ModelFit {
  models: Record<string, Partial<ModelTypeInfo> & { usable: boolean; reason: string | null }>
  advice: string | null
}

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

/** An adapter's rejection when the backend names the parameter at fault. An
 * adapter need not set `field`: the refusal is then shown without marking one. */
export interface RefusalError extends Error {
  field?: string
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
  /** Optional: every model fitted to this Dataset, with reasons (legal-ml-core
   * 0.11: GET /api/models/available?dataset_id=). Without it, models are offered
   * by task type alone. */
  getModelFit?(datasetId: Id): Promise<ModelFit>
  /** Rejects with an Error, a `RefusalError` when a refusal names a setting. */
  createModel(config: { name: string; dataset_id: Id; model_type: string; parameters: ModelParameters; project_id?: Id }): Promise<MlModel>
  /** Optional: renames a Model or replaces its settings. Rejects as `createModel` does. */
  updateModel?(id: Id, changes: { name?: string; parameters?: ModelParameters }): Promise<MlModel>
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
  /** Open a task as a legal-annotation-kit Assignment, with its labels and level. */
  getAnnotationAssignment(taskId: Id): Promise<AnnotationAssignment>
  /** Save a task's Assignment; the server derives the label. Rejects with the
   * server's reason when a rule is broken. */
  saveAnnotationAssignment(taskId: Id, assignment: Assignment): Promise<AnnotationTask>
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
  /** What an LLM-suggested first batch would send and cost. Nothing starts. */
  estimateActiveLearningSeed?(datasetId: Id, options: { batch_size: number; holdout_percent: number }): Promise<LlmEstimate>

  // LLM assistance. Optional: without `getLlmStatus` the workspace shows no LLM
  // controls. Each rejects with an `LlmRefusalError`.
  getLlmStatus?(datasetId?: Id): Promise<LlmStatus>
  /** Write-only: the key is never returned. */
  saveLlmKey?(key: LlmKeyInput): Promise<{ base_url: string; model: string }>
  deleteLlmKey?(): Promise<void>
  /** `destination` must be the one the user was shown. */
  acknowledgeLlmDestination?(datasetId: Id, destination: string): Promise<LlmAcknowledgement>
  getLlmPrompt?(datasetId: Id): Promise<LlmPrompt>
  /** Checks the prompt and saves it as a new version, or rejects with the reason. */
  updateLlmPrompt?(datasetId: Id, prompt: { template: string; definitions: Record<string, string> }): Promise<LlmPrompt>
  createLlmSuggestions?(datasetId: Id, taskIds: Id[]): Promise<LlmSuggestionBatch>
  listLlmSuggestions?(datasetId: Id, status?: LlmSuggestionStatus): Promise<LlmSuggestion[]>
  /** Accepts a suggestion, or corrects it when `label` differs. */
  confirmLlmSuggestion?(suggestionId: Id, label?: string): Promise<{ suggestion: LlmSuggestion; task: AnnotationTask }>
  rejectLlmSuggestion?(suggestionId: Id): Promise<LlmSuggestion>
  getLlmAgreement?(datasetId: Id): Promise<LlmAgreement>
  bulkAcceptLlmSuggestions?(datasetId: Id): Promise<{ accepted: number; agreement: LlmAgreement }>
  /** Leave `taskIds` out for every pending item in the Dataset. */
  estimateLlmAnnotation?(datasetId: Id, taskIds?: Id[]): Promise<LlmEstimate>
  /** Starts a job on the worker, once the user has seen the estimate. */
  startLlmAnnotation?(datasetId: Id, taskIds?: Id[]): Promise<{ job_id: Id; estimate: LlmEstimate }>
  getLlmJob?(jobId: Id): Promise<LlmJob>
}

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

/** How `TrainingCurves` draws a job's curves. Set app-wide through the plugin's
 * `trainingCurves` option or `provide('vmlb:trainingCurves', …)`; props override it. */
export interface TrainingCurvesOptions extends CurveChartOptions {
  /** Draw values on a log scale. Default false. */
  logScale?: boolean
  /** How often a running job is polled for new points, in milliseconds. Default 3000. */
  pollIntervalMs?: number
}

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
  /** App-wide defaults for `TrainingCurves`, provided as `vmlb:trainingCurves`. */
  trainingCurves?: TrainingCurvesOptions
}
