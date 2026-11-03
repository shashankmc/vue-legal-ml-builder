<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import type { MLAdapter, TrainingCurvesOptions } from '../types'
import { useTrainingCurves } from '../composables/useTrainingCurves'
import { curveCharts, stageEvents } from '../utils/trainingCharts'
import PlotlyChart from './shared/PlotlyChart.vue'
import Icon from './shared/Icon.vue'

const props = withDefaults(
  defineProps<{
    adapter?: MLAdapter
    jobId: string
    jobStatus?: string
    /** Only these metric names are drawn. Default: every metric. */
    metrics?: string[]
    /** `group` (default) draws one chart per group; `none` draws every metric on one chart. */
    groupBy?: 'group' | 'none'
    /** `step` (default) or `epoch`. */
    xAxis?: 'step' | 'epoch'
    /** Moving-average weight from 0 (default, raw values) to just below 1. */
    smoothing?: number
    /** Draw values on a log scale. Default false. */
    logScale?: boolean
    /** How often a running job is polled for new points. Default 3000. */
    pollIntervalMs?: number
  }>(),
  // Left unset, not false, so an app-wide default can apply.
  { logScale: undefined },
)

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
// App-wide defaults; each prop the host sets overrides its own one.
const appDefaults = inject<TrainingCurvesOptions>('vmlb:monitoring', {})
const option = <K extends keyof TrainingCurvesOptions>(key: K): TrainingCurvesOptions[K] => props[key] ?? appDefaults[key]
const { points, start, stop, fetchNew } = useTrainingCurves(adapter.value as MLAdapter, option('pollIntervalMs') ?? 3000)

const error = ref('')

const isSettled = computed(() => ['completed', 'failed', 'cancelled'].includes(props.jobStatus ?? ''))

// One chart per group, so loss, learning rate and scores each get an axis that fits.
const charts = computed(() =>
  curveCharts(points.value, {
    metrics: option('metrics'),
    groupBy: option('groupBy'),
    xAxis: option('xAxis'),
    smoothing: option('smoothing'),
  }).map((chart) => ({
    group: chart.group,
    title: chart.title,
    plotData: {
      data: chart.series.map((s) => ({ x: s.x, y: s.y, mode: 'lines+markers', name: s.metric })),
      layout: {
        xaxis: { title: chart.xAxisTitle },
        yaxis: { title: 'value', ...(option('logScale') ? { type: 'log' } : {}) },
        height: 300,
      },
    },
  })),
)
const stages = computed(() => stageEvents(points.value))

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
        <ol v-if="stages.length" class="vmlb-stage-timeline" aria-label="Training stages">
          <li v-for="(stage, i) in stages" :key="`${stage.name}-${i}`" :data-stage="stage.name">
            <span class="vmlb-stage-dot" aria-hidden="true" />
            <span class="vmlb-stage-label">{{ stage.label }}</span>
          </li>
        </ol>
        <section v-for="chart in charts" :key="chart.group" class="vmlb-curves-chart" :data-group="chart.group">
          <h4>{{ chart.title }}</h4>
          <PlotlyChart :plot-data="chart.plotData" :plot-id="`vmlb-training-curves-${chart.group}`" />
        </section>
        <p v-if="!charts.length" class="vmlb-hint">
          This model type records its stages, not a step-by-step curve. Step-by-step curves are
          only available when fine-tuning LegalBERT or RoBERTa.
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.vmlb-curves { display: flex; flex-direction: column; gap: 0.5rem; }
.vmlb-curves-chart h4 { margin: 0.5rem 0 0; font-size: 0.875rem; color: var(--vmlb-text); }
.vmlb-stage-timeline {
  display: flex; flex-wrap: wrap; gap: 0.25rem 1rem;
  margin: 0; padding: 0; list-style: none; font-size: 0.8125rem; color: var(--vmlb-text-muted);
}
.vmlb-stage-timeline li { display: flex; align-items: center; gap: 0.375rem; }
.vmlb-stage-dot {
  width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--vmlb-accent);
}
.vmlb-waiting {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 1rem; border-radius: var(--vmlb-radius-md);
  background: var(--vmlb-surface-sunken); color: var(--vmlb-text-muted); font-size: 0.875rem;
}
</style>
