<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from 'vue'
import type { Dataset, MLAdapter } from '../types'
import { allModelInfo, modelsByTaskType, parameterSchemas, quickGuideFor, taskTypeLabel } from './modelCatalogData'

const props = defineProps<{
  adapter?: MLAdapter
  /** Pre-select a dataset (e.g. navigated here from a dataset's "Create Model" button). */
  datasetId?: string
  /** Project to associate the new model with. Project selection/creation is the
   * host app's own concern (generic CRUD, not part of this package's adapter) —
   * pass the id the host already resolved, or omit for an unassociated model. */
  projectId?: string
}>()

const emit = defineEmits<{
  created: [model: unknown]
  cancel: []
}>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)

const datasets = ref<Dataset[]>([])
const selectedDataset = ref<Dataset | null>(null)
const modelName = ref('')
const modelNameEdited = ref(false)
const modelType = ref('')
const parameters = reactive<Record<string, unknown>>({})
const isLoading = ref(true)
const isCreating = ref(false)
const error = ref('')
const expandedModelInfo = ref<string | null>(null)
const expandedParams = reactive<Record<string, boolean>>({})

const availableModels = computed<string[]>(() =>
  selectedDataset.value ? (modelsByTaskType[selectedDataset.value.task_type] || Object.keys(allModelInfo)) : [],
)
const currentSchema = computed(() => parameterSchemas[modelType.value] || [])
const quickGuide = computed(() => (selectedDataset.value ? quickGuideFor(selectedDataset.value.task_type) : null))
const taskLabel = computed(() => (selectedDataset.value ? taskTypeLabel(selectedDataset.value.task_type) : ''))

onMounted(async () => {
  if (!adapter.value) {
    error.value = 'No adapter configured'
    isLoading.value = false
    return
  }
  try {
    datasets.value = await adapter.value.listDatasets()
    if (props.datasetId) {
      selectedDataset.value = datasets.value.find((d) => d.id === props.datasetId) ?? null
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load datasets'
  } finally {
    isLoading.value = false
  }
})

function onDatasetChange() {
  modelType.value = ''
  expandedModelInfo.value = null
  Object.keys(expandedParams).forEach((k) => delete expandedParams[k])
  modelNameEdited.value = false
  modelName.value = ''
}

function selectModelType(type: string) {
  modelType.value = type
  expandedModelInfo.value = type
  Object.keys(expandedParams).forEach((k) => delete expandedParams[k])
  const schema = parameterSchemas[type] || []
  Object.keys(parameters).forEach((k) => delete parameters[k])
  for (const p of schema) parameters[p.key] = p.default
  if (!modelNameEdited.value && selectedDataset.value) {
    modelName.value = `${allModelInfo[type]?.label || type} - ${selectedDataset.value.name}`
  }
}

function toggleModelInfo(type: string) {
  expandedModelInfo.value = expandedModelInfo.value === type ? null : type
}

function toggleParam(key: string) {
  expandedParams[key] = !expandedParams[key]
}

async function createModel() {
  if (!adapter.value) return
  if (!selectedDataset.value || !modelName.value.trim() || !modelType.value) {
    error.value = 'Please fill in all required fields'
    return
  }
  try {
    isCreating.value = true
    error.value = ''
    const model = await adapter.value.createModel({
      name: modelName.value,
      dataset_id: selectedDataset.value.id,
      model_type: modelType.value,
      parameters: { ...parameters },
      ...(props.projectId ? { project_id: props.projectId } : {}),
    })
    emit('created', model)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create model'
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="vmlb-wizard">
    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>

    <div v-if="isLoading" class="vmlb-spinner-wrap"><div class="vmlb-spinner" /></div>

    <template v-else>
      <!-- Step 1: dataset -->
      <div class="vmlb-card">
        <h2 class="vmlb-step-title"><span class="vmlb-step-num">1</span> Select Dataset</h2>
        <p v-if="datasets.length === 0" class="vmlb-muted">No datasets available. Upload one first.</p>
        <select v-else v-model="selectedDataset" class="vmlb-select" @change="onDatasetChange">
          <option :value="null">Choose a dataset…</option>
          <option v-for="ds in datasets" :key="ds.id" :value="ds">
            {{ ds.name }} ({{ ds.row_count.toLocaleString() }} rows, {{ ds.task_type }})
          </option>
        </select>
      </div>

      <!-- Step 2: model type -->
      <div v-if="selectedDataset" class="vmlb-card">
        <h2 class="vmlb-step-title"><span class="vmlb-step-num">2</span> Select Model Type</h2>
        <p class="vmlb-muted vmlb-indent">Available models for <strong>{{ taskLabel }}</strong> tasks:</p>

        <div v-if="quickGuide" class="vmlb-guide">
          <p class="vmlb-guide-title">Quick Selection Guide</p>
          <p v-for="item in quickGuide" :key="item.q" class="vmlb-guide-line">
            <strong>{{ item.q }}</strong> → {{ item.a }}
          </p>
        </div>

        <div class="vmlb-model-grid">
          <div
            v-for="type in availableModels"
            :key="type"
            class="vmlb-model-card"
            :class="{ 'vmlb-selected': modelType === type }"
            role="button"
            tabindex="0"
            @click="selectModelType(type)"
            @keydown.enter="selectModelType(type)"
          >
            <div class="vmlb-model-card-head">
              <h3>{{ allModelInfo[type]?.label }}</h3>
              <span v-if="modelType === type" class="vmlb-badge">Selected</span>
            </div>
            <p class="vmlb-model-desc">{{ allModelInfo[type]?.shortDesc }}</p>
            <button type="button" class="vmlb-link-btn" @click.stop="toggleModelInfo(type)">
              {{ expandedModelInfo === type ? 'Hide details' : 'When should I use this?' }}
            </button>

            <div v-if="expandedModelInfo === type" class="vmlb-model-info" @click.stop>
              <p><strong>When to Select:</strong> {{ allModelInfo[type]?.whenToUse }}</p>
              <p class="vmlb-italic">{{ allModelInfo[type]?.example }}</p>
              <ul>
                <li v-for="s in allModelInfo[type]?.strengths" :key="s">✓ {{ s }}</li>
              </ul>
              <p><strong>Best for:</strong> {{ allModelInfo[type]?.bestFor }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 3: configure -->
      <div v-if="modelType" class="vmlb-card">
        <h2 class="vmlb-step-title"><span class="vmlb-step-num">3</span> Configure Model</h2>

        <div class="vmlb-field">
          <label for="vmlb-model-name">Model Name *</label>
          <input
            id="vmlb-model-name"
            v-model="modelName"
            type="text"
            placeholder="e.g., Decision Tree - Legal Contracts"
            @input="modelNameEdited = true"
          />
        </div>

        <div v-if="currentSchema.length" class="vmlb-params">
          <div v-for="param in currentSchema" :key="param.key" class="vmlb-param-row">
            <div class="vmlb-param-head">
              <button type="button" class="vmlb-link-btn" @click="toggleParam(param.key)">
                {{ param.label }}
              </button>
              <p class="vmlb-muted vmlb-small">{{ param.shortDesc }}</p>
            </div>
            <div class="vmlb-param-input">
              <select v-if="param.type === 'select'" v-model="parameters[param.key]">
                <option v-for="opt in param.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>
              <select v-else-if="param.type === 'boolean'" v-model="parameters[param.key]">
                <option :value="true">true</option>
                <option :value="false">false</option>
              </select>
              <input
                v-else
                v-model.number="parameters[param.key]"
                type="number"
                :step="param.step ?? 'any'"
                :min="param.min"
                :max="param.max"
                :placeholder="param.default === null ? 'unlimited' : String(param.default)"
              />
            </div>
            <div v-if="expandedParams[param.key]" class="vmlb-param-explain">
              <p>{{ param.explanation }}</p>
              <div v-if="param.optionsExplained">
                <div v-for="opt in param.optionsExplained" :key="opt.value" class="vmlb-option-line">
                  <code>{{ opt.value }}</code> <span>{{ opt.desc }}</span>
                </div>
              </div>
              <div class="vmlb-recommendation">💡 {{ param.recommendation }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="modelType" class="vmlb-actions">
        <button type="button" class="vmlb-btn-secondary" @click="emit('cancel')">Cancel</button>
        <button
          type="button"
          class="vmlb-btn-primary"
          :disabled="isCreating || !selectedDataset || !modelName.trim() || !modelType"
          @click="createModel"
        >
          {{ isCreating ? 'Creating…' : 'Create Model' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vmlb-wizard { max-width: 42rem; margin: 0 auto; }
.vmlb-card { background: var(--vmlb-surface, #fff); border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 1.25rem; }
.vmlb-step-title { display: flex; align-items: center; gap: 0.75rem; font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem; }
.vmlb-step-num { width: 1.75rem; height: 1.75rem; border-radius: 999px; background: var(--vmlb-primary, #4f46e5); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.875rem; font-weight: 700; flex-shrink: 0; }
.vmlb-muted { color: var(--vmlb-text-muted, #6b7280); font-size: 0.875rem; }
.vmlb-small { font-size: 0.75rem; margin-top: 0.125rem; }
.vmlb-indent { margin-left: 2.5rem; }
.vmlb-select, .vmlb-field input, .vmlb-param-input select, .vmlb-param-input input {
  width: 100%; border: 1px solid var(--vmlb-border, #d1d5db); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem;
}
.vmlb-guide { background: #eef2ff; border: 1px solid #e0e7ff; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem; }
.vmlb-guide-title { font-weight: 600; color: #3730a3; margin-bottom: 0.5rem; font-size: 0.875rem; }
.vmlb-guide-line { color: #4338ca; font-size: 0.875rem; }
.vmlb-model-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.vmlb-model-card { border: 2px solid var(--vmlb-border, #e5e7eb); border-radius: 0.75rem; padding: 1rem; cursor: pointer; transition: border-color 0.15s; }
.vmlb-model-card.vmlb-selected { border-color: var(--vmlb-primary, #4f46e5); background: #eef2ff; }
.vmlb-model-card-head { display: flex; justify-content: space-between; align-items: start; }
.vmlb-model-card-head h3 { font-size: 0.875rem; font-weight: 600; }
.vmlb-badge { font-size: 0.75rem; font-weight: 500; color: var(--vmlb-primary, #4f46e5); background: #e0e7ff; padding: 0.125rem 0.5rem; border-radius: 0.25rem; }
.vmlb-model-desc { font-size: 0.75rem; color: var(--vmlb-text-muted, #6b7280); margin: 0.25rem 0 0.5rem; }
.vmlb-link-btn { color: var(--vmlb-primary, #4f46e5); font-size: 0.75rem; font-weight: 500; background: none; border: none; cursor: pointer; padding: 0; }
.vmlb-model-info { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--vmlb-border, #e5e7eb); font-size: 0.75rem; color: #374151; }
.vmlb-model-info ul { margin: 0.5rem 0; padding-left: 1rem; }
.vmlb-italic { font-style: italic; color: var(--vmlb-text-muted, #6b7280); }
.vmlb-field { margin-bottom: 1.5rem; }
.vmlb-field label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem; }
.vmlb-params { border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.5rem; overflow: hidden; }
.vmlb-param-row { padding: 0.75rem 1rem; border-bottom: 1px solid var(--vmlb-border, #f3f4f6); display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
.vmlb-param-row:last-child { border-bottom: none; }
.vmlb-param-head { flex: 1; min-width: 10rem; }
.vmlb-param-input input, .vmlb-param-input select { width: auto; min-width: 7rem; }
.vmlb-param-explain { flex-basis: 100%; background: #eef2ff; border-radius: 0.375rem; padding: 0.75rem; font-size: 0.8125rem; color: #374151; }
.vmlb-option-line { display: flex; gap: 0.5rem; margin: 0.25rem 0; }
.vmlb-option-line code { background: #fff; border: 1px solid var(--vmlb-border, #e5e7eb); padding: 0.0625rem 0.375rem; border-radius: 0.25rem; font-size: 0.75rem; }
.vmlb-recommendation { margin-top: 0.5rem; background: #fff; border: 1px solid #c7d2fe; border-radius: 0.375rem; padding: 0.5rem 0.75rem; font-size: 0.75rem; color: #4338ca; }
.vmlb-actions { display: flex; justify-content: flex-end; gap: 0.75rem; }
.vmlb-btn-primary, .vmlb-btn-secondary { padding: 0.625rem 1.25rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; border: 1px solid transparent; }
.vmlb-btn-primary { background: var(--vmlb-primary, #4f46e5); color: #fff; }
.vmlb-btn-primary:disabled { background: #d1d5db; cursor: not-allowed; }
.vmlb-btn-secondary { background: #fff; color: #374151; border-color: var(--vmlb-border, #d1d5db); }
.vmlb-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-spinner-wrap { display: flex; justify-content: center; padding: 3rem 0; }
.vmlb-spinner { width: 2.5rem; height: 2.5rem; border-radius: 999px; border: 3px solid #e5e7eb; border-bottom-color: var(--vmlb-primary, #4f46e5); animation: vmlb-spin 0.7s linear infinite; }
@keyframes vmlb-spin { to { transform: rotate(360deg); } }
</style>
