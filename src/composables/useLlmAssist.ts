import { computed, onUnmounted, ref, type Ref } from 'vue'
import { count } from '../annotation/annotationState'
import { batchSummary } from '../annotation/llmAssist'
import type { Id, LlmAgreement, LlmEstimate, LlmJob, LlmKeyInput, LlmPrompt, LlmRefusalError, LlmStatus, LlmSuggestion, MLAdapter } from '../types'
import { createPollLoop, type PollLoop } from '../utils/polling'

/** Refusals after which the status on screen is out of date. */
const STATUS_CODES = ['no_llm_access', 'acknowledgement_required', 'destination_changed', 'credential_unusable']

/** A Dataset's LLM access and suggestions. Nothing is sent to an LLM until the
 * Project has acknowledged the destination the backend names. */
export function useLlmAssist(adapter: MLAdapter, pollIntervalMs = 3000) {
  const status = ref<LlmStatus | null>(null)
  /** Suggestions still waiting for a person. None of them is a label. */
  const suggestions = ref<LlmSuggestion[]>([])
  const agreement = ref<LlmAgreement | null>(null)
  const prompt = ref<LlmPrompt | null>(null)
  /** Why the backend refused a prompt edit, shown beside the editor. */
  const promptError = ref<string | null>(null)
  const error = ref<string | null>(null)
  const notice = ref('')
  const isBusy = ref(false)
  /** The monthly limit of the shared key is used up. */
  const budgetExhausted = ref(false)
  /** A standalone job's estimate, the items it covers (all pending when
   * undefined), and the job once started. */
  const estimate = ref<LlmEstimate | null>(null)
  const job = ref<LlmJob | null>(null)
  let estimatedIds: Id[] | undefined
  let jobLoop: PollLoop | null = null
  /** The Dataset on screen. A reply about any other is dropped. */
  let currentId: Id | null = null

  const hasAccess = computed(() => !!status.value && status.value.mode !== 'none')
  const ready = computed(() => hasAccess.value && !!status.value?.acknowledged)

  async function loadStatus(datasetId: Id) {
    const next = await adapter.getLlmStatus!(datasetId)
    if (datasetId !== currentId) return
    status.value = next
    // A refusal at the limit outlasts a status read; an own key ends it.
    budgetExhausted.value = next.mode === 'shared' && (next.remaining_tokens === 0 || budgetExhausted.value)
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

  async function run(datasetId: Id, action: () => Promise<void>, fallback: string, errorRef: Ref<string | null> = error) {
    isBusy.value = true
    error.value = null
    errorRef.value = null
    notice.value = ''
    try {
      await action()
    } catch (err) {
      const refusal = err as LlmRefusalError
      errorRef.value = err instanceof Error ? err.message : fallback
      if (refusal?.code === 'budget_exhausted') budgetExhausted.value = true
      if (STATUS_CODES.includes(refusal?.code ?? '')) await loadStatus(datasetId).catch(() => undefined)
    } finally {
      isBusy.value = false
    }
  }

  function refresh(datasetId: Id) {
    if (datasetId !== currentId) {
      stopJob()
      suggestions.value = []
      agreement.value = null
      prompt.value = null
      estimate.value = null
      job.value = null
    }
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
      notice.value = batchSummary({ created: batch.suggestions.length, skipped: batch.skipped, invalid: batch.invalid })
    }, 'Failed to get suggestions')
  }

  function loadPrompt(datasetId: Id) {
    return run(datasetId, async () => {
      const next = await adapter.getLlmPrompt!(datasetId)
      if (datasetId === currentId) prompt.value = next
    }, 'Failed to load the prompt', promptError)
  }

  /** The backend checks the edit, with an LLM among its checks, before it keeps it. */
  function savePrompt(datasetId: Id, edit: { template: string; definitions: Record<string, string> }) {
    return run(datasetId, async () => {
      prompt.value = await adapter.updateLlmPrompt!(datasetId, edit)
      await loadStatus(datasetId)
      notice.value = `Saved as version ${prompt.value.version}. The agreement check starts again for it.`
    }, 'Failed to save the prompt', promptError)
  }

  function stopJob() {
    jobLoop?.stop()
    jobLoop = null
  }

  /** Nothing is sent: the backend counts tokens for the items. */
  function estimateJob(datasetId: Id, taskIds: () => Promise<Id[] | undefined>) {
    return run(datasetId, async () => {
      estimate.value = null
      job.value = null
      const ids = await taskIds()
      const next = await adapter.estimateLlmAnnotation!(datasetId, ids)
      if (datasetId !== currentId) return
      estimatedIds = ids
      estimate.value = next
    }, 'Failed to estimate the cost')
  }

  function clearEstimate() {
    estimate.value = null
  }

  /** Starts the job on the items it estimated, then follows it on the worker. */
  function startJob(datasetId: Id) {
    return run(datasetId, async () => {
      const { job_id: jobId, estimate: confirmed } = await adapter.startLlmAnnotation!(datasetId, estimatedIds)
      estimate.value = null
      job.value = { status: 'queued', total: confirmed.tasks, done: 0 }
      stopJob()
      jobLoop = createPollLoop(async () => {
        const next = await adapter.getLlmJob!(jobId)
        if (datasetId !== currentId) return stopJob()
        job.value = next
        if (next.status === 'queued' || next.status === 'running') return
        stopJob()
        if (next.status === 'budget_exhausted') budgetExhausted.value = true
        await loadStatus(datasetId)
      }, pollIntervalMs)
      jobLoop.start()
    }, 'Failed to start labelling')
  }

  onUnmounted(stopJob)

  return {
    status, suggestions, agreement, prompt, promptError, error, notice, isBusy, budgetExhausted, hasAccess, ready,
    estimate, job,
    refresh, refreshProgress, saveKey, deleteKey, acknowledge, suggest, bulkAccept, loadPrompt, savePrompt,
    estimateJob, clearEstimate, startJob,
  }
}
