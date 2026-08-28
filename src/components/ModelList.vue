<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted } from 'vue'
import type { MLAdapter, MlModel } from '../types'
import { useModels } from '../composables/useModels'
import { numericMetric } from '../utils/metrics'

const props = defineProps<{ adapter?: MLAdapter; datasetId?: string }>()
const emit = defineEmits<{ view: [model: MlModel]; train: [model: MlModel]; create: [] }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { models, isLoading, error, load, remove, stopPolling } = useModels(adapter.value as MLAdapter)

onMounted(() => load(props.datasetId))
onUnmounted(stopPolling)

const statusClass: Record<string, string> = {
  completed: 'vmlb-status-completed',
  training: 'vmlb-status-training',
  pending: 'vmlb-status-pending',
  failed: 'vmlb-status-failed',
}

async function onDelete(id: string) {
  if (!confirm('Are you sure you want to delete this model?')) return
  await remove(id)
}
</script>

<template>
  <div class="vmlb-list">
    <div class="vmlb-list-header">
      <h2>Models</h2>
      <button class="vmlb-btn-primary" @click="emit('create')">+ Create Model</button>
    </div>

    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>
    <div v-if="isLoading" class="vmlb-spinner-wrap"><div class="vmlb-spinner" /></div>

    <div v-else-if="models.length === 0" class="vmlb-empty">
      <p>No models yet. Create your first machine learning model to start analyzing legal text data.</p>
      <button class="vmlb-btn-primary" @click="emit('create')">Create Your First Model</button>
    </div>

    <div v-else class="vmlb-grid">
      <div v-for="model in models" :key="model.id" class="vmlb-model-tile">
        <div class="vmlb-tile-head">
          <div>
            <h3>{{ model.name }}</h3>
            <p class="vmlb-muted">{{ model.model_type }}</p>
          </div>
          <button class="vmlb-icon-btn" title="Delete model" @click="onDelete(model.id)">✕</button>
        </div>

        <div class="vmlb-tile-body">
          <div class="vmlb-row">
            <span class="vmlb-muted">Status:</span>
            <span class="vmlb-status" :class="statusClass[model.status]">{{ model.status }}</span>
          </div>
          <div class="vmlb-row">
            <span class="vmlb-muted">Created:</span>
            <span>{{ new Date(model.created_at).toLocaleDateString() }}</span>
          </div>
          <div v-if="numericMetric(model.metrics, 'accuracy') !== undefined" class="vmlb-row">
            <span class="vmlb-muted">Accuracy:</span>
            <span>{{ (numericMetric(model.metrics, 'accuracy')! * 100).toFixed(1) }}%</span>
          </div>
        </div>

        <div class="vmlb-tile-actions">
          <button class="vmlb-btn-secondary" @click="emit('view', model)">View</button>
          <button v-if="model.status === 'pending'" class="vmlb-btn-primary" @click="emit('train', model)">Train</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vmlb-list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.vmlb-list-header h2 { font-size: 1.5rem; font-weight: 700; }
.vmlb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 1.25rem; }
.vmlb-model-tile { border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.75rem; padding: 1.25rem; background: var(--vmlb-surface, #fff); }
.vmlb-tile-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem; }
.vmlb-tile-head h3 { font-weight: 600; }
.vmlb-icon-btn { background: none; border: none; color: #9ca3af; cursor: pointer; }
.vmlb-icon-btn:hover { color: #dc2626; }
.vmlb-tile-body { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-row { display: flex; justify-content: space-between; }
.vmlb-status { padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 500; }
.vmlb-status-completed { background: #dcfce7; color: #15803d; }
.vmlb-status-training { background: #dbeafe; color: #1d4ed8; }
.vmlb-status-pending { background: #fef9c3; color: #a16207; }
.vmlb-status-failed { background: #fee2e2; color: #b91c1c; }
.vmlb-tile-actions { display: flex; gap: 0.5rem; }
.vmlb-tile-actions button { flex: 1; }
.vmlb-empty { text-align: center; padding: 3rem 0; color: var(--vmlb-text-muted, #6b7280); }
.vmlb-empty button { margin-top: 1rem; }
.vmlb-btn-primary, .vmlb-btn-secondary { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; border: 1px solid transparent; }
.vmlb-btn-primary { background: var(--vmlb-primary, #4f46e5); color: #fff; }
.vmlb-btn-secondary { background: #fff; color: #374151; border-color: var(--vmlb-border, #d1d5db); }
.vmlb-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-muted { color: var(--vmlb-text-muted, #6b7280); }
.vmlb-spinner-wrap { display: flex; justify-content: center; padding: 3rem 0; }
.vmlb-spinner { width: 2.5rem; height: 2.5rem; border-radius: 999px; border: 3px solid #e5e7eb; border-bottom-color: var(--vmlb-primary, #4f46e5); animation: vmlb-spin 0.7s linear infinite; }
@keyframes vmlb-spin { to { transform: rotate(360deg); } }
</style>
