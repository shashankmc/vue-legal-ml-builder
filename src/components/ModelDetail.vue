<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import type { MLAdapter, MlModel, PredictionResult } from '../types'
import ConfusionMatrix from './shared/ConfusionMatrix.vue'
import PlotlyChart from './shared/PlotlyChart.vue'

const props = defineProps<{ adapter?: MLAdapter; modelId: string }>()
const emit = defineEmits<{ train: [] }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)

const model = ref<MlModel | null>(null)
const performanceChart = ref<string | null>(null)
const isLoading = ref(true)
const error = ref('')

const predictText = ref('')
const predictResults = ref<PredictionResult[]>([])
const isPredicting = ref(false)

onMounted(async () => {
  if (!adapter.value) {
    error.value = 'No adapter configured'
    isLoading.value = false
    return
  }
  try {
    model.value = await adapter.value.getModel(props.modelId)
    if (model.value.status === 'completed') {
      try {
        const perf = await adapter.value.getModelPerformance(props.modelId)
        performanceChart.value = perf.performance_chart
      } catch {
        // performance chart is best-effort — model may not have Redis-cached metrics
      }
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load model'
  } finally {
    isLoading.value = false
  }
})

async function runPredict() {
  if (!adapter.value || !model.value || !predictText.value.trim()) return
  isPredicting.value = true
  try {
    predictResults.value = await adapter.value.predict(model.value.id, [predictText.value])
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Prediction failed'
  } finally {
    isPredicting.value = false
  }
}
</script>

<template>
  <div class="vmlb-detail">
    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>
    <div v-if="isLoading" class="vmlb-spinner-wrap"><div class="vmlb-spinner" /></div>

    <template v-else-if="model">
      <div class="vmlb-header">
        <div>
          <h2>{{ model.name }}</h2>
          <p class="vmlb-muted">{{ model.model_type }} · {{ model.status }}</p>
        </div>
        <button v-if="model.status === 'pending'" class="vmlb-btn-primary" @click="emit('train')">Train</button>
      </div>

      <div v-if="model.status === 'completed'">
        <div v-if="performanceChart" class="vmlb-card">
          <PlotlyChart :plot-data="performanceChart" plot-id="vmlb-model-performance" />
        </div>

        <div v-if="(model.metrics as any)?.confusion_matrix" class="vmlb-card">
          <ConfusionMatrix
            :matrix="(model.metrics as any).confusion_matrix"
            :labels="(model.metrics as any).confusion_matrix_labels ?? null"
            :classification-report="(model.metrics as any).classification_report ?? null"
          />
        </div>

        <div class="vmlb-card">
          <h3>Try a prediction</h3>
          <textarea v-model="predictText" rows="3" placeholder="Paste text to classify…" />
          <button class="vmlb-btn-primary" :disabled="isPredicting || !predictText.trim()" @click="runPredict">
            {{ isPredicting ? 'Predicting…' : 'Predict' }}
          </button>

          <div v-if="predictResults.length" class="vmlb-predictions">
            <div v-for="(r, i) in predictResults" :key="i" class="vmlb-prediction">
              <strong>{{ r.prediction }}</strong>
              <span v-if="r.confidence !== undefined" class="vmlb-muted"> ({{ (r.confidence * 100).toFixed(1) }}% confidence)</span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="vmlb-card">
        <p class="vmlb-muted">This model is {{ model.status }}. Train it to see performance and run predictions.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vmlb-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.vmlb-header h2 { font-size: 1.5rem; font-weight: 700; }
.vmlb-card { background: var(--vmlb-surface, #fff); border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.25rem; }
.vmlb-card h3 { font-weight: 600; margin-bottom: 0.75rem; }
.vmlb-card textarea { width: 100%; border: 1px solid var(--vmlb-border, #d1d5db); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; margin-bottom: 0.75rem; }
.vmlb-predictions { margin-top: 1rem; border-top: 1px solid var(--vmlb-border, #e5e7eb); padding-top: 1rem; }
.vmlb-prediction { padding: 0.375rem 0; }
.vmlb-btn-primary { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; border: none; background: var(--vmlb-primary, #4f46e5); color: #fff; }
.vmlb-btn-primary:disabled { background: #d1d5db; cursor: not-allowed; }
.vmlb-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-muted { color: var(--vmlb-text-muted, #6b7280); }
.vmlb-spinner-wrap { display: flex; justify-content: center; padding: 3rem 0; }
.vmlb-spinner { width: 2.5rem; height: 2.5rem; border-radius: 999px; border: 3px solid #e5e7eb; border-bottom-color: var(--vmlb-primary, #4f46e5); animation: vmlb-spin 0.7s linear infinite; }
@keyframes vmlb-spin { to { transform: rotate(360deg); } }
</style>
