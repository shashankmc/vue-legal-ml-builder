import type {
  ActiveLearningSettings,
  ActiveLearningStartOptions,
  ActiveLearningState,
  AnnotationTask,
  Dataset,
  DatasetUploadMeta,
  EdaResult,
  ExplanationResult,
  Id,
  MLAdapter,
  MlModel,
  ModelCatalog,
  ModelComparison,
  ParameterComparisonPoint,
  PredictionResult,
  RefusalError,
  TrainingJob,
  TrainingMetricPoint,
} from '../types'

export interface SelfHostedAdapterOptions {
  /** Base URL of the host app's API, e.g. "/api" or "https://app.example.com/api". */
  apiUrl: string
  /** Called on every request to get the current bearer token; return null/undefined to omit it. */
  getAuthToken?: () => string | null | undefined
  /** Called when a request comes back 401; return a fresh token to retry it once, or nothing to give up. */
  refreshAuthToken?: () => Promise<string | null | undefined>
}

function buildHeaders(getAuthToken?: () => string | null | undefined, extra: HeadersInit = {}): HeadersInit {
  const headers: Record<string, string> = { ...(extra as Record<string, string>) }
  const token = getAuthToken?.()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function parseOrThrow(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error: RefusalError = new Error(data.error || `Request failed: ${res.status} ${res.statusText}`)
    if (typeof data.field === 'string') error.field = data.field
    throw error
  }
  return data
}

export function createSelfHostedAdapter(opts: SelfHostedAdapterOptions): MLAdapter {
  const base = opts.apiUrl.replace(/\/$/, '')
  const { getAuthToken, refreshAuthToken } = opts
  let refreshing: Promise<string | null | undefined> | null = null

  // One refresh serves every request that expired together.
  function refreshOnce() {
    refreshing ??= refreshAuthToken!().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  async function send(path: string, init: RequestInit = {}, headers: HeadersInit = {}) {
    const url = `${base}${path}`
    const res = await fetch(url, { ...init, headers: buildHeaders(getAuthToken, headers) })
    if (res.status !== 401 || !refreshAuthToken) return res
    const token = await refreshOnce()
    return token ? fetch(url, { ...init, headers: buildHeaders(() => token, headers) }) : res
  }

  function get(path: string) {
    return send(path).then(parseOrThrow)
  }

  function del(path: string) {
    return send(path, { method: 'DELETE' }).then(parseOrThrow)
  }

  function put(path: string, body: unknown) {
    return send(path, { method: 'PUT', body: JSON.stringify(body) }, { 'Content-Type': 'application/json' }).then(parseOrThrow)
  }

  function post(path: string, body?: unknown) {
    return send(
      path,
      { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined },
      { 'Content-Type': 'application/json' },
    ).then(parseOrThrow)
  }

  return {
    // Datasets
    async listDatasets(): Promise<Dataset[]> {
      const data = await get('/datasets/')
      return data.datasets
    },
    async getDataset(id: Id): Promise<Dataset> {
      const data = await get(`/datasets/${id}`)
      return data.dataset
    },
    async uploadDataset(file: File, meta: DatasetUploadMeta): Promise<Dataset> {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('name', meta.name)
      formData.append('task_type', meta.task_type)
      if (meta.description) formData.append('description', meta.description)
      if (meta.annotation_mode !== undefined) formData.append('annotation_mode', String(meta.annotation_mode))
      if (meta.labels?.length) formData.append('labels', meta.labels.join(','))

      const res = await send('/datasets/upload', { method: 'POST', body: formData })
      const data = await parseOrThrow(res)
      return data.dataset
    },
    async deleteDataset(id: Id): Promise<void> {
      await del(`/datasets/${id}`)
    },
    async getEdaData(datasetId: Id): Promise<EdaResult> {
      return get(`/datasets/${datasetId}/eda`)
    },

    // Models
    async listModels(datasetId?: Id): Promise<MlModel[]> {
      const query = datasetId ? `?dataset_id=${encodeURIComponent(String(datasetId))}` : ''
      const data = await get(`/models/${query}`)
      return data.models
    },
    async getModel(id: Id): Promise<MlModel> {
      const data = await get(`/models/${id}`)
      return data.model
    },
    async getAvailableModelTypes(taskType?: string): Promise<ModelCatalog> {
      const query = taskType ? `?task_type=${encodeURIComponent(taskType)}` : ''
      const data = await get(`/models/available${query}`)
      return taskType ? { [taskType]: data.models } : data.models
    },
    async createModel(config): Promise<MlModel> {
      const data = await post('/models/', config)
      return data.model
    },
    async deleteModel(id: Id): Promise<void> {
      await del(`/models/${id}`)
    },

    // Training
    async startTraining(modelId: Id, options = {}): Promise<{ job_id: Id }> {
      const data = await post('/training/start', { model_id: modelId, ...options })
      return { job_id: data.job_id }
    },
    async getTrainingStatus(jobId: Id): Promise<{ job: TrainingJob; model: MlModel | null }> {
      return get(`/training/status/${jobId}`)
    },
    async stopTraining(jobId: Id): Promise<void> {
      await post(`/training/stop/${jobId}`)
    },
    async getTrainingMetrics(jobId: Id, sinceStep = -1): Promise<TrainingMetricPoint[]> {
      const data = await get(`/training/${jobId}/metrics?since_step=${sinceStep}`)
      return data.points
    },

    // Predict / explain
    async predict(modelId: Id, texts: string[]): Promise<PredictionResult[]> {
      const data = await post(`/models/${modelId}/predict`, { texts })
      return data.predictions
    },
    async explain(modelId: Id, text: string, method: 'lime' | 'shap' = 'lime'): Promise<ExplanationResult> {
      const started = await post(`/models/${modelId}/explain`, { text, method })
      const explanationId = started.explanation_id

      // Explanation is generated asynchronously by the worker — poll until ready.
      for (let attempt = 0; attempt < 60; attempt++) {
        const result = await get(`/models/explanations/${explanationId}`)
        if (result.status !== 'processing') return result.explanation ?? result
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      throw new Error('Explanation timed out')
    },

    // Visualization
    async getModelPerformance(modelId: Id) {
      return get(`/visualization/model-performance/${modelId}`)
    },
    async getConfusionMatrix(modelId: Id) {
      return get(`/visualization/confusion-matrix/${modelId}`)
    },
    async compareModels(modelIds: Id[], name: string): Promise<ModelComparison> {
      const data = await post('/visualization/model-comparison', { name, model_ids: modelIds })
      return data.comparison
    },
    async getParameterComparison(modelType: string, metric: string): Promise<ParameterComparisonPoint[]> {
      const data = await get(
        `/visualization/parameter-comparison?model_type=${encodeURIComponent(modelType)}&metric=${encodeURIComponent(metric)}`,
      )
      return data.points
    },

    // Annotation
    async getNextAnnotationTask(projectId: Id, datasetId?: Id, options?: { holdout?: boolean }) {
      const params = new URLSearchParams()
      if (datasetId) params.set('dataset', String(datasetId))
      if (options?.holdout) params.set('holdout', '1')
      const query = params.toString() ? `?${params}` : ''
      const data = await get(`/annotation/projects/${projectId}/queue/next${query}`)
      return { task: data.task, stats: data.stats }
    },
    async saveAnnotation(taskId: Id, label: unknown): Promise<AnnotationTask> {
      const data = await post(`/annotation/tasks/${taskId}/save`, { annotation_label: label })
      return data.task
    },
    async skipAnnotation(taskId: Id): Promise<AnnotationTask> {
      const data = await post(`/annotation/tasks/${taskId}/skip`)
      return data.task
    },
    async listAnnotationTasks(projectId: Id, filter): Promise<AnnotationTask[]> {
      const params = new URLSearchParams()
      if (filter.status) params.set('status', filter.status)
      if (filter.datasetId) params.set('dataset_id', String(filter.datasetId))
      const data = await get(`/annotation/projects/${projectId}/tasks?${params}`)
      return data.tasks
    },

    // Active learning
    async getActiveLearningSettings(): Promise<ActiveLearningSettings> {
      return get('/active-learning/settings')
    },
    async getActiveLearningState(datasetId: Id): Promise<ActiveLearningState | { active: false }> {
      return get(`/active-learning/datasets/${datasetId}`)
    },
    async startActiveLearning(datasetId: Id, options: ActiveLearningStartOptions): Promise<ActiveLearningState> {
      return post(`/active-learning/datasets/${datasetId}/start`, options)
    },
    async setActiveLearningStrategy(datasetId: Id, strategy: string): Promise<ActiveLearningState> {
      return put(`/active-learning/datasets/${datasetId}/strategy`, { strategy })
    },
    async correctActiveLearningLabel(datasetId: Id, from: string, to: string): Promise<ActiveLearningState> {
      return put(`/active-learning/datasets/${datasetId}/labels`, { from, to })
    },
    async retrainActiveLearning(datasetId: Id): Promise<{ job_id: Id | null }> {
      const data = await post(`/active-learning/datasets/${datasetId}/retrain`)
      return { job_id: data.job_id }
    },
    async verifyActiveLearning(datasetId: Id): Promise<void> {
      await post(`/active-learning/datasets/${datasetId}/verify`)
    },
  }
}
