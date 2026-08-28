<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import type { MLAdapter } from '../types'
import { useAnnotation } from '../composables/useAnnotation'

const props = defineProps<{ adapter?: MLAdapter; projectId: string; datasetId?: string; labels?: string[] }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { task, stats, isLoading, error, loadNext, save, skip } = useAnnotation(adapter.value as MLAdapter)

const customLabel = ref('')

onMounted(() => loadNext(props.projectId, props.datasetId))

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
  <div class="vmlb-annotate">
    <div v-if="stats" class="vmlb-progress">
      <div class="vmlb-progress-bar"><div class="vmlb-progress-fill" :style="{ width: `${stats.percentage}%` }" /></div>
      <span class="vmlb-muted">{{ stats.annotated }} / {{ stats.total }} annotated ({{ stats.percentage }}%)</span>
    </div>

    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>
    <div v-if="isLoading" class="vmlb-spinner-wrap"><div class="vmlb-spinner" /></div>

    <div v-else-if="!task" class="vmlb-empty">
      <p>All items annotated 🎉</p>
    </div>

    <div v-else class="vmlb-card">
      <p class="vmlb-text">{{ task.text }}</p>

      <div v-if="labels?.length" class="vmlb-label-grid">
        <button v-for="label in labels" :key="label" class="vmlb-label-btn" @click="onSelectLabel(label)">{{ label }}</button>
      </div>
      <div v-else class="vmlb-custom-label">
        <input v-model="customLabel" type="text" placeholder="Type a label…" @keydown.enter="onSaveCustom" />
        <button class="vmlb-btn-primary" @click="onSaveCustom">Save</button>
      </div>

      <button class="vmlb-btn-secondary vmlb-skip" @click="onSkip">Skip</button>
    </div>
  </div>
</template>

<style scoped>
.vmlb-progress { margin-bottom: 1.5rem; }
.vmlb-progress-bar { width: 100%; height: 0.5rem; background: #e5e7eb; border-radius: 999px; overflow: hidden; margin-bottom: 0.375rem; }
.vmlb-progress-fill { height: 100%; background: var(--vmlb-primary, #4f46e5); transition: width 0.3s; }
.vmlb-card { background: var(--vmlb-surface, #fff); border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.75rem; padding: 1.5rem; }
.vmlb-text { font-size: 1rem; line-height: 1.6; margin-bottom: 1.5rem; white-space: pre-wrap; }
.vmlb-label-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
.vmlb-label-btn { padding: 0.5rem 1rem; border-radius: 999px; border: 1px solid var(--vmlb-border, #d1d5db); background: #fff; cursor: pointer; font-size: 0.875rem; }
.vmlb-label-btn:hover { border-color: var(--vmlb-primary, #4f46e5); color: var(--vmlb-primary, #4f46e5); }
.vmlb-custom-label { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.vmlb-custom-label input { flex: 1; border: 1px solid var(--vmlb-border, #d1d5db); border-radius: 0.5rem; padding: 0.5rem 0.75rem; }
.vmlb-skip { margin-top: 0.5rem; }
.vmlb-btn-primary, .vmlb-btn-secondary { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; border: 1px solid transparent; }
.vmlb-btn-primary { background: var(--vmlb-primary, #4f46e5); color: #fff; }
.vmlb-btn-secondary { background: #fff; color: #374151; border-color: var(--vmlb-border, #d1d5db); }
.vmlb-empty { text-align: center; padding: 3rem 0; color: var(--vmlb-text-muted, #6b7280); font-size: 1.125rem; }
.vmlb-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-muted { color: var(--vmlb-text-muted, #6b7280); font-size: 0.8125rem; }
.vmlb-spinner-wrap { display: flex; justify-content: center; padding: 3rem 0; }
.vmlb-spinner { width: 2.5rem; height: 2.5rem; border-radius: 999px; border: 3px solid #e5e7eb; border-bottom-color: var(--vmlb-primary, #4f46e5); animation: vmlb-spin 0.7s linear infinite; }
@keyframes vmlb-spin { to { transform: rotate(360deg); } }
</style>
