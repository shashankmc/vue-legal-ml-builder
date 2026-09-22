<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import type { MLAdapter } from '../types'
import { useTrainingCurves } from '../composables/useTrainingCurves'
import PlotlyChart from './shared/PlotlyChart.vue'
import Icon from './shared/Icon.vue'

const props = defineProps<{ adapter?: MLAdapter; jobId: string; jobStatus?: string }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { points, byMetric, start, stop, fetchNew } = useTrainingCurves(adapter.value as MLAdapter)

const error = ref('')

const isSettled = computed(() => ['completed', 'failed', 'cancelled'].includes(props.jobStatus ?? ''))
const hasDenseCurve = computed(() => Object.values(byMetric.value).some((series) => series.length > 3))

const plotData = computed(() => {
  const traces = Object.entries(byMetric.value).map(([name, series]) => ({
    x: series.map((p) => p.epoch ?? p.step),
    y: series.map((p) => p.value),
    mode: 'lines+markers',
    name,
  }))
  return { data: traces, layout: { title: 'Training metrics', xaxis: { title: 'step / epoch' }, yaxis: { title: 'value' }, height: 360 } }
})

onMounted(async () => {
  if (!adapter.value) {
    error.value = 'No adapter configured'
    return
  }
  await fetchNew(props.jobId)
  if (!isSettled.value) start(props.jobId, () => isSettled.value)
})

watch(
  () => props.jobStatus,
  (status) => {
    if (status && ['completed', 'failed', 'cancelled'].includes(status)) stop()
  },
)

onUnmounted(stop)
</script>

<template>
  <div class="vmlb-curves">
    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>
    <template v-else>
      <p v-if="points.length === 0" class="vmlb-waiting">
        <Icon name="spark" /> Waiting for the first metric point…
      </p>
      <template v-else>
        <PlotlyChart :plot-data="plotData" plot-id="vmlb-training-curves" />
        <p v-if="!hasDenseCurve" class="vmlb-hint">
          This model type logs coarse phase markers (preprocessing/training start-done), not a dense
          per-step curve — that level of detail is only available for LegalBERT/RoBERTa fine-tuning.
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.vmlb-curves { display: flex; flex-direction: column; gap: 0.5rem; }
.vmlb-waiting {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 1rem; border-radius: var(--vmlb-radius-md);
  background: var(--vmlb-surface-sunken); color: var(--vmlb-text-muted); font-size: 0.875rem;
}
</style>
