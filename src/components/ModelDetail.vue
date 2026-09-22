<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import type { MLAdapter, MlModel, PredictionResult } from '../types'
import ConfusionMatrix from './shared/ConfusionMatrix.vue'
import PlotlyChart from './shared/PlotlyChart.vue'
import Icon from './shared/Icon.vue'

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
    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>

    <div v-if="isLoading" class="vmlb-detail-skeleton">
      <div class="vmlb-skeleton vmlb-skeleton-line" style="width: 40%" />
      <div class="vmlb-skeleton vmlb-skeleton-chart" />
    </div>

    <template v-else-if="model">
      <header class="vmlb-header">
        <div>
          <h2 class="vmlb-display">{{ model.name }}</h2>
          <p class="vmlb-muted vmlb-capitalize">{{ model.model_type.replace(/_/g, ' ') }} · {{ model.status }}</p>
        </div>
        <button v-if="model.status === 'pending'" class="vmlb-btn-primary" @click="emit('train')">
          <Icon name="play" /> Train
        </button>
      </header>

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
          <h3 class="vmlb-card-title">Try a prediction</h3>
          <textarea v-model="predictText" rows="3" placeholder="Paste a clause to classify…" />
          <button class="vmlb-btn-primary" :disabled="isPredicting || !predictText.trim()" @click="runPredict">
            {{ isPredicting ? 'Predicting…' : 'Predict' }}
          </button>

          <div v-if="predictResults.length" class="vmlb-predictions">
            <div v-for="(r, i) in predictResults" :key="i" class="vmlb-prediction">
              <strong>{{ r.prediction }}</strong>
              <span v-if="r.confidence !== undefined" class="vmlb-muted vmlb-num">
                {{ (r.confidence * 100).toFixed(1) }}% confidence
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="vmlb-card">
        <p class="vmlb-muted vmlb-capitalize">
          This model is {{ model.status }}. Train it to see performance and run predictions.
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vmlb-detail { max-width: 62rem; margin: 0 auto; }
.vmlb-detail-skeleton { display: flex; flex-direction: column; gap: 1.25rem; }
.vmlb-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
.vmlb-header h2 { margin: 0 0 0.25rem; font-size: 1.75rem; }
.vmlb-header .vmlb-muted { margin: 0; }
.vmlb-card { margin-bottom: 1.25rem; }
.vmlb-card-title { margin-top: 0; }
.vmlb-card .vmlb-card-title + textarea,
.vmlb-card textarea {
  width: 100%; box-sizing: border-box;
  border: 1px solid var(--vmlb-border-strong); border-radius: var(--vmlb-radius-md);
  padding: 0.6rem 0.75rem; font-family: inherit; font-size: 0.875rem;
  background: var(--vmlb-surface); color: var(--vmlb-text);
  margin-bottom: 0.75rem; resize: vertical;
}
.vmlb-card textarea:focus { outline: none; border-color: var(--vmlb-accent); box-shadow: 0 0 0 3px var(--vmlb-accent-soft); }
.vmlb-predictions { margin-top: 1rem; border-top: 1px solid var(--vmlb-border); padding-top: 1rem; }
.vmlb-prediction { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: 0.375rem 0; }
.vmlb-capitalize { text-transform: capitalize; }
</style>
