<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MLAdapter } from '../types'
import {
  ANNOTATION_STATE,
  addEntity,
  annotationControls,
  annotationState,
  canSaveAnnotation,
  count,
  labelledRows,
  nerSegments,
  nothingToAnnotateReason,
  toggleLabel,
} from '../annotation/annotationState'
import type { EntitySpan } from '../annotation/annotationState'
import { useAnnotation } from '../composables/useAnnotation'
import { taskTypeLabel } from './modelCatalogData'
import ActiveLearningPanel from './ActiveLearningPanel.vue'
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
const { task, stats, isLoading, isSubmitting, error, holdout, loadNext, save, skip, reviewSkipped, setHoldout } =
  useAnnotation(adapter.value as MLAdapter)

const datasetLabels = ref<string[]>([])
const usedLabels = ref<string[]>([])
const selectedLabel = ref('')
const entities = ref<EntitySpan[]>([])
const customLabel = ref('')
const showGuidelines = ref(true)
const notice = ref('')
const labelsVersion = ref(0)

const textContainer = ref<HTMLElement | null>(null)
const pendingSpan = ref<Omit<EntitySpan, 'type'> | null>(null)
const popover = ref({ x: 0, y: 0 })

const controls = computed(() => annotationControls(props.taskType))
const labelChoices = computed(() => {
  if (props.labels?.length) return props.labels
  if (datasetLabels.value.length) return datasetLabels.value
  if (controls.value === 'entities') return DEFAULT_ENTITY_TYPES
  return usedLabels.value
})
/** Free text only where the Dataset names no labels. */
const allowsCustomLabel = computed(
  () => controls.value === 'single' && !props.labels?.length && !datasetLabels.value.length,
)
const selectedSet = computed(() => new Set(selectedLabel.value.split(',').filter(Boolean)))
const canSave = computed(() => canSaveAnnotation(props.taskType, selectedLabel.value))
const total = computed(() => stats.value?.total ?? 0)
const annotated = computed(() => stats.value?.annotated ?? 0)
const holdoutRemaining = computed(() => stats.value?.holdout_remaining ?? 0)
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
const segments = computed(() => nerSegments(task.value?.text ?? '', entities.value))
const skippedCount = computed(() => total.value - annotated.value - holdoutRemaining.value)
const showLoop = computed(
  () => controls.value === 'single' && !!props.datasetId && !!adapter.value?.getActiveLearningState,
)

function clearSelection() {
  selectedLabel.value = ''
  entities.value = []
  customLabel.value = ''
  pendingSpan.value = null
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
    // The label names are a convenience: the screen still works by typing them.
    datasetLabels.value = []
  }
}

onMounted(() => {
  if (hidden.value) return
  loadDatasetLabels()
  reload()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

watch(task, clearSelection)

async function onSave() {
  if (controls.value === 'single' && customLabel.value.trim()) selectedLabel.value = customLabel.value.trim()
  if (!canSave.value) {
    error.value = controls.value === 'multi' ? 'Please select at least one label' : 'Please select a label'
    return
  }
  const label = controls.value === 'entities' ? JSON.stringify(entities.value) : selectedLabel.value
  if (await save(label, props.projectId, props.datasetId)) {
    notice.value = 'Annotation saved'
    labelsVersion.value += 1
  }
}

async function onSkip() {
  if (await skip(props.projectId, props.datasetId)) notice.value = 'Item skipped'
}

async function onReviewSkipped() {
  await reviewSkipped(props.projectId, props.datasetId)
}

function onKeydown(event: KeyboardEvent) {
  if (pendingSpan.value) {
    if (event.key === 'Escape') closePopover()
    return
  }
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (!task.value || isSubmitting.value) return
  if (event.key.toLowerCase() === 'n' && canSave.value) onSave()
  else if (event.key.toLowerCase() === 's' && !holdout.value) onSkip()
}

function nodeOffset(container: HTMLElement, node: Node, offset: number) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let chars = 0
  let current: Node | null
  while ((current = walker.nextNode())) {
    if (current === node) return chars + offset
    chars += (current as Text).length
  }
  return chars + offset
}

function onTextMouseUp(event: MouseEvent) {
  if (controls.value !== 'entities' || isSubmitting.value || !textContainer.value) return
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    if (pendingSpan.value) closePopover()
    return
  }
  const range = selection.getRangeAt(0)
  if (!textContainer.value.contains(range.commonAncestorContainer)) return
  const text = selection.toString().trim()
  if (!text) return
  const start = nodeOffset(textContainer.value, range.startContainer, range.startOffset)
  const end = nodeOffset(textContainer.value, range.endContainer, range.endOffset)
  if (start < 0 || end <= start) return
  pendingSpan.value = { text, start, end }
  popover.value = { x: event.clientX, y: event.clientY + 14 }
}

function tagEntity(type: string) {
  if (pendingSpan.value) entities.value = addEntity(entities.value, pendingSpan.value, type)
  closePopover()
}

function closePopover() {
  pendingSpan.value = null
  window.getSelection()?.removeAllRanges()
}

function removeEntity(index: number) {
  entities.value = entities.value.filter((_, i) => i !== index)
}

function entityColour(type: string) {
  const index = labelChoices.value.indexOf(type)
  return `vmlb-entity-${(index >= 0 ? index : 0) % 6}`
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

    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>
    <div v-if="isLoading && !task" class="vmlb-annotation-skeleton">
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

      <div class="vmlb-card vmlb-annotation-card">
        <p class="vmlb-muted vmlb-row-note">Row {{ task.item_index + 1 }} of the Dataset</p>

        <template v-if="controls === 'entities'">
          <p class="vmlb-muted vmlb-row-note">Select a text span to tag it as a named entity.</p>
          <div ref="textContainer" class="vmlb-text vmlb-text-select" @mouseup="onTextMouseUp">
            <template v-for="(segment, i) in segments" :key="i">
              <mark v-if="segment.type" :class="entityColour(segment.type)">{{ segment.text }}<sup>{{ segment.type }}</sup></mark>
              <template v-else>{{ segment.text }}</template>
            </template>
          </div>

          <p class="vmlb-label">Tagged entities</p>
          <p v-if="!entities.length" class="vmlb-muted">No entities tagged yet. Select text in the passage above to tag spans.</p>
          <ul v-else class="vmlb-entity-list">
            <li v-for="(entity, i) in entities" :key="`${entity.start}-${entity.end}`" :class="entityColour(entity.type)">
              <strong>{{ entity.type }}</strong> <span>"{{ entity.text }}"</span>
              <button class="vmlb-btn-tertiary" :disabled="isSubmitting" :aria-label="`Remove ${entity.text}`" @click="removeEntity(i)">
                <Icon name="close" />
              </button>
            </li>
          </ul>
        </template>

        <template v-else>
          <p class="vmlb-text">{{ task.text }}</p>

          <div v-if="labelChoices.length" class="vmlb-label-grid" role="group" aria-label="Labels">
            <button
              v-for="label in labelChoices"
              :key="label"
              class="vmlb-label-btn"
              :class="{ 'vmlb-label-btn-on': selectedSet.has(label) }"
              :aria-pressed="selectedSet.has(label)"
              :disabled="isSubmitting"
              @click="selectedLabel = controls === 'multi' ? toggleLabel(selectedLabel, label) : label; customLabel = ''"
            >
              {{ label }}
            </button>
          </div>
          <div v-if="allowsCustomLabel" class="vmlb-custom-label">
            <input v-model="customLabel" type="text" placeholder="Type a label…" aria-label="Label" @input="selectedLabel = ''" @keydown.enter="onSave" />
          </div>
        </template>

        <div class="vmlb-annotate-actions">
          <button v-if="!holdout" class="vmlb-btn-secondary vmlb-skip" :disabled="isSubmitting" title="Skip this item (S key)" @click="onSkip">Skip</button>
          <button class="vmlb-btn-primary" :disabled="isSubmitting || (!canSave && !customLabel.trim())" title="Save and next (N key)" @click="onSave">
            {{ isSubmitting ? 'Saving…' : 'Save & Next' }}
          </button>
        </div>
        <p class="vmlb-muted vmlb-keys">
          <template v-if="!holdout">Press <kbd>S</kbd> to skip · </template>Press <kbd>N</kbd> to save &amp; next
          <span v-if="notice" role="status" class="vmlb-notice">{{ notice }}</span>
        </p>
      </div>
    </template>

    <div v-else-if="screenState === ANNOTATION_STATE.FINISHED" class="vmlb-empty">
      <Icon name="check" size="2rem" class="vmlb-empty-icon" />
      <p class="vmlb-empty-title">All items annotated</p>
      <p>You annotated {{ annotated }} of {{ count(total, 'item') }}.</p>
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

    <div v-if="pendingSpan" class="vmlb-entity-popover" :style="{ left: `${popover.x}px`, top: `${popover.y}px` }">
      <p class="vmlb-label">Tag "{{ pendingSpan.text.length > 24 ? `${pendingSpan.text.slice(0, 24)}…` : pendingSpan.text }}" as:</p>
      <div class="vmlb-label-grid">
        <button v-for="label in labelChoices" :key="label" class="vmlb-label-btn" :class="entityColour(label)" @click="tagEntity(label)">{{ label }}</button>
        <button class="vmlb-btn-tertiary" @click="closePopover">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vmlb-annotate { max-width: 48rem; margin: 0 auto; }
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
.vmlb-annotation-card { padding: 2rem; }
.vmlb-guidelines { margin-bottom: 1.25rem; padding: 0.75rem 1rem; font-size: 0.875rem; }
.vmlb-guidelines summary { cursor: pointer; font-weight: 600; }
.vmlb-guidelines-text { white-space: pre-wrap; line-height: 1.6; }
.vmlb-annotate-holdout { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-row-note { margin: 0 0 0.75rem; font-size: 0.75rem; }
.vmlb-text {
  margin: 0 0 1.75rem;
  font-family: var(--vmlb-font-display);
  font-size: 1.1875rem;
  line-height: 1.7;
  max-width: 62ch;
  white-space: pre-wrap;
}
.vmlb-text-select { cursor: text; }
.vmlb-text mark { padding: 0 0.15rem; border-radius: 0.2rem; }
.vmlb-text sup { margin-left: 0.15rem; font-size: 0.625rem; font-weight: 700; opacity: 0.8; }
.vmlb-label-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem; }
.vmlb-label-btn {
  padding: 0.5rem 0.9rem;
  border: 1px solid var(--vmlb-border-strong);
  border-radius: var(--vmlb-radius-md);
  background: var(--vmlb-surface);
  color: var(--vmlb-text);
  font-family: inherit; font-size: 0.875rem; font-weight: 500;
  cursor: pointer;
  transition: border-color var(--vmlb-duration) var(--vmlb-ease),
    background-color var(--vmlb-duration) var(--vmlb-ease),
    color var(--vmlb-duration) var(--vmlb-ease),
    transform var(--vmlb-duration) var(--vmlb-ease);
}
.vmlb-label-btn:hover:not(:disabled) {
  border-color: var(--vmlb-accent);
  background: var(--vmlb-accent-soft);
  color: var(--vmlb-accent-strong);
  transform: translateY(-1px);
}
.vmlb-label-btn:active { transform: scale(0.98); }
.vmlb-label-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.vmlb-label-btn-on { border-color: var(--vmlb-accent); background: var(--vmlb-accent-soft); color: var(--vmlb-accent-strong); box-shadow: inset 0 0 0 1px var(--vmlb-accent); }
.vmlb-custom-label { display: flex; gap: 0.5rem; margin-bottom: 1.25rem; }
.vmlb-custom-label input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vmlb-border-strong);
  border-radius: var(--vmlb-radius-md);
  background: var(--vmlb-surface); color: var(--vmlb-text);
  font-family: inherit; font-size: 0.875rem;
}
.vmlb-custom-label input:focus { outline: none; border-color: var(--vmlb-accent); box-shadow: 0 0 0 3px var(--vmlb-accent-soft); }
.vmlb-annotate-actions { display: flex; justify-content: center; gap: 0.75rem; margin-top: 0.5rem; }
.vmlb-keys { margin: 0.9rem 0 0; font-size: 0.75rem; text-align: center; }
.vmlb-keys kbd { padding: 0.05rem 0.3rem; border: 1px solid var(--vmlb-border-strong); border-radius: 0.2rem; font-family: var(--vmlb-font-mono, monospace); }
.vmlb-notice { margin-left: 0.5rem; color: var(--vmlb-accent-strong); font-weight: 600; }
.vmlb-entity-list { display: flex; flex-direction: column; gap: 0.4rem; margin: 0 0 1rem; padding: 0; list-style: none; font-size: 0.875rem; }
.vmlb-entity-list li { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.35rem 0.75rem; border-radius: var(--vmlb-radius-md); }
.vmlb-entity-list span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vmlb-entity-popover {
  position: fixed; z-index: 50; transform: translateX(-50%); padding: 0.75rem;
  background: var(--vmlb-surface); border: 1px solid var(--vmlb-border-strong); border-radius: var(--vmlb-radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
}
.vmlb-entity-popover .vmlb-label-grid { margin-bottom: 0; }
.vmlb-entity-0 { background: #dbeafe; color: #1e3a8a; }
.vmlb-entity-1 { background: #dcfce7; color: #14532d; }
.vmlb-entity-2 { background: #ffedd5; color: #7c2d12; }
.vmlb-entity-3 { background: #f3e8ff; color: #581c87; }
.vmlb-entity-4 { background: #fce7f3; color: #831843; }
.vmlb-entity-5 { background: #cffafe; color: #164e63; }
</style>
