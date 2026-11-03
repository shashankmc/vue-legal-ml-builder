<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import type { MLAdapter, TrainingCurvesOptions } from '../types'
import { useTraining } from '../composables/useTraining'
import { numericMetric } from '../utils/metrics'
import ConfusionMatrix from './shared/ConfusionMatrix.vue'
import TrainingCurves from './TrainingCurves.vue'
import Icon from './shared/Icon.vue'

const props = withDefaults(
  defineProps<{ adapter?: MLAdapter; modelId: string; jobId?: string } & TrainingCurvesOptions>(),
  // Left unset, not false, so TrainingCurves can apply an app-wide default.
  { logScale: undefined },
)
// The curve settings, passed through to TrainingCurves.
const curveOptions = computed<TrainingCurvesOptions>(() => ({
  metrics: props.metrics,
  groupBy: props.groupBy,
  xAxis: props.xAxis,
  pollIntervalMs: props.pollIntervalMs,
  smoothing: props.smoothing,
  logScale: props.logScale,
}))
const emit = defineEmits<{ complete: []; stopped: [] }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { job, model, isStarting, isStopping, error, start, loadStatus, stop, stopPolling } = useTraining(adapter.value as MLAdapter)
// Stop asks first, inline, so the component needs no dialog from its host.
const confirmingStop = ref(false)
// A run that ended before the stop arrived, so the host is not told it stopped.
const endedFirst = ref(false)

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
// The server marks a stopped run's Model as failed; the job says it was stopped.
const wasStopped = computed(() => job.value?.status === 'cancelled')

async function onStart() {
  endedFirst.value = false
  await start(props.modelId)
}

async function onConfirmStop() {
  confirmingStop.value = false
  const outcome = await stop()
  if (outcome === 'stopped') emit('stopped')
  if (outcome === 'finished') endedFirst.value = true
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
    <p v-if="endedFirst" class="vmlb-muted" role="status">This run had already ended before it could be stopped.</p>

    <!-- In progress -->
    <div v-if="isTraining" class="vmlb-card vmlb-railed">
      <div class="vmlb-train-head">
        <h3 class="vmlb-card-title">Training in progress</h3>
        <button
          v-if="!confirmingStop"
          type="button"
          class="vmlb-btn-secondary"
          :disabled="isStopping"
          @click="confirmingStop = true"
        >
          <Icon name="close" /> {{ isStopping ? 'Stopping…' : 'Stop training' }}
        </button>
      </div>
      <div v-if="confirmingStop" class="vmlb-stop-confirm" role="group" aria-label="Stop this run?">
        <p><strong>Stop this run?</strong> It ends now and gives no results. You can train again at any time.</p>
        <div class="vmlb-stop-actions">
          <button type="button" class="vmlb-btn-primary vmlb-btn-danger" @click="onConfirmStop">Stop training</button>
          <button type="button" class="vmlb-btn-secondary" @click="confirmingStop = false">Keep training</button>
        </div>
      </div>
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
      <TrainingCurves v-if="job" v-bind="curveOptions" :adapter="adapter ?? undefined" :job-id="job.id" :job-status="job.status" />
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

    <!-- Stopped by the user -->
    <div v-else-if="wasStopped" class="vmlb-card vmlb-railed">
      <h3 class="vmlb-card-title">Training stopped</h3>
      <p class="vmlb-muted">You stopped this run before it finished. Train again when you are ready.</p>
      <button class="vmlb-btn-primary vmlb-train-start" :disabled="isStarting" @click="onStart">
        <Icon name="play" /> {{ isStarting ? 'Starting…' : 'Train again' }}
      </button>
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
.vmlb-train-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; }
.vmlb-stop-confirm { margin-top: 0.75rem; padding: 0.75rem 1rem; border-radius: var(--vmlb-radius-md); background: var(--vmlb-error-soft); }
.vmlb-stop-confirm p { margin: 0 0 0.5rem; }
.vmlb-stop-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.vmlb-btn-danger { background: var(--vmlb-error); border-color: var(--vmlb-error); }
.vmlb-btn-danger:hover:not(:disabled) { background: var(--vmlb-error); filter: brightness(0.92); }
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
