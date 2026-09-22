<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import type { MLAdapter, MlModel } from '../types'
import { useModels } from '../composables/useModels'
import { numericMetric } from '../utils/metrics'
import Icon from './shared/Icon.vue'

const props = defineProps<{ adapter?: MLAdapter; datasetId?: string }>()
const emit = defineEmits<{ view: [model: MlModel]; train: [model: MlModel]; create: [] }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { models, isLoading, error, load, remove, stopPolling } = useModels(adapter.value as MLAdapter)

onMounted(() => load(props.datasetId))
onUnmounted(stopPolling)

const confirmingId = ref<string | null>(null)

const statusClass: Record<string, string> = {
  completed: 'vmlb-status-completed',
  training: 'vmlb-status-training',
  pending: 'vmlb-status-pending',
  failed: 'vmlb-status-failed',
}

async function onDelete(id: string) {
  await remove(id)
  confirmingId.value = null
}
</script>

<template>
  <div class="vmlb-list">
    <div class="vmlb-list-header">
      <div>
        <h2 class="vmlb-display">Models</h2>
        <p class="vmlb-muted">Configure, train, and inspect a model per dataset.</p>
      </div>
      <button class="vmlb-btn-primary" @click="emit('create')">
        <Icon name="model" /> Create model
      </button>
    </div>

    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>

    <div v-if="isLoading" class="vmlb-grid" aria-label="Loading models">
      <div v-for="i in 3" :key="i" class="vmlb-skeleton vmlb-skeleton-tile" />
    </div>

    <div v-else-if="models.length === 0" class="vmlb-empty">
      <Icon name="model" size="2rem" class="vmlb-empty-icon" />
      <p class="vmlb-empty-title">No models yet</p>
      <p>Create your first model to start classifying legal text.</p>
      <button class="vmlb-btn-primary" @click="emit('create')">Create your first model</button>
    </div>

    <div v-else class="vmlb-grid">
      <article v-for="model in models" :key="model.id" class="vmlb-tile">
        <div class="vmlb-tile-head">
          <div>
            <h3>{{ model.name }}</h3>
            <p class="vmlb-muted vmlb-capitalize">{{ model.model_type.replace(/_/g, ' ') }}</p>
          </div>
          <button class="vmlb-icon-btn" title="Delete model" @click="confirmingId = model.id">
            <Icon name="close" />
          </button>
        </div>

        <div class="vmlb-tile-body">
          <div class="vmlb-row">
            <span class="vmlb-muted">Status</span>
            <span class="vmlb-status" :class="statusClass[model.status]">{{ model.status }}</span>
          </div>
          <div class="vmlb-row">
            <span class="vmlb-muted">Created</span>
            <span>{{ new Date(model.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) }}</span>
          </div>
          <div v-if="numericMetric(model.metrics, 'accuracy') !== undefined" class="vmlb-row">
            <span class="vmlb-muted">Accuracy</span>
            <span class="vmlb-num">{{ (numericMetric(model.metrics, 'accuracy')! * 100).toFixed(1) }}%</span>
          </div>
        </div>

        <div v-if="confirmingId === model.id" class="vmlb-confirm">
          <span>Delete this model?</span>
          <div class="vmlb-confirm-actions">
            <button class="vmlb-btn-tertiary" @click="confirmingId = null">Cancel</button>
            <button class="vmlb-btn-primary" @click="onDelete(model.id)">Delete</button>
          </div>
        </div>
        <div v-else class="vmlb-tile-actions">
          <button class="vmlb-btn-secondary" @click="emit('view', model)">View</button>
          <button v-if="model.status === 'pending'" class="vmlb-btn-primary" @click="emit('train', model)">
            Train
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.vmlb-list-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
.vmlb-list-header h2 { margin: 0 0 0.25rem; font-size: 1.75rem; }
.vmlb-list-header .vmlb-muted { margin: 0; max-width: 48ch; }
.vmlb-capitalize { text-transform: capitalize; }
.vmlb-confirm {
  display: flex; flex-direction: column; gap: 0.5rem; margin-top: auto;
  padding-top: 0.75rem; border-top: 1px dashed var(--vmlb-border-strong);
  font-size: 0.8125rem; color: var(--vmlb-text-muted);
}
.vmlb-confirm-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
@media (max-width: 40rem) {
  .vmlb-list-header { flex-direction: column; align-items: flex-start; }
}
</style>
