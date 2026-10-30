import { computed, onUnmounted, ref } from 'vue'
import type { ActiveLearningSettings, ActiveLearningStartOptions, ActiveLearningState, Id, MLAdapter } from '../types'
import { createPollLoop, type PollLoop } from '../utils/polling'

const VERIFY_POLLS = 40

/** A dataset's loop state, polled while a round trains or rescores. */
export function useActiveLearning(adapter: MLAdapter, pollIntervalMs = 3000, onReordered?: () => void) {
  const state = ref<ActiveLearningState | { active: false } | null>(null)
  const settings = ref<ActiveLearningSettings | null>(null)
  const error = ref<string | null>(null)
  const isBusy = ref(false)
  const supported = !!adapter.getActiveLearningState
  let loop: PollLoop | null = null
  /** The Dataset on screen. A reply about any other is dropped. */
  let currentId: Id | null = null

  const activeLoop = computed(() => (state.value?.active ? state.value : null))

  function stopPolling() {
    loop?.stop()
    loop = null
  }

  function isRunning(value: typeof state.value) {
    return !!value?.active && ['training', 'scoring'].includes(value.round.status)
  }

  function pollIfRunning(datasetId: Id) {
    if (!isRunning(state.value) || loop) return
    const roundBefore = (state.value as ActiveLearningState).round.number
    loop = createPollLoop(async () => {
      const next = await adapter.getActiveLearningState!(datasetId)
      if (datasetId !== currentId) return
      state.value = next
      if (isRunning(next)) return
      stopPolling()
      if (next.active && next.round.number > roundBefore) onReordered?.()
    }, pollIntervalMs)
    loop.start()
  }

  async function run(action: () => Promise<void>, fallback: string) {
    isBusy.value = true
    error.value = null
    try {
      await action()
    } catch (err) {
      error.value = err instanceof Error ? err.message : fallback
    } finally {
      isBusy.value = false
    }
  }

  async function refresh(datasetId: Id) {
    if (!supported) return
    if (datasetId !== currentId) stopPolling()
    currentId = datasetId
    await run(async () => {
      const next = await adapter.getActiveLearningState!(datasetId)
      if (datasetId !== currentId) return
      state.value = next
      settings.value ??= (await adapter.getActiveLearningSettings?.()) ?? null
      pollIfRunning(datasetId)
    }, 'Failed to load active learning')
  }

  /** After a saved label. A running poll already reads the state, and without a
   * loop there are no counts to update. */
  function refreshCounts(datasetId: Id) {
    if (!activeLoop.value || loop) return
    return refresh(datasetId)
  }

  function start(datasetId: Id, options: ActiveLearningStartOptions) {
    return run(async () => {
      state.value = await adapter.startActiveLearning!(datasetId, options)
    }, 'Failed to start active learning')
  }

  function setStrategy(datasetId: Id, strategy: string) {
    return run(async () => {
      state.value = await adapter.setActiveLearningStrategy!(datasetId, strategy)
    }, 'Failed to change how items are chosen')
  }

  function correctLabel(datasetId: Id, from: string, to: string) {
    return run(async () => {
      state.value = await adapter.correctActiveLearningLabel!(datasetId, from, to)
    }, 'Failed to correct the label')
  }

  function retrain(datasetId: Id) {
    return run(async () => {
      await adapter.retrainActiveLearning!(datasetId)
      state.value = await adapter.getActiveLearningState!(datasetId)
      pollIfRunning(datasetId)
    }, 'Failed to start training')
  }

  /** The check runs on the worker, so its result arrives through the state. */
  function verify(datasetId: Id) {
    return run(async () => {
      await adapter.verifyActiveLearning!(datasetId)
      stopPolling()
      let ticks = 0
      loop = createPollLoop(async () => {
        const next = await adapter.getActiveLearningState!(datasetId)
        if (datasetId !== currentId) return
        state.value = next
        ticks += 1
        const done = next.active && next.holdout.verification === 'holdout'
        if (!done && ticks < VERIFY_POLLS) return
        stopPolling()
        if (!done) error.value = 'The score could not be checked. Try again.'
      }, pollIntervalMs)
      loop.start()
    }, 'Failed to check the score')
  }

  onUnmounted(stopPolling)

  return { state, activeLoop, settings, error, isBusy, supported, refresh, refreshCounts, start, setStrategy, correctLabel, retrain, verify }
}
