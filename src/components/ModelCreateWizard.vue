<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref, watch } from 'vue'
import type { Dataset, MLAdapter, ModelTypeInfo } from '../types'
import { allModelInfo, defaultModelFor, modelsByTaskType, parameterRules, parameterSchemas, taskTypeLabel } from './modelCatalogData'
import { allowedOptions, mergeSchema, reconcileChoices } from './parameterOptions'
import type { ParameterFieldSchema } from './modelCatalogData'
import ModelLens from './shared/ModelLens.vue'
import ModelQuestionTree from './ModelQuestionTree.vue'
import Icon from './shared/Icon.vue'

const props = withDefaults(defineProps<{
  adapter?: MLAdapter
  /** Pre-select a dataset (e.g. navigated here from a dataset's "Create Model" button). */
  datasetId?: string
  /** Project to associate the new model with. Project selection/creation is the
   * host app's own concern (generic CRUD, not part of this package's adapter) —
   * pass the id the host already resolved, or omit for an unassociated model. */
  projectId?: string
  /** Number of the first step, for a host that puts its own steps before these. */
  firstStep?: number
}>(), { firstStep: 1 })

const emit = defineEmits<{
  created: [model: unknown, info?: { trainingQueued: boolean }]
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
// Why Create & train did not go through, shown beside that button. The backend
// answers with a sentence and names no field, so no setting can be marked.
const refusal = ref('')
const expandedModelInfo = ref<string | null>(null)
// One model is always chosen, so the rest of the grid stays folded until asked for.
const showAllModels = ref(false)
const expandedParams = reactive<Record<string, boolean>>({})
// Model types the backend reports as trainable for the selected dataset's task.
// Falls back to the static catalog when the adapter can't answer (e.g. a
// non-BAIGLE host), so the wizard still works standalone.
const backendModels = ref<string[] | null>(null)
// What the backend says about each model: it decides the options, ranges and
// dependent options, so the wizard cannot offer what it refuses.
const backendInfo = ref<Record<string, ModelTypeInfo>>({})
// Why a setting just moved, for the settings that had to.
const adjusted = ref<Record<string, string>>({})
// Label names from the dataset's overview, for datasets uploaded with their
// labels in a column rather than declared up front.
const overviewLabels = ref<string[] | null>(null)

const staticModels = computed<string[]>(() =>
  selectedDataset.value ? (modelsByTaskType[selectedDataset.value.task_type] || []) : [],
)
const availableModels = computed<string[]>(() => {
  if (!selectedDataset.value) return []
  if (backendModels.value && backendModels.value.length) return backendModels.value
  return staticModels.value
})
const visibleModels = computed<string[]>(() =>
  !showAllModels.value && availableModels.value.includes(modelType.value) ? [modelType.value] : availableModels.value,
)
const schemaFor = (type: string) =>
  mergeSchema(parameterSchemas[type] || [], backendInfo.value[type], selectedDataset.value?.row_count)
const currentRules = computed(() => backendInfo.value[modelType.value]?.rules ?? parameterRules[modelType.value] ?? [])
const allSettings = computed(() => schemaFor(modelType.value))
const currentSchema = computed(() =>
  allSettings.value.filter((p) => Object.entries(p.showWhen ?? {}).every(([key, value]) => parameters[key] === value)),
)
const taskLabel = computed(() => (selectedDataset.value ? taskTypeLabel(selectedDataset.value.task_type) : ''))
const datasetLabels = computed(() => (selectedDataset.value?.labels?.length ? selectedDataset.value.labels : overviewLabels.value))
const multiclass = computed(() => (datasetLabels.value?.length ?? 0) > 2)

const optionsFor = (param: ParameterFieldSchema) => allowedOptions(param, currentRules.value, parameters, multiclass.value)

// Choosing a penalty can rule out the solver already chosen, as can the labels
// arriving after the model is picked.
watch([parameters, multiclass, allSettings], () => {
  const moved = reconcileChoices(allSettings.value, currentRules.value, parameters, multiclass.value)
  // A note lasts as long as the rule that caused it.
  const stillTrue = ([key, note]: [string, string]) => {
    const param = allSettings.value.find((p) => p.key === key)
    return !!param && optionsFor(param).reasons.some((reason) => note.includes(reason))
  }
  adjusted.value = Object.fromEntries(Object.entries({ ...adjusted.value, ...moved }).filter(stillTrue))
})

// A refusal is about the values refused, so it goes when they do.
watch([parameters, modelName, modelType, selectedDataset], () => {
  refusal.value = ''
})

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
      prepareDataset()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load datasets'
  } finally {
    isLoading.value = false
  }
})

async function loadBackendModels() {
  backendModels.value = null
  backendInfo.value = {}
  const dataset = selectedDataset.value
  if (!adapter.value?.getAvailableModelTypes || !dataset) return
  try {
    const catalog = await adapter.value.getAvailableModelTypes(dataset.task_type)
    if (selectedDataset.value !== dataset) return
    backendInfo.value = catalog?.[dataset.task_type] ?? {}
    const types = Object.keys(backendInfo.value)
    backendModels.value = types.length ? types : null
  } catch {
    backendModels.value = null
  }
}

async function loadOverviewLabels() {
  overviewLabels.value = null
  const dataset = selectedDataset.value
  if (!adapter.value || !dataset || dataset.labels?.length) return
  try {
    const eda = await adapter.value.getEdaData(dataset.id)
    if (selectedDataset.value !== dataset) return
    const distribution = (eda?.task_specific_analysis?.label_distribution ?? {}) as Record<string, number>
    const labels = Object.entries(distribution).sort(([, a], [, b]) => b - a).map(([label]) => label)
    overviewLabels.value = labels.length ? labels : null
  } catch {
    overviewLabels.value = null // the generic wording still reads correctly
  }
}

async function prepareDataset() {
  const dataset = selectedDataset.value
  loadOverviewLabels()
  await loadBackendModels()
  // Not if the user picked a model, or another dataset, while the catalogue loaded.
  if (selectedDataset.value !== dataset || modelType.value) return
  const type = defaultModelFor(availableModels.value)
  if (!type) return
  selectModelType(type)
  expandedModelInfo.value = null
}

function onDatasetChange() {
  modelType.value = ''
  showAllModels.value = false
  expandedModelInfo.value = null
  Object.keys(expandedParams).forEach((k) => delete expandedParams[k])
  modelNameEdited.value = false
  modelName.value = ''
  prepareDataset()
}

function selectModelType(type: string) {
  modelType.value = type
  expandedModelInfo.value = type
  Object.keys(expandedParams).forEach((k) => delete expandedParams[k])
  adjusted.value = {}
  Object.keys(parameters).forEach((k) => delete parameters[k])
  for (const p of schemaFor(type)) parameters[p.key] = p.default
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
    refusal.value = 'Please fill in all required fields'
    return
  }
  try {
    isCreating.value = true
    refusal.value = ''
    const model = await adapter.value.createModel({
      name: modelName.value,
      dataset_id: selectedDataset.value.id,
      model_type: modelType.value,
      // A number cleared by hand is left to its default.
      parameters: Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== '')),
      ...(props.projectId ? { project_id: props.projectId } : {}),
    })

    // Create-and-train is one action: queue training immediately so the user
    // does not have to find a separate "Train" step. If queuing fails, the
    // model still exists and the user can start training from the model page.
    let trainingQueued = false
    try {
      await adapter.value.startTraining(model.id)
      trainingQueued = true
    } catch {
      trainingQueued = false
    }

    emit('created', model, { trainingQueued })
  } catch (err) {
    refusal.value = err instanceof Error ? err.message : 'Failed to create model'
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="vmlb-wizard">
    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>

    <div v-if="isLoading" class="vmlb-wizard-skeleton">
      <div class="vmlb-skeleton vmlb-skeleton-tile" />
      <div class="vmlb-skeleton vmlb-skeleton-tile" />
    </div>

    <template v-else>
      <!-- Step 1: dataset -->
      <section class="vmlb-card">
        <h2 class="vmlb-step-title"><span class="vmlb-step-num">{{ firstStep }}</span> Select dataset</h2>
        <p v-if="datasets.length === 0" class="vmlb-muted">No datasets available. Upload one first.</p>
        <select v-else v-model="selectedDataset" class="vmlb-input" @change="onDatasetChange">
          <option :value="null">Choose a dataset…</option>
          <option v-for="ds in datasets" :key="ds.id" :value="ds">
            {{ ds.name }} ({{ ds.row_count.toLocaleString('en-GB') }} rows, {{ taskTypeLabel(ds.task_type) }})
          </option>
        </select>
      </section>

      <!-- Step 2: model type -->
      <section v-if="selectedDataset" class="vmlb-card">
        <h2 class="vmlb-step-title"><span class="vmlb-step-num">{{ firstStep + 1 }}</span> Select model type</h2>
        <p class="vmlb-muted vmlb-indent">Available models for <strong>{{ taskLabel }}</strong> tasks.</p>

        <details class="vmlb-advanced vmlb-chooser">
          <summary>Help me choose a model</summary>
          <ModelQuestionTree
            :task-type="selectedDataset.task_type"
            :current-model-type="modelType"
            auto-apply
            @select="selectModelType"
          />
        </details>

        <div class="vmlb-model-grid">
          <div
            v-for="type in visibleModels"
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
              <p><strong>When to select:</strong> {{ allModelInfo[type]?.whenToUse }}</p>
              <p class="vmlb-italic">{{ allModelInfo[type]?.example }}</p>
              <ul>
                <li v-for="s in allModelInfo[type]?.strengths" :key="s">
                  <Icon name="check" /> {{ s }}
                </li>
              </ul>
              <p><strong>Best for:</strong> {{ allModelInfo[type]?.bestFor }}</p>
            </div>
          </div>
        </div>
        <button
          v-if="visibleModels.length < availableModels.length"
          type="button"
          class="vmlb-link-btn vmlb-show-models"
          @click="showAllModels = true"
        >
          Show all {{ availableModels.length }} models
        </button>
      </section>

      <!-- Step 3: configure -->
      <section v-if="modelType" class="vmlb-card">
        <h2 class="vmlb-step-title"><span class="vmlb-step-num">{{ firstStep + 2 }}</span> Configure model</h2>

        <div class="vmlb-configure">
          <div class="vmlb-configure-form">
            <div class="vmlb-field">
              <label for="vmlb-model-name">Model name *</label>
              <input
                id="vmlb-model-name"
                v-model="modelName"
                type="text"
                placeholder="e.g., Decision Tree — Lease agreements"
                @input="modelNameEdited = true"
              />
            </div>

            <details v-if="currentSchema.length" class="vmlb-advanced">
              <summary>Advanced settings</summary>
              <p class="vmlb-muted vmlb-small">Sensible defaults are already applied. Change these only if you want to.</p>
              <div class="vmlb-params">
                <div v-for="param in currentSchema" :key="param.key" class="vmlb-param-row">
                  <div class="vmlb-param-head">
                    <button type="button" class="vmlb-link-btn" @click="toggleParam(param.key)">
                      {{ param.label }}
                    </button>
                    <p class="vmlb-muted vmlb-small">{{ param.shortDesc }}</p>
                  </div>
                  <div class="vmlb-param-input">
                    <select v-if="param.type === 'select'" v-model="parameters[param.key]">
                      <option v-for="opt in optionsFor(param).options" :key="opt" :value="opt">{{ opt }}</option>
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
                  <p v-if="adjusted[param.key]" class="vmlb-param-note">{{ adjusted[param.key] }}</p>
                  <p v-else-if="optionsFor(param).reasons.length" class="vmlb-param-note">
                    {{ optionsFor(param).reasons.join(' ') }}
                  </p>
                  <div v-if="expandedParams[param.key]" class="vmlb-param-explain">
                    <p>{{ param.explanation }}</p>
                    <div v-if="param.optionsExplained">
                      <div
                        v-for="opt in param.optionsExplained.filter((o) => optionsFor(param).options.includes(o.value))"
                        :key="opt.value"
                        class="vmlb-option-line"
                      >
                        <code>{{ opt.value }}</code> <span>{{ opt.desc }}</span>
                      </div>
                    </div>
                    <div class="vmlb-recommendation"><Icon name="spark" /> {{ param.recommendation }}</div>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <aside class="vmlb-configure-lens">
            <ModelLens
              :model-type="modelType"
              :parameters="parameters"
              :labels="datasetLabels"
              :task-type="selectedDataset?.task_type"
              :dataset-name="selectedDataset?.name"
            />
            <p class="vmlb-lens-footnote">
              Change an advanced setting and watch the diagram redraw — that is the model changing how it decides.
            </p>
          </aside>
        </div>
      </section>

      <!-- Stays in the page when empty: a screen reader announces what arrives in an
           alert it already knows. Above the buttons, so it lands where the user is. -->
      <div v-if="modelType" role="alert" class="vmlb-refusal">
        <div v-if="refusal" class="vmlb-alert-error">
          <Icon name="alert" /> {{ refusal }}
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
          {{ isCreating ? 'Creating & starting training…' : 'Create & train' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vmlb-wizard { max-width: 62rem; margin: 0 auto; }
.vmlb-wizard-skeleton { display: grid; gap: 1.25rem; }
.vmlb-step-title {
  display: flex; align-items: center; gap: 0.75rem;
  margin: 0 0 1rem;
  font-family: var(--vmlb-font-display);
  font-size: 1.1875rem; font-weight: 600; letter-spacing: -0.01em;
}
.vmlb-step-num {
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  width: 1.6rem; height: 1.6rem;
  border-radius: var(--vmlb-radius-sm);
  background: var(--vmlb-accent); color: var(--vmlb-on-accent);
  font-family: var(--vmlb-font-sans);
  font-size: 0.8125rem; font-weight: 700;
}
.vmlb-indent { margin-left: 2.35rem; margin-top: -0.5rem; }
.vmlb-configure { display: grid; grid-template-columns: 1fr 1fr; gap: 1.75rem; align-items: start; }
.vmlb-configure-lens { position: sticky; top: 1rem; }
.vmlb-lens-footnote { margin-top: 0.75rem; font-size: 0.75rem; color: var(--vmlb-text-subtle); max-width: 46ch; }
@media (max-width: 46rem) { .vmlb-configure { grid-template-columns: 1fr; } .vmlb-configure-lens { position: static; } }
.vmlb-model-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.vmlb-model-card {
  display: flex; flex-direction: column;
  border: 1px solid var(--vmlb-border);
  border-radius: var(--vmlb-radius-md);
  padding: 1rem; background: var(--vmlb-surface);
  cursor: pointer;
  transition: border-color var(--vmlb-duration) var(--vmlb-ease),
    background-color var(--vmlb-duration) var(--vmlb-ease),
    transform var(--vmlb-duration) var(--vmlb-ease),
    box-shadow var(--vmlb-duration) var(--vmlb-ease);
}
.vmlb-model-card:hover { border-color: var(--vmlb-border-strong); transform: translateY(-1px); box-shadow: var(--vmlb-shadow-sm); }
.vmlb-model-card.vmlb-selected { border-color: var(--vmlb-accent); background: var(--vmlb-accent-soft); box-shadow: var(--vmlb-shadow-sm); }
.vmlb-model-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
.vmlb-model-card-head h3 { margin: 0; font-size: 0.9375rem; font-weight: 600; }
.vmlb-model-desc { font-size: 0.75rem; color: var(--vmlb-text-muted); margin: 0.25rem 0 0.6rem; }
.vmlb-model-info {
  margin-top: 0.75rem; padding-top: 0.75rem;
  border-top: 1px solid var(--vmlb-border);
  font-size: 0.75rem; color: var(--vmlb-text-muted); line-height: 1.55;
}
.vmlb-model-info ul { margin: 0.5rem 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 0.25rem; }
.vmlb-model-info li { display: flex; align-items: flex-start; gap: 0.35rem; }
.vmlb-model-info li :deep(.vmlb-icon) { color: var(--vmlb-success); margin-top: 0.15rem; }
.vmlb-italic { font-style: italic; color: var(--vmlb-text-subtle); }
.vmlb-field { margin-bottom: 1.25rem; }
.vmlb-show-models { margin-top: 0.75rem; }
.vmlb-refusal .vmlb-alert-error { margin: var(--vmlb-space-md) 0 0; }
.vmlb-chooser { margin-bottom: 1rem; }
.vmlb-advanced summary { cursor: pointer; font-size: 0.875rem; font-weight: 600; color: var(--vmlb-text); }
.vmlb-advanced[open] summary { margin-bottom: 0.5rem; }
.vmlb-advanced .vmlb-params { margin-top: 0.75rem; }
.vmlb-params { border: 1px solid var(--vmlb-border); border-radius: var(--vmlb-radius-md); overflow: hidden; }
.vmlb-param-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1rem; border-bottom: 1px solid var(--vmlb-border);
}
.vmlb-param-row:last-child { border-bottom: none; }
.vmlb-param-head { flex: 1; min-width: 10rem; }
.vmlb-param-input input, .vmlb-param-input select {
  width: auto; min-width: 7rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--vmlb-border-strong);
  border-radius: var(--vmlb-radius-sm);
  background: var(--vmlb-surface); color: var(--vmlb-text); font-family: inherit; font-size: 0.875rem;
}
.vmlb-param-note { flex-basis: 100%; margin: 0; font-size: 0.75rem; color: var(--vmlb-text-muted); }
.vmlb-param-explain { flex-basis: 100%; background: var(--vmlb-surface-sunken); border-radius: var(--vmlb-radius-sm); padding: 0.75rem; font-size: 0.8125rem; color: var(--vmlb-text-muted); line-height: 1.55; }
.vmlb-option-line { display: flex; gap: 0.5rem; margin: 0.25rem 0; }
.vmlb-option-line code { background: var(--vmlb-surface); border: 1px solid var(--vmlb-border); padding: 0.0625rem 0.375rem; border-radius: var(--vmlb-radius-sm); font-size: 0.75rem; }
.vmlb-recommendation {
  display: flex; align-items: flex-start; gap: 0.4rem;
  margin-top: 0.5rem; padding: 0.5rem 0.75rem;
  background: var(--vmlb-accent-soft);
  border-radius: var(--vmlb-radius-sm);
  font-size: 0.75rem; color: var(--vmlb-accent-strong);
}
</style>
