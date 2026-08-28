<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import type { MLAdapter } from '../types'
import { useParameterComparison } from '../composables/useParameterComparison'
import { parameterSchemas } from './modelCatalogData'
import PlotlyChart from './shared/PlotlyChart.vue'

const props = defineProps<{ adapter?: MLAdapter; modelType: string; metric?: string }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { points, isLoading, error, load } = useParameterComparison(adapter.value as MLAdapter)

const metric = ref(props.metric ?? 'accuracy')
const parameterKeys = computed(() => (parameterSchemas[props.modelType] || []).map((p) => p.key))
const selectedParam = ref(parameterKeys.value[0] ?? '')

async function refresh() {
  await load(props.modelType, metric.value)
  if (!selectedParam.value) selectedParam.value = parameterKeys.value[0] ?? ''
}
watch(() => [props.modelType, metric.value], refresh, { immediate: true })

const plotData = computed(() => {
  if (!selectedParam.value) return null
  const filtered = points.value.filter((p) => p.parameters[selectedParam.value] !== undefined)
  return {
    data: [
      {
        x: filtered.map((p) => p.parameters[selectedParam.value]),
        y: filtered.map((p) => p.metric_value),
        mode: 'markers',
        type: 'scatter',
        marker: { size: 10 },
      },
    ],
    layout: {
      title: `${selectedParam.value} vs. ${metric.value}`,
      xaxis: { title: selectedParam.value },
      yaxis: { title: metric.value },
      height: 360,
    },
  }
})

const paramExplanation = computed(() => {
  const schema = (parameterSchemas[props.modelType] || []).find((p) => p.key === selectedParam.value)
  return schema?.explanation ?? null
})
</script>

<template>
  <div class="vmlb-explorer">
    <div class="vmlb-controls">
      <label>
        Parameter
        <select v-model="selectedParam">
          <option v-for="key in parameterKeys" :key="key" :value="key">{{ key }}</option>
        </select>
      </label>
      <label>
        Metric
        <select v-model="metric">
          <option value="accuracy">accuracy</option>
          <option value="precision">precision</option>
          <option value="recall">recall</option>
          <option value="f1_score">f1_score</option>
        </select>
      </label>
    </div>

    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>
    <div v-if="isLoading" class="vmlb-spinner-wrap"><div class="vmlb-spinner" /></div>

    <template v-else>
      <p v-if="points.length < 2" class="vmlb-muted">
        Train at least 2 {{ modelType }} models to see how {{ selectedParam || 'a parameter' }} affects {{ metric }}.
      </p>
      <template v-else>
        <PlotlyChart v-if="plotData" :plot-data="plotData" plot-id="vmlb-param-explorer" />
        <p v-if="paramExplanation" class="vmlb-hint">{{ paramExplanation }}</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.vmlb-controls { display: flex; gap: 1rem; margin-bottom: 1rem; }
.vmlb-controls label { display: flex; flex-direction: column; font-size: 0.75rem; font-weight: 500; gap: 0.25rem; color: var(--vmlb-text-muted, #6b7280); }
.vmlb-controls select { border: 1px solid var(--vmlb-border, #d1d5db); border-radius: 0.375rem; padding: 0.375rem 0.5rem; font-size: 0.875rem; }
.vmlb-hint { font-size: 0.8125rem; color: var(--vmlb-text-muted, #6b7280); background: #eef2ff; border-radius: 0.5rem; padding: 0.75rem; margin-top: 0.75rem; }
.vmlb-muted { color: var(--vmlb-text-muted, #6b7280); font-size: 0.875rem; }
.vmlb-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-spinner-wrap { display: flex; justify-content: center; padding: 3rem 0; }
.vmlb-spinner { width: 2.5rem; height: 2.5rem; border-radius: 999px; border: 3px solid #e5e7eb; border-bottom-color: var(--vmlb-primary, #4f46e5); animation: vmlb-spin 0.7s linear infinite; }
@keyframes vmlb-spin { to { transform: rotate(360deg); } }
</style>
