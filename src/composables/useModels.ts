import { ref } from 'vue'
import type { Id, MLAdapter, MlModel } from '../types'
import { createPollLoop, type PollLoop } from '../utils/polling'

export function useModels(adapter: MLAdapter) {
  const models = ref<MlModel[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  let loop: PollLoop | null = null

  async function load(datasetId?: Id) {
    isLoading.value = true
    error.value = null
    try {
      models.value = await adapter.listModels(datasetId)
      scheduleRefreshIfTraining(datasetId)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load models'
    } finally {
      isLoading.value = false
    }
  }

  function scheduleRefreshIfTraining(datasetId?: Id) {
    stopPolling()
    if (!models.value.some((m) => m.status === 'training')) return
    loop = createPollLoop(async () => {
      const next = await adapter.listModels(datasetId)
      models.value = next
      if (!next.some((m) => m.status === 'training')) stopPolling()
    }, 10000)
    loop.start()
  }

  function stopPolling() {
    loop?.stop()
    loop = null
  }

  async function create(config: Parameters<MLAdapter['createModel']>[0]): Promise<MlModel> {
    const model = await adapter.createModel(config)
    models.value = [model, ...models.value]
    return model
  }

  async function remove(id: Id) {
    await adapter.deleteModel(id)
    models.value = models.value.filter((m) => m.id !== id)
  }

  return { models, isLoading, error, load, create, remove, stopPolling }
}
