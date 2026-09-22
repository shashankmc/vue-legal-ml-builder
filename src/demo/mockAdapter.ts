import type {
  AnnotationTask,
  Dataset,
  MLAdapter,
  MlModel,
  ModelCatalog,
  TrainingJob,
  TrainingMetricPoint,
} from '../types'
import { AVAILABLE_MODELS_DEMO } from './demoCatalog'

let datasetSeq = 0
let modelSeq = 0
let jobSeq = 0

const datasets: Dataset[] = [
  {
    id: 'ds-1',
    user_id: 'demo-user',
    name: 'Sample Legal Contracts',
    description: 'A demo dataset of contract clauses',
    file_path: '/tmp/demo.csv',
    row_count: 240,
    columns: [{ name: 'text', type: 'object', null_count: 0, unique_count: 240 }, { name: 'label', type: 'object', null_count: 0, unique_count: 2 }],
    task_type: 'classification',
    dataset_type: 'training',
    annotation_progress: 100,
    annotated_count: 240,
    total_count: 240,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

const seedAt = new Date().toISOString()
const models: MlModel[] = [
  {
    id: 'seed-svm-1',
    user_id: 'demo-user',
    dataset_id: 'ds-1',
    project_id: null,
    name: 'SVM C=0.1 (linear)',
    model_type: 'svm',
    parameters: { C: 0.1, kernel: 'linear' },
    status: 'completed',
    metrics: { accuracy: 0.84, precision: 0.83, recall: 0.84, f1_score: 0.83 },
    created_at: seedAt,
    updated_at: seedAt,
  },
  {
    id: 'seed-svm-2',
    user_id: 'demo-user',
    dataset_id: 'ds-1',
    project_id: null,
    name: 'SVM C=1.0 (rbf)',
    model_type: 'svm',
    parameters: { C: 1.0, kernel: 'rbf' },
    status: 'completed',
    metrics: { accuracy: 0.91, precision: 0.9, recall: 0.91, f1_score: 0.9 },
    created_at: seedAt,
    updated_at: seedAt,
  },
  {
    id: 'seed-svm-3',
    user_id: 'demo-user',
    dataset_id: 'ds-1',
    project_id: null,
    name: 'SVM C=10 (rbf)',
    model_type: 'svm',
    parameters: { C: 10, kernel: 'rbf' },
    status: 'completed',
    metrics: { accuracy: 0.88, precision: 0.87, recall: 0.88, f1_score: 0.87 },
    created_at: seedAt,
    updated_at: seedAt,
  },
]
const jobs: Record<string, TrainingJob> = {}
const metricPoints: Record<string, TrainingMetricPoint[]> = {}

function delay<T>(value: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export function createMockAdapter(): MLAdapter {
  return {
    async listDatasets() {
      return delay([...datasets])
    },
    async getDataset(id) {
      const ds = datasets.find((d) => d.id === id)
      if (!ds) throw new Error('Dataset not found')
      return delay(ds)
    },
    async uploadDataset(file, meta) {
      datasetSeq++
      const ds: Dataset = {
        id: `ds-${datasetSeq}`,
        user_id: 'demo-user',
        name: meta.name,
        description: meta.description ?? null,
        file_path: `/tmp/${file.name}`,
        row_count: 100,
        columns: [],
        task_type: meta.task_type,
        dataset_type: 'training',
        annotation_progress: 0,
        annotated_count: 0,
        total_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      datasets.unshift(ds)
      return delay(ds)
    },
    async deleteDataset(id) {
      const idx = datasets.findIndex((d) => d.id === id)
      if (idx >= 0) datasets.splice(idx, 1)
      return delay(undefined)
    },
    async getEdaData() {
      return delay({
        dataset_overview: { shape: { rows: 240, columns: 2 } },
        column_analysis: {
          text: { dtype: 'object', null_count: 0, null_percentage: 0, unique_count: 240, unique_percentage: 100 },
          label: { dtype: 'object', null_count: 0, null_percentage: 0, unique_count: 2, unique_percentage: 0.8 },
        },
        data_quality: { issues: [], overall_quality_score: 96 },
        statistical_summary: { numeric_summary: {}, categorical_summary: {} },
        task_specific_analysis: { label_distribution: { positive: 120, negative: 120 } },
        insights: [{ type: 'info', title: 'Balanced classes', message: 'Label distribution is balanced.', priority: 'low' }],
      })
    },

    async listModels(datasetId) {
      return delay(datasetId ? models.filter((m) => m.dataset_id === datasetId) : [...models])
    },
    async getModel(id) {
      const m = models.find((x) => x.id === id)
      if (!m) throw new Error('Model not found')
      return delay(m)
    },
    async getAvailableModelTypes(taskType) {
      const catalog: ModelCatalog = AVAILABLE_MODELS_DEMO
      return delay(taskType ? { [taskType]: catalog[taskType] } : catalog)
    },
    async createModel(config) {
      modelSeq++
      const model: MlModel = {
        id: `model-${modelSeq}`,
        user_id: 'demo-user',
        dataset_id: config.dataset_id,
        project_id: config.project_id ?? null,
        name: config.name,
        model_type: config.model_type,
        parameters: config.parameters,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      models.unshift(model)
      return delay(model)
    },
    async deleteModel(id) {
      const idx = models.findIndex((m) => m.id === id)
      if (idx >= 0) models.splice(idx, 1)
      return delay(undefined)
    },

    async startTraining(modelId) {
      jobSeq++
      const jobId = `job-${jobSeq}`
      const model = models.find((m) => m.id === modelId)
      if (model) model.status = 'training'
      jobs[jobId] = { id: jobId, user_id: 'demo-user', model_id: modelId, status: 'running', progress: 0, created_at: new Date().toISOString() }
      metricPoints[jobId] = []
      simulateTraining(jobId, modelId)
      return delay({ job_id: jobId })
    },
    async getTrainingStatus(jobId) {
      const job = jobs[jobId]
      const model = job ? models.find((m) => m.id === job.model_id) ?? null : null
      return delay({ job, model })
    },
    async stopTraining(jobId) {
      if (jobs[jobId]) jobs[jobId].status = 'cancelled'
      return delay(undefined)
    },
    async getTrainingMetrics(jobId, sinceStep = -1) {
      const points = metricPoints[jobId] ?? []
      return delay(points.filter((p) => p.step > sinceStep))
    },

    async predict(_modelId, texts) {
      return delay(texts.map((t) => ({ text: t, prediction: Math.random() > 0.5 ? 'positive' : 'negative', confidence: 0.7 + Math.random() * 0.3 })))
    },
    async explain() {
      return delay({ predicted_class: 'positive', type: 'lime_text', features: [{ feature: 'contract', weight: 0.42 }] })
    },

    async getModelPerformance() {
      return delay({
        performance_data: { accuracy: 0.91, precision: 0.89, recall: 0.9, f1_score: 0.895 },
        performance_chart: JSON.stringify({
          data: [
            {
              type: 'bar',
              x: ['accuracy', 'precision', 'recall', 'f1_score'],
              y: [0.91, 0.89, 0.9, 0.895],
              marker: { color: '#4f46e5' },
            },
          ],
          layout: { title: 'Model performance', height: 360, yaxis: { range: [0, 1] } },
        }),
      })
    },
    async getConfusionMatrix() {
      return delay({ confusion_matrix: [[42, 3], [5, 38]], labels: ['positive', 'negative'] })
    },
    async compareModels(modelIds, name) {
      return delay({ id: 'cmp-1', user_id: 'demo-user', name, model_ids: modelIds, comparison_metrics: { metrics: [], chart: '' }, created_at: new Date().toISOString() })
    },
    async getParameterComparison(modelType, metric) {
      return delay(
        models
          .filter((m) => m.model_type === modelType && m.metrics)
          .map((m) => ({ model_id: m.id, training_job_id: `job-for-${m.id}`, parameters: m.parameters, metric_value: (m.metrics as any)?.[metric] ?? 0 })),
      )
    },

    async getNextAnnotationTask() {
      const task: AnnotationTask = {
        id: 'task-1',
        dataset_id: 'ds-1',
        item_index: 0,
        text: 'The tenant shall pay rent on the first day of each month.',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return delay({ task, stats: { total: 10, annotated: 3, percentage: 30 } })
    },
    async saveAnnotation(taskId, label) {
      return delay({ id: taskId, dataset_id: 'ds-1', item_index: 0, text: '', annotation_label: String(label), status: 'annotated', created_at: '', updated_at: '' })
    },
    async skipAnnotation(taskId) {
      return delay({ id: taskId, dataset_id: 'ds-1', item_index: 0, text: '', status: 'skipped', created_at: '', updated_at: '' })
    },
  }
}

function simulateTraining(jobId: string, modelId: string) {
  const phases: Array<[string, number]> = [
    ['preprocessing_started', 0],
    ['preprocessing_done', 25],
    ['training_started', 25],
    ['training_done', 75],
    ['model_saved', 100],
  ]
  let i = 0
  const interval = setInterval(() => {
    if (i >= phases.length) {
      clearInterval(interval)
      const job = jobs[jobId]
      const model = models.find((m) => m.id === modelId)
      if (job) job.status = 'completed'
      if (model) {
        model.status = 'completed'
        model.metrics = { accuracy: 0.91, precision: 0.89, recall: 0.9, f1_score: 0.895, confusion_matrix: [[42, 3], [5, 38]], confusion_matrix_labels: ['positive', 'negative'] }
      }
      return
    }
    const [name, pct] = phases[i]
    metricPoints[jobId].push({ id: `pt-${jobId}-${i}`, training_job_id: jobId, step: i, epoch: null, metric_name: name, value: 1, created_at: new Date().toISOString() })
    if (jobs[jobId]) jobs[jobId].progress = pct
    i++
  }, 1200)
}
