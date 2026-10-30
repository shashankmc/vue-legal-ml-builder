<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue'
import { STRATEGY_COPY, retrainPrompt, verificationText } from '../annotation/activeLearning'
import { count } from '../annotation/annotationState'
import { useActiveLearning } from '../composables/useActiveLearning'
import type { Id, MLAdapter } from '../types'
import Icon from './shared/Icon.vue'

const props = defineProps<{
  adapter: MLAdapter
  datasetId: Id
  /** Items are on offer, so a loop has something to start on. */
  canStart: boolean
  /** Bumped by the host after each saved label, to refresh the counts. */
  labelsVersion: number
  /** The workspace is on held-back items. */
  labellingHoldout: boolean
}>()
const emit = defineEmits<{
  (e: 'started'): void
  (e: 'reordered'): void
  (e: 'label-holdout'): void
  (e: 'labels', labels: string[]): void
}>()

const pollInterval = inject<number>('vmlb:pollInterval', 3000)
const { state, activeLoop, settings, error, isBusy, refresh, start, setStrategy, retrain, verify } = useActiveLearning(
  props.adapter,
  pollInterval,
  () => emit('reordered'),
)

const strategy = ref('')
const holdoutOn = ref(true)
const holdoutPercent = ref(20)
const batchSize = ref(20)
const minPerClass = ref(5)

const prompt = computed(() => (activeLoop.value ? retrainPrompt(activeLoop.value) : null))
const verification = computed(() => (activeLoop.value ? verificationText(activeLoop.value) : ''))
const holdoutMissing = computed(() => {
  const holdout = activeLoop.value?.holdout
  return holdout ? Math.max(holdout.needed - holdout.labelled, 0) : 0
})
const holdoutToLabel = computed(() => {
  const holdout = activeLoop.value?.holdout
  return holdout ? holdout.size - holdout.labelled : 0
})
const canCheck = computed(() => {
  const loop = activeLoop.value
  return !!loop?.model_id && loop.holdout.size > 0 && !holdoutMissing.value && loop.holdout.verification !== 'holdout'
})

watch(settings, (value) => {
  if (!value) return
  strategy.value = value.default_strategy
  holdoutPercent.value = value.default_holdout_percent
  batchSize.value = value.default_batch_size
  minPerClass.value = value.min_per_class
})

watch(activeLoop, (value) => {
  if (value) emit('labels', Object.keys(value.label_counts))
})

onMounted(() => refresh(props.datasetId))
watch(() => props.labelsVersion, () => refresh(props.datasetId))
watch(() => props.datasetId, (id) => refresh(id))

async function onStart() {
  await start(props.datasetId, {
    strategy: strategy.value,
    batch_size: batchSize.value,
    min_per_class: minPerClass.value,
    holdout_percent: holdoutOn.value ? holdoutPercent.value : 0,
    seed_source: 'random',
  })
  if (activeLoop.value) emit('started')
}
</script>

<template>
  <section class="vmlb-card vmlb-al" aria-label="Active learning">
    <div v-if="error" class="vmlb-alert-error"><Icon name="alert" /> {{ error }}</div>

    <template v-if="state && !state.active && settings && canStart">
      <h2 class="vmlb-al-title">Let the Model choose what to label next</h2>
      <p class="vmlb-muted">
        Label a first batch in random order. After that, retrain when you are ready and the items that help most come
        first.
      </p>
      <details class="vmlb-al-advanced">
        <summary>Advanced</summary>
        <fieldset>
          <legend class="vmlb-label">First batch</legend>
          <label><input type="radio" checked name="vmlb-seed" /> Random</label>
          <label class="vmlb-muted">
            <input type="radio" name="vmlb-seed" disabled /> Suggested by an LLM (not available yet)
          </label>
        </fieldset>
        <fieldset>
          <legend class="vmlb-label">After the first batch</legend>
          <label v-for="name in settings.strategies" :key="name">
            <input v-model="strategy" type="radio" name="vmlb-strategy" :value="name" />
            {{ STRATEGY_COPY[name]?.label ?? name }}
            <span class="vmlb-muted">{{ STRATEGY_COPY[name]?.description }}</span>
          </label>
        </fieldset>
        <fieldset>
          <legend class="vmlb-label">Checking the Model</legend>
          <label><input v-model="holdoutOn" type="checkbox" /> Hold back items to check the Model</label>
          <label v-if="holdoutOn">
            Share held back
            <input v-model.number="holdoutPercent" type="number" min="1" :max="settings.max_holdout_percent" /> %
          </label>
          <p v-else class="vmlb-muted">Without held-back items, the Model reads "Not independently verified".</p>
        </fieldset>
        <fieldset>
          <legend class="vmlb-label">Pace</legend>
          <label>New labels before the retrain prompt <input v-model.number="batchSize" type="number" min="1" /></label>
          <label>
            Minimum examples of each label
            <input v-model.number="minPerClass" type="number" :min="settings.min_per_class" />
          </label>
        </fieldset>
      </details>
      <button class="vmlb-btn-primary" :disabled="isBusy" @click="onStart">Start</button>
    </template>

    <template v-else-if="activeLoop">
      <div class="vmlb-al-head">
        <h2 class="vmlb-al-title">
          {{ activeLoop.round.number === 0 ? 'First batch' : `Round ${activeLoop.round.number}` }}
        </h2>
        <label class="vmlb-al-strategy vmlb-muted">
          Next retrain:
          <select :value="activeLoop.strategy" :disabled="isBusy" @change="setStrategy(datasetId, ($event.target as HTMLSelectElement).value)">
            <option v-for="name in settings?.strategies ?? [activeLoop.strategy]" :key="name" :value="name">
              {{ STRATEGY_COPY[name]?.label ?? name }}
            </option>
          </select>
        </label>
      </div>

      <div v-if="activeLoop.round.error" class="vmlb-alert-error"><Icon name="alert" /> {{ activeLoop.round.error }}</div>

      <div v-if="prompt?.message" class="vmlb-al-prompt" :class="{ 'vmlb-al-prompt-ask': prompt.emphasised }">
        <span>{{ prompt.message }}</span>
        <button v-if="prompt.canRetrain" :class="prompt.emphasised ? 'vmlb-btn-primary' : 'vmlb-btn-secondary'" :disabled="isBusy" @click="retrain(datasetId)">
          Retrain
        </button>
      </div>

      <div class="vmlb-al-holdout">
        <span v-if="verification" class="vmlb-badge" :class="{ 'vmlb-al-unverified': activeLoop.holdout.verification !== 'holdout' }">{{ verification }}</span>
        <span v-if="activeLoop.holdout.size" class="vmlb-muted">
          {{ activeLoop.holdout.labelled }} of {{ count(activeLoop.holdout.size, 'held-back item') }} labelled
        </span>
        <span v-else class="vmlb-muted">No items are held back.</span>
        <button v-if="holdoutToLabel && !labellingHoldout" class="vmlb-btn-tertiary" @click="emit('label-holdout')">
          Label held-back items
        </button>
        <button v-if="canCheck" class="vmlb-btn-secondary" :disabled="isBusy" @click="verify(datasetId)">Check the score</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.vmlb-al { margin-bottom: 1.25rem; padding: 1.25rem 1.5rem; }
.vmlb-al-title { margin: 0 0 0.35rem; font-size: 1rem; font-weight: 600; }
.vmlb-al-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 0.5rem 1rem; }
.vmlb-al-strategy { font-size: 0.8125rem; }
.vmlb-al-strategy select { font: inherit; color: var(--vmlb-text); background: var(--vmlb-surface); border: 1px solid var(--vmlb-border-strong); border-radius: var(--vmlb-radius-sm); padding: 0.1rem 0.25rem; }
.vmlb-al-prompt { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; margin-top: 0.75rem; font-size: 0.875rem; }
.vmlb-al-prompt-ask { padding: 0.65rem 0.85rem; border-radius: var(--vmlb-radius-md); background: var(--vmlb-accent-soft); font-weight: 600; }
.vmlb-al-holdout { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.85rem; margin-top: 0.75rem; font-size: 0.8125rem; }
.vmlb-al-unverified { background: var(--vmlb-surface-sunken); color: var(--vmlb-text); }
.vmlb-al-advanced { margin: 0.75rem 0; font-size: 0.875rem; }
.vmlb-al-advanced summary { cursor: pointer; font-weight: 600; }
.vmlb-al-advanced fieldset { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.75rem 0 0; padding: 0; border: 0; }
.vmlb-al-advanced input[type='number'] { width: 4.5rem; padding: 0.15rem 0.3rem; font: inherit; }
</style>
