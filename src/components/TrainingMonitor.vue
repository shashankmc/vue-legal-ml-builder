<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import type { MLAdapter } from '../types'
import { useTraining } from '../composables/useTraining'
import { numericMetric } from '../utils/metrics'
import ConfusionMatrix from './shared/ConfusionMatrix.vue'
import TrainingCurves from './TrainingCurves.vue'

const props = defineProps<{ adapter?: MLAdapter; modelId: string; jobId?: string }>()
const emit = defineEmits<{ complete: [] }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { job, model, isStarting, error, start, loadStatus, stopPolling } = useTraining(adapter.value as MLAdapter)

const MILESTONES = [
  { label: 'Queued', pct: 0 },
  { label: 'Preprocessing', pct: 25 },
  { label: 'Training', pct: 75 },
  { label: 'Complete', pct: 100 },
]

onMounted(async () => {
  if (props.jobId) {
    await loadStatus(props.jobId)
  } else if (!adapter.value) {
    return
  } else {
    model.value = await adapter.value.getModel(props.modelId)
  }
})
onUnmounted(stopPolling)

const progress = computed(() => job.value?.progress ?? 0)
const isTraining = computed(() => job.value ? ['pending', 'running'].includes(job.value.status) : false)

async function onStart() {
  await start(props.modelId)
}

function milestoneState(pct: number, index: number) {
  const done = progress.value >= pct
  const active = !done && (index === 0 || progress.value >= MILESTONES[index - 1].pct)
  return { done, active }
}
</script>

<template>
  <div class="vmlb-train">
    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>

    <!-- In progress -->
    <div v-if="isTraining" class="vmlb-card vmlb-card-info">
      <h3>Training in Progress</h3>
      <div class="vmlb-milestones">
        <div v-for="(m, i) in MILESTONES" :key="m.label" class="vmlb-milestone">
          <div class="vmlb-milestone-dot" :class="{ done: milestoneState(m.pct, i).done, active: milestoneState(m.pct, i).active }">
            {{ milestoneState(m.pct, i).done ? '✓' : i + 1 }}
          </div>
          <span class="vmlb-muted">{{ m.label }}</span>
        </div>
      </div>
      <TrainingCurves v-if="job" :adapter="adapter ?? undefined" :job-id="job.id" :job-status="job.status" />
    </div>

    <!-- Ready to train -->
    <div v-else-if="model?.status === 'pending'" class="vmlb-card">
      <h3>Ready to Start?</h3>
      <p class="vmlb-muted">Click below to begin training <strong>{{ model.name }}</strong> ({{ model.model_type }}).</p>
      <button class="vmlb-btn-primary" :disabled="isStarting" @click="onStart">
        {{ isStarting ? 'Starting…' : 'Start Training' }}
      </button>
    </div>

    <!-- Completed -->
    <div v-else-if="model?.status === 'completed'" class="vmlb-card">
      <h3>Training Complete</h3>
      <div v-if="model.metrics" class="vmlb-metrics-grid">
        <div v-if="numericMetric(model.metrics, 'accuracy') !== undefined" class="vmlb-metric"><span>Accuracy</span><strong>{{ (numericMetric(model.metrics, 'accuracy')! * 100).toFixed(2) }}%</strong></div>
        <div v-if="numericMetric(model.metrics, 'precision') !== undefined" class="vmlb-metric"><span>Precision</span><strong>{{ (numericMetric(model.metrics, 'precision')! * 100).toFixed(2) }}%</strong></div>
        <div v-if="numericMetric(model.metrics, 'recall') !== undefined" class="vmlb-metric"><span>Recall</span><strong>{{ (numericMetric(model.metrics, 'recall')! * 100).toFixed(2) }}%</strong></div>
        <div v-if="numericMetric(model.metrics, 'f1_score') !== undefined" class="vmlb-metric"><span>F1</span><strong>{{ (numericMetric(model.metrics, 'f1_score')! * 100).toFixed(2) }}%</strong></div>
      </div>
      <ConfusionMatrix
        v-if="(model.metrics as any)?.confusion_matrix"
        :matrix="(model.metrics as any).confusion_matrix"
        :labels="(model.metrics as any).confusion_matrix_labels ?? null"
        :classification-report="(model.metrics as any).classification_report ?? null"
      />
    </div>

    <!-- Failed -->
    <div v-else-if="model?.status === 'failed'" class="vmlb-card">
      <h3>Training Failed</h3>
      <p class="vmlb-muted">{{ job?.error_message || 'The training process encountered an error.' }}</p>
      <button class="vmlb-btn-primary" :disabled="isStarting" @click="onStart">Retry Training</button>
    </div>
  </div>
</template>

<style scoped>
.vmlb-card { background: var(--vmlb-surface, #fff); border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.75rem; padding: 1.5rem; }
.vmlb-card h3 { font-weight: 600; margin-bottom: 0.75rem; font-size: 1.125rem; }
.vmlb-card-info { border-color: #bfdbfe; background: #eff6ff; }
.vmlb-milestones { display: flex; gap: 0.5rem; margin: 1rem 0; }
.vmlb-milestone { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; flex: 1; }
.vmlb-milestone-dot { width: 2rem; height: 2rem; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 0.875rem; font-weight: 600; background: #e5e7eb; color: #9ca3af; }
.vmlb-milestone-dot.done { background: var(--vmlb-primary, #2563eb); color: #fff; }
.vmlb-milestone-dot.active { background: #fff; border: 2px solid var(--vmlb-primary, #2563eb); color: var(--vmlb-primary, #2563eb); }
.vmlb-metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
.vmlb-metric { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 0.5rem; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; }
.vmlb-metric span { font-size: 0.75rem; color: #16a34a; text-transform: uppercase; }
.vmlb-metric strong { font-size: 1.25rem; }
.vmlb-btn-primary { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; border: none; background: var(--vmlb-primary, #4f46e5); color: #fff; margin-top: 0.75rem; }
.vmlb-btn-primary:disabled { background: #d1d5db; cursor: not-allowed; }
.vmlb-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-muted { color: var(--vmlb-text-muted, #6b7280); }
</style>
