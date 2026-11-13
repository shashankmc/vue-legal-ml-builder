<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AnnotatorView } from 'legal-annotation-kit'
import type { Assignment, Proposal } from 'legal-annotation-kit'
import 'legal-annotation-kit/style.css'
import type { AnnotationAssignment, AnnotationTask, LlmSuggestion, MLAdapter } from '../types'
import {
  ANNOTATION_STATE,
  annotationControls,
  annotationState,
  count,
  labelledRows,
  nothingToAnnotateReason,
} from '../annotation/annotationState'
import { kitLabelset } from '../annotation/labelColours'
import { useAnnotation } from '../composables/useAnnotation'
import { taskTypeLabel } from './modelCatalogData'
import ActiveLearningPanel from './ActiveLearningPanel.vue'
import LlmAssistPanel from './LlmAssistPanel.vue'
import LabelReview from './LabelReview.vue'
import Icon from './shared/Icon.vue'

const DEFAULT_ENTITY_TYPES = ['Person', 'Organization', 'Location', 'Date', 'Misc']

const props = withDefaults(defineProps<{
  adapter?: MLAdapter
  projectId: string
  datasetId?: string
  /** Label names. Left out, they come from the Dataset. */
  labels?: string[]
  taskType?: string
  /** How the host names `taskType`. Left out, the package's own wording. */
  taskTypeName?: string
  projectName?: string
  guidelines?: string
  /** Rows of the Dataset, and those without a label, as the host counts them. */
  rowCount?: number
  unlabelledRows?: number
  /** Where the end states link to. Left out, those links are not shown. */
  backHref?: string
  createModelHref?: string
  /** Hide this view and skip every annotation operation (hosts with their own
   * annotation, e.g. Legal Blocks). Defaults to the plugin's `hideAnnotation`. */
  hideAnnotation?: boolean
}>(), { hideAnnotation: undefined, taskType: 'classification', rowCount: 0, unlabelledRows: 0 })

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const injectedHide = inject<boolean>('vmlb:hideAnnotation', false)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const hidden = computed(() => props.hideAnnotation ?? injectedHide)
const {
  task, stats, isLoading, isSubmitting, error, holdout,
  loadNext, saveAssignment, skip, confirmSuggestion, reviewSkipped, setHoldout,
} = useAnnotation(adapter.value as MLAdapter)

const datasetLabels = ref<string[]>([])
const usedLabels = ref<string[]>([])
/** Labels typed this session on a Dataset that names none; saved with an item. */
const sessionLabels = ref<string[]>([])
const newLabel = ref('')
const showGuidelines = ref(true)
const notice = ref('')
const labelsVersion = ref(0)
/** LLM suggestions waiting for a person, from LlmAssistPanel. */
const suggestions = ref<LlmSuggestion[]>([])
/** The item on screen as legal-annotation-kit opens it. */
const opened = ref<AnnotationAssignment | null>(null)

const controls = computed(() => annotationControls(props.taskType))
/** The labels an LLM may choose from: legal-ml-core needs the Dataset to name two. */
const namedLabels = computed(() => (props.labels?.length ? props.labels : datasetLabels.value))
/** A Dataset that names no labels takes labels typed here. */
const typedLabels = computed(() => !!controls.value && !namedLabels.value.length)
const offeredLabels = computed(() => {
  const base = namedLabels.value.length
    ? namedLabels.value
    : opened.value?.labels.length
      ? opened.value.labels
      : controls.value === 'entities'
        ? DEFAULT_ENTITY_TYPES
        : usedLabels.value
  return [...base, ...sessionLabels.value]
})
const labelset = computed(() => kitLabelset(offeredLabels.value))
const annotationLevel = computed(
  () => opened.value?.annotationLevel ?? (controls.value === 'entities' ? 'word' : 'document'),
)
const total = computed(() => stats.value?.total ?? 0)
const annotated = computed(() => stats.value?.annotated ?? 0)
const holdoutRemaining = computed(() => stats.value?.holdout_remaining ?? 0)
const position = computed(() => ({ current: Math.min(annotated.value + 1, Math.max(total.value, 1)), total: Math.max(total.value, 1) }))
const screenState = computed(() =>
  annotationState({
    taskType: props.taskType,
    hasItem: !!task.value,
    total: total.value,
    annotated: annotated.value,
    unlabelledRows: props.unlabelledRows,
    holdoutRemaining: holdoutRemaining.value,
  }),
)
const share = computed(() =>
  labelledRows({ rowCount: props.rowCount, total: total.value, annotated: annotated.value }),
)
const skippedCount = computed(() => total.value - annotated.value - holdoutRemaining.value)
const showLoop = computed(
  () => controls.value === 'single' && !!props.datasetId && !!adapter.value?.getActiveLearningState,
)
const showLlm = computed(
  () => controls.value === 'single' && !!props.datasetId && !!adapter.value?.getLlmStatus && namedLabels.value.length >= 2,
)
const suggestion = computed(() =>
  showLlm.value && task.value ? suggestions.value.find((s) => s.task_id === task.value!.id && s.status === 'pending') ?? null : null,
)

/** The waiting suggestion as a kit proposal: never a label until accepted (BAIGLE ADR 0003). */
const proposals = computed<Proposal[]>(() =>
  suggestion.value
    ? [{
        id: suggestion.value.id,
        kind: 'document',
        label: suggestion.value.label,
        rationale: suggestion.value.rationale,
        source: `${suggestion.value.model} · prompt v${suggestion.value.prompt_version}`,
      }]
    : [],
)

// Review of the labels the Dataset already has: file labels included (#148).
const reviewing = ref(false)
const canReview = computed(
  () => !!adapter.value?.pageAnnotationTasks && !!props.datasetId && !!controls.value && annotated.value > 0,
)
async function closeReview() {
  reviewing.value = false
  await reload()
}

async function reload() {
  await loadNext(props.projectId, props.datasetId)
}

async function loadDatasetLabels() {
  if (!props.datasetId || props.labels?.length) return
  try {
    const dataset = await adapter.value?.getDataset(props.datasetId)
    datasetLabels.value = dataset?.labels ?? []
  } catch {
    // The label names are a convenience: typed labels still work without them.
    datasetLabels.value = []
  }
}

/** Open the item on screen as an Assignment; the kit is shown once it has one. */
async function openItem(item: AnnotationTask | null) {
  opened.value = null
  if (!item) return
  try {
    const result = await adapter.value!.getAnnotationAssignment(item.id)
    if (task.value?.id === item.id) opened.value = result
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to open this item'
  }
}

onMounted(() => {
  if (hidden.value) return
  loadDatasetLabels()
  reload()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(task, openItem)

/** The kit's Save. Throwing keeps the item and the work in the kit, which shows why. */
async function onKitSave(assignment: Assignment) {
  const tags = assignment.document_annotations
  if (controls.value !== 'entities' && !tags.length) throw new Error('Choose a label for this item.')
  // A label chosen over a waiting suggestion confirms or corrects it, so the agreement counts it.
  const saved = suggestion.value
    ? await confirmSuggestion(suggestion.value.id, tags[0].label, props.projectId, props.datasetId)
    : await saveAssignment(assignment, props.projectId, props.datasetId)
  if (!saved) {
    const reason = error.value ?? 'Failed to save annotation'
    error.value = null
    throw new Error(reason)
  }
  notice.value = 'Annotation saved'
  labelsVersion.value += 1
}

function addLabel() {
  const label = newLabel.value.trim()
  if (label && !offeredLabels.value.includes(label)) sessionLabels.value = [...sessionLabels.value, label]
  newLabel.value = ''
}

/** Bulk accept labelled items behind the queue's back. */
async function onLlmLabelled() {
  labelsVersion.value += 1
  await reload()
}

/** Accepting confirms the suggestion; choosing another label for it corrects it. */
async function onProposalAnswered(event: { proposal: Proposal; annotation: { label: string } }, corrected: boolean) {
  const label = corrected ? event.annotation.label : undefined
  if (await confirmSuggestion(String(event.proposal.id), label, props.projectId, props.datasetId)) {
    notice.value = corrected ? 'Suggestion corrected' : 'Suggestion accepted'
    labelsVersion.value += 1
  }
}

async function onRejectSuggestion() {
  const rejected = suggestion.value
  if (!rejected || isSubmitting.value) return
  error.value = null
  try {
    await adapter.value!.rejectLlmSuggestion!(rejected.id)
    suggestions.value = suggestions.value.filter((s) => s.id !== rejected.id)
    notice.value = 'Suggestion rejected. Choose a label yourself.'
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to reject the suggestion'
  }
}

async function onSkip() {
  if (await skip(props.projectId, props.datasetId)) notice.value = 'Item skipped'
}

async function onReviewSkipped() {
  await reviewSkipped(props.projectId, props.datasetId)
}

// S skips. Saving is the kit's own button; its label keys are its own too.
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (!task.value || isSubmitting.value || holdout.value) return
  if (event.key.toLowerCase() === 's') onSkip()
}

async function onLabelHoldout() {
  await setHoldout(true, props.projectId, props.datasetId)
  await nextTick()
}
</script>

<template>
  <div v-if="!hidden" class="vmlb-annotate">
    <header v-if="projectName" class="vmlb-annotate-head">
      <h1>{{ projectName }}</h1>
      <span class="vmlb-badge">{{ taskTypeName ?? taskTypeLabel(taskType) }}</span>
    </header>

    <div v-if="stats && (rowCount || stats.total)" class="vmlb-progress">
      <div class="vmlb-progress-head">
        <span class="vmlb-label">Annotation progress</span>
        <span v-if="rowCount" class="vmlb-muted vmlb-num">{{ share.labelled }} / {{ count(share.rows, 'row') }} · {{ share.percentage }}%</span>
        <span v-else class="vmlb-muted vmlb-num">{{ stats.annotated }} / {{ stats.total }} · {{ stats.percentage }}%</span>
      </div>
      <div class="vmlb-progress-bar">
        <div class="vmlb-progress-fill" :style="{ transform: `scaleX(${(rowCount ? share.percentage : stats.percentage) / 100})` }" />
      </div>
    </div>

    <ActiveLearningPanel
      v-if="showLoop && adapter && datasetId"
      :adapter="adapter"
      :dataset-id="datasetId"
      :can-start="!!task"
      :labels-version="labelsVersion"
      :labelling-holdout="holdout"
      @started="reload"
      @reordered="reload"
      @label-holdout="onLabelHoldout"
      @labels="usedLabels = $event"
    />

    <LlmAssistPanel
      v-if="showLlm && adapter && datasetId"
      :adapter="adapter"
      :project-id="projectId"
      :dataset-id="datasetId"
      :labels="namedLabels"
      :current-task-id="task?.id ?? null"
      :labels-version="labelsVersion"
      @suggestions="suggestions = $event"
      @labelled="onLlmLabelled"
    />

    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>
    <div v-if="canReview && !reviewing" class="vmlb-annotate-modes">
      <button class="vmlb-btn-secondary" @click="reviewing = true">Review labels</button>
      <span class="vmlb-muted">Go through the {{ count(annotated, 'label') }} this Dataset has, and change any.</span>
    </div>
    <LabelReview
      v-if="reviewing && adapter && datasetId"
      :adapter="adapter"
      :project-id="projectId"
      :dataset-id="datasetId"
      :labels="offeredLabels"
      :document-label-mode="controls === 'multi' ? 'multi' : 'single'"
      @saved="labelsVersion += 1"
      @close="closeReview"
    />
    <div v-else-if="isLoading && !task" class="vmlb-annotation-skeleton">
      <div class="vmlb-skeleton vmlb-skeleton-line" style="width: 90%" />
      <div class="vmlb-skeleton vmlb-skeleton-line" style="width: 75%" />
      <div class="vmlb-skeleton vmlb-skeleton-tile" />
    </div>

    <template v-else-if="task">
      <div v-if="holdout" class="vmlb-annotate-holdout">
        <span>You are labelling held-back items. They check the Model and are never trained on.</span>
        <button class="vmlb-btn-tertiary" @click="setHoldout(false, projectId, datasetId)">Back to the queue</button>
      </div>

      <details class="vmlb-card vmlb-guidelines" :open="showGuidelines" @toggle="showGuidelines = ($event.target as HTMLDetailsElement).open">
        <summary>Guidelines</summary>
        <p v-if="guidelines" class="vmlb-guidelines-text">{{ guidelines }}</p>
        <p v-else class="vmlb-muted">No guidelines provided for this Project.</p>
      </details>

      <p class="vmlb-muted vmlb-row-note">Row {{ task.item_index + 1 }} of the Dataset</p>
      <p v-if="opened?.hint" class="vmlb-hint" role="note">The file lists: {{ opened.hint }}</p>

      <div class="vmlb-kit">
        <AnnotatorView
          v-if="opened"
          :key="task.id"
          :document="opened.document"
          :assignment="opened.assignment"
          :labelset="labelset"
          :annotation-level="annotationLevel"
          :position="position"
          :navigation="false"
          :draft="false"
          :show-relations="false"
          :show-confidence="false"
          :show-metadata="false"
          :document-label-mode="controls === 'multi' ? 'multi' : 'single'"
          :allow-overlap="controls !== 'entities'"
          :on-save="onKitSave"
          :proposals="proposals"
          @proposal-accepted="onProposalAnswered($event, false)"
          @proposal-corrected="onProposalAnswered($event, true)"
          @proposal-rejected="onRejectSuggestion"
        >
          <template #header-actions>
            <button v-if="!holdout" class="vmlb-btn-secondary vmlb-skip" :disabled="isSubmitting" title="Skip this item (S key)" @click="onSkip">
              Skip
            </button>
          </template>
          <template v-if="typedLabels" #sidebar-top>
            <form class="vmlb-new-label" @submit.prevent="addLabel">
              <input v-model="newLabel" type="text" placeholder="New label" aria-label="New label" />
              <button type="submit" class="vmlb-btn-tertiary" :disabled="!newLabel.trim()">Add</button>
            </form>
          </template>
        </AnnotatorView>
        <div v-else class="vmlb-skeleton vmlb-skeleton-tile" />
      </div>
      <p class="vmlb-muted vmlb-keys">
        <template v-if="!holdout">Press <kbd>S</kbd> to skip · </template>Choose a label, then Save
        <span v-if="notice" role="status" class="vmlb-notice">{{ notice }}</span>
      </p>
    </template>

    <div v-else-if="screenState === ANNOTATION_STATE.FINISHED" class="vmlb-empty">
      <Icon name="check" size="2rem" class="vmlb-empty-icon" />
      <p class="vmlb-empty-title">Every item has a label</p>
      <p>{{ annotated }} of {{ count(total, 'item') }} are labelled. Review labels to change any of them.</p>
      <a v-if="backHref" :href="backHref" class="vmlb-btn-primary">Back to Project</a>
    </div>

    <div v-else-if="screenState === ANNOTATION_STATE.SKIPPED_REMAINING" class="vmlb-empty">
      <p class="vmlb-empty-title">{{ count(skippedCount, 'skipped item') }} left</p>
      <p>You annotated {{ annotated }} of {{ count(total, 'item') }}. Skipped items do not count as labelled.</p>
      <button v-if="adapter?.listAnnotationTasks" class="vmlb-btn-primary" @click="onReviewSkipped">Review skipped items</button>
      <a v-if="backHref" :href="backHref" class="vmlb-btn-secondary">Back to Project</a>
    </div>

    <div v-else-if="screenState === ANNOTATION_STATE.HOLDOUT_REMAINING" class="vmlb-empty">
      <p class="vmlb-empty-title">{{ count(holdoutRemaining, 'held-back item') }} left</p>
      <p>The queue is finished. Held-back items check the Model and are labelled only if you choose to.</p>
      <button class="vmlb-btn-primary" @click="onLabelHoldout">Label held-back items</button>
      <a v-if="backHref" :href="backHref" class="vmlb-btn-secondary">Back to Project</a>
    </div>

    <div v-else-if="screenState === ANNOTATION_STATE.QUEUE_UNAVAILABLE" class="vmlb-empty">
      <p class="vmlb-empty-title">This Dataset could not be opened for annotation</p>
      <p>{{ count(unlabelledRows, 'row still needs', 'rows still need') }} a label, but none could be added to the annotation queue.</p>
      <a v-if="backHref" :href="backHref" class="vmlb-btn-primary">Back to Project</a>
    </div>

    <div v-else class="vmlb-empty">
      <p class="vmlb-empty-title">Nothing to annotate</p>
      <p>{{ nothingToAnnotateReason(taskType) }}</p>
      <a v-if="taskType === 'summarization' && backHref" :href="backHref" class="vmlb-btn-primary">Back to Project</a>
      <a v-else-if="taskType !== 'summarization' && createModelHref" :href="createModelHref" class="vmlb-btn-primary">Create a Model</a>
    </div>

  </div>
</template>

<style scoped>
/* The kit lays an item out in three columns (labels, text, annotations), so the
   workspace is wider than a reading column. */
.vmlb-annotate { max-width: 72rem; margin: 0 auto; }
.vmlb-annotate-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin-bottom: 1rem; }
.vmlb-annotate-head h1 { margin: 0; font-family: var(--vmlb-font-display); font-size: 1.5rem; font-weight: 600; }
.vmlb-progress { margin-bottom: 1.25rem; }
.vmlb-progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.4rem; }
.vmlb-progress-bar {
  width: 100%; height: 0.5rem; overflow: hidden;
  background: var(--vmlb-surface-sunken);
  border-radius: 999px;
  border: 1px solid var(--vmlb-border);
}
.vmlb-progress-fill {
  width: 100%; height: 100%;
  background: var(--vmlb-accent);
  transform-origin: left center;
  transition: transform 0.35s var(--vmlb-ease);
}
.vmlb-annotation-skeleton { display: flex; flex-direction: column; gap: 0.75rem; }
.vmlb-guidelines { margin-bottom: 1.25rem; padding: 0.75rem 1rem; font-size: 0.875rem; }
.vmlb-guidelines summary { cursor: pointer; font-weight: 600; }
.vmlb-guidelines-text { white-space: pre-wrap; line-height: 1.6; }
.vmlb-annotate-holdout { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-row-note { margin: 0 0 0.5rem; font-size: 0.75rem; }
.vmlb-annotate-modes { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-hint {
  margin: 0 0 0.5rem; padding: 0.4rem 0.6rem; border-left: 3px solid var(--vmlb-accent);
  background: var(--vmlb-accent-soft); font-size: 0.8125rem;
}

.vmlb-new-label { display: flex; gap: 0.35rem; margin-bottom: 0.6rem; }
.vmlb-new-label input {
  flex: 1; min-width: 0;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--vmlb-border-strong);
  border-radius: var(--vmlb-radius-sm);
  background: var(--vmlb-surface); color: var(--vmlb-text);
  font-family: inherit; font-size: 0.8125rem;
}
.vmlb-new-label input:focus { outline: none; border-color: var(--vmlb-accent); box-shadow: 0 0 0 3px var(--vmlb-accent-soft); }
.vmlb-keys { margin: 0.75rem 0 0; font-size: 0.75rem; text-align: center; }
.vmlb-keys kbd { padding: 0.05rem 0.3rem; border: 1px solid var(--vmlb-border-strong); border-radius: 0.2rem; font-family: var(--vmlb-font-mono, monospace); }
.vmlb-notice { margin-left: 0.5rem; color: var(--vmlb-accent-strong); font-weight: 600; }
</style>
