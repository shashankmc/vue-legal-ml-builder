import { computed, ref } from 'vue'
import type { Id, LlmKeyInput, LlmRefusalError, LlmStatus, MLAdapter } from '../types'

/** Refusals after which the status on screen is out of date. */
const STATUS_CODES = ['no_llm_access', 'acknowledgement_required', 'destination_changed', 'credential_unusable']

/** A Dataset's LLM access and suggestions. Nothing is sent to an LLM until the
 * Project has acknowledged the destination the backend names. */
export function useLlmAssist(adapter: MLAdapter) {
  const status = ref<LlmStatus | null>(null)
  const error = ref<string | null>(null)
  const notice = ref('')
  const isBusy = ref(false)
  /** The monthly limit of the shared key is used up. */
  const budgetExhausted = ref(false)
  /** The Dataset on screen. A reply about any other is dropped. */
  let currentId: Id | null = null

  const hasAccess = computed(() => !!status.value && status.value.mode !== 'none')
  const ready = computed(() => hasAccess.value && !!status.value?.acknowledged)

  async function loadStatus(datasetId: Id) {
    const next = await adapter.getLlmStatus!(datasetId)
    if (datasetId !== currentId) return
    status.value = next
    budgetExhausted.value = next.mode === 'shared' && next.remaining_tokens === 0
  }

  async function run(datasetId: Id, action: () => Promise<void>, fallback: string) {
    isBusy.value = true
    error.value = null
    notice.value = ''
    try {
      await action()
    } catch (err) {
      const refusal = err as LlmRefusalError
      error.value = err instanceof Error ? err.message : fallback
      if (refusal?.code === 'budget_exhausted') budgetExhausted.value = true
      if (STATUS_CODES.includes(refusal?.code ?? '')) await loadStatus(datasetId).catch(() => undefined)
    } finally {
      isBusy.value = false
    }
  }

  function refresh(datasetId: Id) {
    currentId = datasetId
    return run(datasetId, () => loadStatus(datasetId), 'Failed to load LLM access')
  }

  /** The key goes straight to the adapter and is not kept here. */
  function saveKey(datasetId: Id, key: LlmKeyInput) {
    return run(datasetId, async () => {
      await adapter.saveLlmKey!(key)
      await loadStatus(datasetId)
      notice.value = 'Your key is saved. It is never shown again.'
    }, 'Failed to save your key')
  }

  function deleteKey(datasetId: Id) {
    return run(datasetId, async () => {
      await adapter.deleteLlmKey!()
      await loadStatus(datasetId)
      notice.value = 'Your key is deleted.'
    }, 'Failed to delete your key')
  }

  return { status, error, notice, isBusy, budgetExhausted, hasAccess, ready, refresh, saveKey, deleteKey }
}
