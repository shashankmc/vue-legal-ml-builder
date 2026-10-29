<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import type { MLAdapter } from '../types'
import { useAnnotation } from '../composables/useAnnotation'
import Icon from './shared/Icon.vue'

const props = withDefaults(defineProps<{
  adapter?: MLAdapter
  projectId: string
  datasetId?: string
  labels?: string[]
  /** Hide this view and skip every annotation operation (hosts with their own
   * annotation, e.g. Legal Blocks). Defaults to the plugin's `hideAnnotation`. */
  hideAnnotation?: boolean
}>(), { hideAnnotation: undefined })

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const injectedHide = inject<boolean>('vmlb:hideAnnotation', false)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const hidden = computed(() => props.hideAnnotation ?? injectedHide)
const { task, stats, isLoading, error, loadNext, save, skip } = useAnnotation(adapter.value as MLAdapter)

const customLabel = ref('')

onMounted(() => {
  if (!hidden.value) loadNext(props.projectId, props.datasetId)
})

async function onSelectLabel(label: string) {
  await save(label, props.projectId, props.datasetId)
}

async function onSaveCustom() {
  if (!customLabel.value.trim()) return
  await save(customLabel.value.trim(), props.projectId, props.datasetId)
  customLabel.value = ''
}

async function onSkip() {
  await skip(props.projectId, props.datasetId)
}
</script>

<template>
  <div v-if="!hidden" class="vmlb-annotate">
    <div v-if="stats" class="vmlb-progress">
      <div class="vmlb-progress-head">
        <span class="vmlb-label">Annotation progress</span>
        <span class="vmlb-muted vmlb-num">{{ stats.annotated }} / {{ stats.total }} · {{ stats.percentage }}%</span>
      </div>
      <div class="vmlb-progress-bar">
        <div class="vmlb-progress-fill" :style="{ transform: `scaleX(${stats.percentage / 100})` }" />
      </div>
    </div>

    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>
    <div v-if="isLoading" class="vmlb-annotation-skeleton">
      <div class="vmlb-skeleton vmlb-skeleton-line" style="width: 90%" />
      <div class="vmlb-skeleton vmlb-skeleton-line" style="width: 75%" />
      <div class="vmlb-skeleton vmlb-skeleton-tile" />
    </div>

    <div v-else-if="!task" class="vmlb-empty">
      <Icon name="check" size="2rem" class="vmlb-empty-icon" />
      <p class="vmlb-empty-title">Every item is annotated</p>
      <p>Nothing left to label in this dataset.</p>
    </div>

    <div v-else class="vmlb-card vmlb-annotation-card">
      <p class="vmlb-text">{{ task.text }}</p>

      <div v-if="labels?.length" class="vmlb-label-grid">
        <button v-for="label in labels" :key="label" class="vmlb-label-btn" @click="onSelectLabel(label)">
          {{ label }}
        </button>
      </div>
      <div v-else class="vmlb-custom-label">
        <input v-model="customLabel" type="text" placeholder="Type a label…" @keydown.enter="onSaveCustom" />
        <button class="vmlb-btn-primary" @click="onSaveCustom">Save</button>
      </div>

      <button class="vmlb-btn-tertiary vmlb-skip" @click="onSkip">Skip this item</button>
    </div>
  </div>
</template>

<style scoped>
.vmlb-annotate { max-width: 48rem; margin: 0 auto; }
.vmlb-progress { margin-bottom: 1.75rem; }
.vmlb-progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.4rem; }
.vmlb-progress-bar {
  width: 100%; height: 0.5rem; overflow: hidden;
  background: var(--vmlb-surface-sunken);
  border-radius: 999px;
  border: 1px solid var(--vmlb-border);
}
.vmlb-progress-fill {
  width: 100%; height: 100%;
  background: var(--vmlb-accent);
  transform-origin: left center;
  transition: transform 0.35s var(--vmlb-ease);
}
.vmlb-annotation-skeleton { display: flex; flex-direction: column; gap: 0.75rem; }
.vmlb-annotation-card { padding: 2rem; }
.vmlb-text {
  margin: 0 0 1.75rem;
  font-family: var(--vmlb-font-display);
  font-size: 1.1875rem;
  line-height: 1.7;
  max-width: 62ch;
  white-space: pre-wrap;
}
.vmlb-label-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; }
.vmlb-label-btn {
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--vmlb-border-strong);
  border-radius: var(--vmlb-radius-md);
  background: var(--vmlb-surface);
  color: var(--vmlb-text);
  font-family: inherit; font-size: 0.875rem; font-weight: 500;
  cursor: pointer;
  transition: border-color var(--vmlb-duration) var(--vmlb-ease),
    background-color var(--vmlb-duration) var(--vmlb-ease),
    color var(--vmlb-duration) var(--vmlb-ease),
    transform var(--vmlb-duration) var(--vmlb-ease);
}
.vmlb-label-btn:hover {
  border-color: var(--vmlb-accent);
  background: var(--vmlb-accent-soft);
  color: var(--vmlb-accent-strong);
  transform: translateY(-1px);
}
.vmlb-label-btn:active { transform: scale(0.98); }
.vmlb-custom-label { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
.vmlb-custom-label input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vmlb-border-strong);
  border-radius: var(--vmlb-radius-md);
  background: var(--vmlb-surface); color: var(--vmlb-text);
  font-family: inherit; font-size: 0.875rem;
}
.vmlb-custom-label input:focus { outline: none; border-color: var(--vmlb-accent); box-shadow: 0 0 0 3px var(--vmlb-accent-soft); }
.vmlb-skip { font-size: 0.8125rem; }
</style>
