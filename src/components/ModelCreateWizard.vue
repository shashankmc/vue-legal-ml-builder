<script setup lang="ts">
import { computed, inject, nextTick, onMounted, reactive, ref, watch } from 'vue'
import type { Dataset, MLAdapter, ModelFit, ModelTypeInfo, RefusalError } from '../types'
import { allModelInfo, defaultModelFor, modelsByTaskType, taskTypeLabel } from './modelCatalogData'
import ModelParameterForm from './ModelParameterForm.vue'
import ModelLens from './shared/ModelLens.vue'
import ModelQuestionTree from './ModelQuestionTree.vue'
import { decisionTreeFor } from '../lens/modelGuide'
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
// The settings the form reports, for the lens and for Create & train.
const parameters = reactive<Record<string, unknown>>({})
// What the form starts from. A new object starts it again.
const initialParameters = ref<Record<string, unknown>>({})
const isLoading = ref(true)
const isCreating = ref(false)
const error = ref('')
// Why Create & train did not go through, shown beside that button, and the
// setting at fault when the backend names one that is on the form.
const refusal = ref('')
const refusedField = ref('')
const actions = ref<HTMLElement | null>(null)
const settingsForm = ref<InstanceType<typeof ModelParameterForm> | null>(null)
const expandedModelInfo = ref<string | null>(null)
// The step opens on the guide questions, with the chosen model below them. The
// full grid replaces the questions when the user would rather choose for themselves.
const showAllModels = ref(false)
// Model types the backend reports as trainable for the selected dataset's task.
// Falls back to the static catalog when the adapter can't answer (e.g. a
// non-BAIGLE host), so the wizard still works standalone.
const backendModels = ref<string[] | null>(null)
// What the backend says about each model: it decides the options, ranges and
// dependent options, so the wizard cannot offer what it refuses.
const backendInfo = ref<Record<string, ModelTypeInfo>>({})
// Label names from the dataset's overview, for datasets uploaded with their
// labels in a column rather than declared up front.
const overviewLabels = ref<string[] | null>(null)
// How many documents carry each label, so the guide can weight rare labels up.
const labelCounts = ref<Record<string, number> | null>(null)
// Every model fitted to the dataset, with why it cannot train it (getModelFit).
const fit = ref<ModelFit | null>(null)

const staticModels = computed<string[]>(() =>
  selectedDataset.value ? (modelsByTaskType[selectedDataset.value.task_type] || []) : [],
)
// The models that can train the dataset: the guide and the default choose among these.
const availableModels = computed<string[]>(() => {
  if (!selectedDataset.value) return []
  if (fit.value) return fittedModels.value.filter((t) => isUsable(t))
  if (backendModels.value && backendModels.value.length) return backendModels.value
  return staticModels.value
})
// With a fit, the grid lists every model, usable first, so the rest can say why not.
const fittedModels = computed<string[]>(() => {
  if (!fit.value) return []
  const known = Object.keys(fit.value.models).filter((t) => t in allModelInfo)
  return [...known.filter((t) => fit.value!.models[t].usable), ...known.filter((t) => !fit.value!.models[t].usable)]
})
const listedModels = computed<string[]>(() => (fit.value ? fittedModels.value : availableModels.value))
const nothingFits = computed(() => !!fit.value && fittedModels.value.length > 0 && availableModels.value.length === 0)
const visibleModels = computed<string[]>(() =>
  !showAllModels.value && availableModels.value.includes(modelType.value) ? [modelType.value] : listedModels.value,
)

function isUsable(type: string) {
  return !fit.value || fit.value.models[type]?.usable !== false
}

function unusableReason(type: string) {
  return isUsable(type) ? null : fit.value?.models[type]?.reason ?? null
}
const hasGuide = computed(() => !!selectedDataset.value && decisionTreeFor(selectedDataset.value.task_type) !== null)
const taskLabel = computed(() => (selectedDataset.value ? taskTypeLabel(selectedDataset.value.task_type) : ''))
const datasetLabels = computed(() => (selectedDataset.value?.labels?.length ? selectedDataset.value.labels : overviewLabels.value))

// Only what changed, so a report of the same settings is not taken for an edit.
function onSettingsChange(next: Record<string, unknown>) {
  Object.keys(parameters).filter((k) => !(k in next)).forEach((k) => delete parameters[k])
  Object.assign(parameters, next)
}

// A refusal is about the values refused, so it goes when they do.
watch([parameters, modelName, modelType, selectedDataset], clearRefusal)

function clearRefusal() {
  refusal.value = ''
  refusedField.value = ''
}

const refusedLabel = computed(() => settingsForm.value?.labelFor(refusedField.value))

// On a phone the setting can be a long way above the alert, which stays by the buttons.
function goToRefusedField() {
  const control = document.getElementById('vmlb-refused-field')
  control?.scrollIntoView({ block: 'center' })
  control?.focus({ preventScroll: true })
}

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
  fit.value = null
  const dataset = selectedDataset.value
  if (adapter.value?.getModelFit && dataset) {
    try {
      const answer = await adapter.value.getModelFit(dataset.id)
      if (selectedDataset.value !== dataset) return
      fit.value = answer
      backendInfo.value = Object.fromEntries(
        Object.entries(answer.models).filter(([, m]) => m.usable),
      ) as Record<string, ModelTypeInfo>
      return
    } catch {
      fit.value = null // fall back to the task type's catalogue
    }
  }
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
  labelCounts.value = null
  const dataset = selectedDataset.value
  if (!adapter.value || !dataset) return
  try {
    const eda = await adapter.value.getEdaData(dataset.id)
    if (selectedDataset.value !== dataset) return
    const analysis = eda?.task_specific_analysis ?? {}
    // A judgment Dataset counts its outcomes under their own name.
    const distribution = (analysis.label_distribution ?? analysis.judgment_distribution ?? {}) as Record<string, number>
    const labels = Object.entries(distribution).sort(([, a], [, b]) => b - a).map(([label]) => label)
    labelCounts.value = labels.length ? distribution : null
    // Labels declared up front are the Dataset's own; the overview only fills in.
    if (!dataset.labels?.length) overviewLabels.value = labels.length ? labels : null
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
  modelNameEdited.value = false
  modelName.value = ''
  prepareDataset()
}

function selectModelType(type: string, preset?: Record<string, unknown>) {
  if (!isUsable(type)) return
  modelType.value = type
  expandedModelInfo.value = type
  initialParameters.value = { ...preset }
  if (!modelNameEdited.value && selectedDataset.value) {
    modelName.value = `${allModelInfo[type]?.label || type} - ${selectedDataset.value.name}`
  }
}

function toggleModelInfo(type: string) {
  expandedModelInfo.value = expandedModelInfo.value === type ? null : type
}

async function createModel() {
  if (!adapter.value) return
  if (!selectedDataset.value || !modelName.value.trim() || !modelType.value) {
    refusal.value = 'Please fill in all required fields'
    return
  }
  try {
    isCreating.value = true
    clearRefusal()
    const model = await adapter.value.createModel({
      name: modelName.value,
      dataset_id: selectedDataset.value.id,
      model_type: modelType.value,
      parameters: { ...parameters },
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
    // The form marks it, and opens Advanced settings on it, if it is on show.
    const field = (err as RefusalError).field
    if (settingsForm.value?.labelFor(field)) refusedField.value = field as string
    // The alert and Advanced settings grow above the buttons, which can push them
    // past the viewport, so this comes after both.
    await nextTick()
    actions.value?.scrollIntoView({ block: 'nearest' })
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
        <div v-if="nothingFits" role="note" class="vmlb-no-fit">
          <p><strong>No model can train this dataset yet.</strong></p>
          <p v-if="fit?.advice">{{ fit.advice }}</p>
        </div>
        <p v-else-if="!availableModels.length" class="vmlb-muted vmlb-indent vmlb-no-models">
          A Model cannot be trained for {{ taskLabel }} yet. Choose a Dataset with another task type.
        </p>
        <p v-else class="vmlb-muted vmlb-indent">Available models for <strong>{{ taskLabel }}</strong> tasks.</p>

        <div v-if="!showAllModels && hasGuide && !nothingFits" class="vmlb-chooser">
          <ModelQuestionTree
            :task-type="selectedDataset.task_type"
            :current-model-type="modelType"
            :row-count="selectedDataset.row_count"
            :label-counts="labelCounts"
            :catalogue="backendInfo"
            :available-models="availableModels"
            auto-apply
            @select="selectModelType"
          />
        </div>

        <div class="vmlb-model-grid">
          <div
            v-for="type in visibleModels"
            :key="type"
            class="vmlb-model-card"
            :class="{ 'vmlb-selected': modelType === type, 'vmlb-unusable': !isUsable(type) }"
            role="button"
            :tabindex="isUsable(type) ? 0 : -1"
            :aria-disabled="isUsable(type) ? undefined : 'true'"
            :aria-describedby="isUsable(type) ? undefined : `vmlb-why-${type}`"
            @click="selectModelType(type)"
            @keydown.enter="selectModelType(type)"
          >
            <div class="vmlb-model-card-head">
              <h3>{{ allModelInfo[type]?.label }}</h3>
              <span v-if="modelType === type" class="vmlb-badge">Selected</span>
              <span v-else-if="!isUsable(type)" class="vmlb-badge vmlb-badge-muted">Not for this dataset</span>
            </div>
            <p class="vmlb-model-desc">{{ allModelInfo[type]?.shortDesc }}</p>
            <p v-if="unusableReason(type)" :id="`vmlb-why-${type}`" class="vmlb-model-why">{{ unusableReason(type) }}</p>
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
          v-if="visibleModels.length < listedModels.length"
          type="button"
          class="vmlb-link-btn vmlb-show-models"
          @click="showAllModels = true"
        >
          Choose a model myself
        </button>
        <button
          v-else-if="showAllModels && hasGuide"
          type="button"
          class="vmlb-link-btn vmlb-show-guide"
          @click="showAllModels = false"
        >
          Help me choose instead
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

            <ModelParameterForm
              ref="settingsForm"
              :model-type="modelType"
              :parameters="initialParameters"
              :model-info="backendInfo[modelType]"
              :row-count="selectedDataset?.row_count"
              :labels="datasetLabels"
              :refused-field="refusedField"
              @change="onSettingsChange"
            />
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
      <div v-if="modelType" id="vmlb-refusal" role="alert" class="vmlb-refusal">
        <div v-if="refusal" class="vmlb-alert-error">
          <Icon name="alert" />
          <span>
            {{ refusal }}
            <button v-if="refusedLabel" type="button" class="vmlb-link-btn vmlb-refusal-link" @click="goToRefusedField">
              Go to {{ refusedLabel }}
            </button>
          </span>
        </div>
      </div>
      <div v-if="modelType" ref="actions" class="vmlb-actions">
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
.vmlb-model-card.vmlb-unusable { opacity: 0.6; cursor: not-allowed; }
.vmlb-model-card.vmlb-unusable:hover { transform: none; box-shadow: none; border-color: var(--vmlb-border); }
.vmlb-model-why { margin: 0.5rem 0 0; font-size: 0.85rem; color: var(--vmlb-text); }
.vmlb-badge-muted { background: var(--vmlb-surface-sunken); color: var(--vmlb-text-muted); }
.vmlb-no-fit { margin: 0 0 1rem; padding: 0.75rem 1rem; border-radius: var(--vmlb-radius-md); border: 1px solid var(--vmlb-warning); background: var(--vmlb-warning-soft); color: var(--vmlb-text); }
.vmlb-no-fit p { margin: 0.25rem 0; }
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
.vmlb-show-models, .vmlb-show-guide { margin-top: 0.75rem; }
.vmlb-refusal .vmlb-alert-error { margin: var(--vmlb-space-md) 0 0; }
.vmlb-refusal-link { display: block; min-height: 44px; color: inherit; text-decoration: underline; }
.vmlb-chooser { margin-bottom: 1rem; }
.vmlb-advanced summary { cursor: pointer; font-size: 0.875rem; font-weight: 600; color: var(--vmlb-text); }
.vmlb-advanced[open] summary { margin-bottom: 0.5rem; }
</style>
