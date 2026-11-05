import { computed, ref } from 'vue'
import { count } from '../annotation/annotationState'
import { batchSummary } from '../annotation/llmAssist'
import type { Id, LlmAgreement, LlmKeyInput, LlmRefusalError, LlmStatus, LlmSuggestion, MLAdapter } from '../types'

/** Refusals after which the status on screen is out of date. */
const STATUS_CODES = ['no_llm_access', 'acknowledgement_required', 'destination_changed', 'credential_unusable']

/** A Dataset's LLM access and suggestions. Nothing is sent to an LLM until the
 * Project has acknowledged the destination the backend names. */
export function useLlmAssist(adapter: MLAdapter) {
  const status = ref<LlmStatus | null>(null)
  /** Suggestions still waiting for a person. None of them is a label. */
  const suggestions = ref<LlmSuggestion[]>([])
  const agreement = ref<LlmAgreement | null>(null)
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
    if (ready.value) await loadProgress(datasetId)
  }

  /** What is waiting, and how far the agreement check has got. */
  async function loadProgress(datasetId: Id) {
    const [waiting, check] = await Promise.all([
      adapter.listLlmSuggestions?.(datasetId, 'pending'),
      adapter.getLlmAgreement?.(datasetId),
    ])
    if (datasetId !== currentId) return
    suggestions.value = waiting ?? []
    agreement.value = check ?? null
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

  /** Names the destination the user was shown, so a stale screen can't agree to another. */
  function acknowledge(datasetId: Id) {
    return run(datasetId, async () => {
      await adapter.acknowledgeLlmDestination!(datasetId, status.value!.destination!)
      await loadStatus(datasetId)
    }, 'Failed to save your confirmation')
  }

  /** After a label was saved elsewhere: what is waiting and the check may have changed. */
  async function refreshProgress(datasetId: Id) {
    if (!ready.value) return
    try {
      await loadProgress(datasetId)
    } catch {
      // A stale count is shown until the next refresh; the label itself was saved.
    }
  }

  /** Resolves true when suggestions became labels. */
  async function bulkAccept(datasetId: Id) {
    let accepted = false
    await run(datasetId, async () => {
      try {
        const result = await adapter.bulkAcceptLlmSuggestions!(datasetId)
        accepted = true
        notice.value = `${count(result.accepted, 'suggestion')} accepted.`
      } finally {
        await loadProgress(datasetId).catch(() => undefined)
      }
    }, 'Failed to accept the suggestions')
    return accepted
  }

  function suggest(datasetId: Id, taskIds: () => Promise<Id[]>) {
    return run(datasetId, async () => {
      const batch = await adapter.createLlmSuggestions!(datasetId, await taskIds())
      await loadStatus(datasetId)
      notice.value = batchSummary(batch)
    }, 'Failed to get suggestions')
  }

  return {
    status, suggestions, agreement, error, notice, isBusy, budgetExhausted, hasAccess, ready,
    refresh, refreshProgress, saveKey, deleteKey, acknowledge, suggest, bulkAccept,
  }
}
