<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import type { MLAdapter } from '../types'
import { useTraining } from '../composables/useTraining'
import { numericMetric } from '../utils/metrics'
import ConfusionMatrix from './shared/ConfusionMatrix.vue'
import TrainingCurves from './TrainingCurves.vue'
import Icon from './shared/Icon.vue'

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
    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>

    <!-- In progress -->
    <div v-if="isTraining" class="vmlb-card vmlb-railed">
      <h3 class="vmlb-card-title">Training in progress</h3>
      <div class="vmlb-milestones">
        <div v-for="(m, i) in MILESTONES" :key="m.label" class="vmlb-milestone">
          <div
            class="vmlb-milestone-dot"
            :class="{ done: milestoneState(m.pct, i).done, active: milestoneState(m.pct, i).active }"
          >
            <Icon v-if="milestoneState(m.pct, i).done" name="check" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <span class="vmlb-muted">{{ m.label }}</span>
        </div>
      </div>
      <TrainingCurves v-if="job" :adapter="adapter ?? undefined" :job-id="job.id" :job-status="job.status" />
    </div>

    <!-- Ready to train -->
    <div v-else-if="model?.status === 'pending'" class="vmlb-card">
      <h3 class="vmlb-card-title">Ready to start?</h3>
      <p class="vmlb-muted">
        Begin training <strong>{{ model.name }}</strong> ({{ model.model_type.replace(/_/g, ' ') }}).
      </p>
      <button class="vmlb-btn-primary vmlb-train-start" :disabled="isStarting" @click="onStart">
        <Icon name="play" /> {{ isStarting ? 'Starting…' : 'Start training' }}
      </button>
    </div>

    <!-- Completed -->
    <div v-else-if="model?.status === 'completed'" class="vmlb-card">
      <h3 class="vmlb-card-title">Training complete</h3>
      <div v-if="model.metrics" class="vmlb-metrics-grid">
        <div v-if="numericMetric(model.metrics, 'accuracy') !== undefined" class="vmlb-metric">
          <span class="vmlb-label">Accuracy</span>
          <strong class="vmlb-num">{{ (numericMetric(model.metrics, 'accuracy')! * 100).toFixed(2) }}%</strong>
        </div>
        <div v-if="numericMetric(model.metrics, 'precision') !== undefined" class="vmlb-metric">
          <span class="vmlb-label">Precision</span>
          <strong class="vmlb-num">{{ (numericMetric(model.metrics, 'precision')! * 100).toFixed(2) }}%</strong>
        </div>
        <div v-if="numericMetric(model.metrics, 'recall') !== undefined" class="vmlb-metric">
          <span class="vmlb-label">Recall</span>
          <strong class="vmlb-num">{{ (numericMetric(model.metrics, 'recall')! * 100).toFixed(2) }}%</strong>
        </div>
        <div v-if="numericMetric(model.metrics, 'f1_score') !== undefined" class="vmlb-metric">
          <span class="vmlb-label">F1</span>
          <strong class="vmlb-num">{{ (numericMetric(model.metrics, 'f1_score')! * 100).toFixed(2) }}%</strong>
        </div>
      </div>
      <ConfusionMatrix
        v-if="(model.metrics as any)?.confusion_matrix"
        :matrix="(model.metrics as any).confusion_matrix"
        :labels="(model.metrics as any).confusion_matrix_labels ?? null"
        :classification-report="(model.metrics as any).classification_report ?? null"
      />
    </div>

    <!-- Failed -->
    <div v-else-if="model?.status === 'failed'" class="vmlb-card vmlb-railed vmlb-railed-error">
      <h3 class="vmlb-card-title">Training failed</h3>
      <p class="vmlb-muted">{{ job?.error_message || 'The training process stopped before finishing.' }}</p>
      <button class="vmlb-btn-primary vmlb-train-start" :disabled="isStarting" @click="onStart">Retry training</button>
    </div>
  </div>
</template>

<style scoped>
.vmlb-train { max-width: 62rem; margin: 0 auto; }
.vmlb-railed { border-left: 3px solid var(--vmlb-accent); }
.vmlb-railed-error { border-left-color: var(--vmlb-error); }
.vmlb-milestones { display: flex; gap: 0.5rem; margin: 1.25rem 0; }
.vmlb-milestone { display: flex; flex-direction: column; align-items: center; gap: 0.375rem; flex: 1; }
.vmlb-milestone-dot {
  display: flex; align-items: center; justify-content: center;
  width: 1.9rem; height: 1.9rem; border-radius: 50%;
  background: var(--vmlb-surface-sunken); color: var(--vmlb-text-subtle);
  font-size: 0.8125rem; font-weight: 600;
  border: 1px solid var(--vmlb-border);
}
.vmlb-milestone-dot.done { background: var(--vmlb-accent); color: var(--vmlb-on-accent); border-color: var(--vmlb-accent); }
.vmlb-milestone-dot.active { background: var(--vmlb-surface); border-color: var(--vmlb-accent); color: var(--vmlb-accent-strong); }
.vmlb-metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
.vmlb-metric {
  display: flex; flex-direction: column; gap: 0.25rem;
  padding: 0.75rem 1rem;
  background: var(--vmlb-surface-sunken);
  border-left: 2px solid var(--vmlb-accent);
  border-radius: var(--vmlb-radius-sm);
}
.vmlb-metric strong { font-size: 1.375rem; font-weight: 600; }
.vmlb-train-start { margin-top: 0.75rem; }
</style>
