<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import type { MLAdapter } from '../types'
import { useParameterComparison } from '../composables/useParameterComparison'
import { parameterSchemas } from './modelCatalogData'
import PlotlyChart from './shared/PlotlyChart.vue'
import Icon from './shared/Icon.vue'

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
    <div class="vmlb-explorer-head">
      <h2 class="vmlb-display">Parameter explorer</h2>
      <div class="vmlb-controls">
        <label>
          <span class="vmlb-label">Parameter</span>
          <select v-model="selectedParam" class="vmlb-input">
            <option v-for="key in parameterKeys" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
        <label>
          <span class="vmlb-label">Metric</span>
          <select v-model="metric" class="vmlb-input">
            <option value="accuracy">accuracy</option>
            <option value="precision">precision</option>
            <option value="recall">recall</option>
            <option value="f1_score">f1_score</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>
    <div v-if="isLoading" class="vmlb-skeleton vmlb-skeleton-chart" />

    <template v-else>
      <div v-if="points.length < 2" class="vmlb-empty">
        <Icon name="chart" size="2rem" class="vmlb-empty-icon" />
        <p class="vmlb-empty-title">Not enough runs yet</p>
        <p>Train at least 2 {{ modelType }} models to see how {{ selectedParam || 'a parameter' }} affects {{ metric }}.</p>
      </div>
      <template v-else>
        <PlotlyChart v-if="plotData" :plot-data="plotData" plot-id="vmlb-param-explorer" />
        <p v-if="paramExplanation" class="vmlb-explorer-note">{{ paramExplanation }}</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.vmlb-explorer { max-width: 62rem; margin: 0 auto; }
.vmlb-explorer-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.vmlb-explorer-head h2 { margin: 0; font-size: 1.75rem; }
.vmlb-controls { display: flex; gap: 1rem; }
.vmlb-controls label { display: flex; flex-direction: column; gap: 0.375rem; }
.vmlb-controls select { min-width: 9rem; }
.vmlb-explorer-note {
  margin-top: 0.75rem; padding: 0.75rem 1rem;
  background: var(--vmlb-surface-sunken);
  border-left: 2px solid var(--vmlb-accent);
  border-radius: var(--vmlb-radius-sm);
  font-size: 0.8125rem; color: var(--vmlb-text-muted); line-height: 1.55;
}
</style>
