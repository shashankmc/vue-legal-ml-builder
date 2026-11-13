<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { AnnotatorView } from 'legal-annotation-kit'
import type { Assignment } from 'legal-annotation-kit'
import type { AnnotationAssignment, AnnotationTask, MLAdapter } from '../types'
import { kitLabelset } from '../annotation/labelColours'
import { assignmentChanged, labelSourceText } from '../annotation/review'

// The labels a Dataset already has, from the file, from people or from an LLM,
// one item at a time in row order, to read and change in the kit (BAIGLE #148).
// Moving past an item unchanged saves nothing, so a file label stays the file's.
const props = defineProps<{
  adapter: MLAdapter
  projectId: string
  datasetId: string
  /** Labels the filter offers; the item's own labels drive the kit. */
  labels: string[]
  /** `single` for single-label types; `multi` otherwise. */
  documentLabelMode: 'single' | 'multi'
}>()

const emit = defineEmits<{ saved: []; close: [] }>()

const filter = ref('')
const index = ref(0)
const total = ref(0)
const task = ref<AnnotationTask | null>(null)
const opened = ref<AnnotationAssignment | null>(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const page = await props.adapter.pageAnnotationTasks!(props.projectId, {
      status: 'annotated',
      datasetId: props.datasetId,
      label: filter.value || undefined,
      includeHoldout: true,
      limit: 1,
      offset: index.value,
    })
    const next = page.tasks[0] ?? null
    const nextOpened = next ? await props.adapter.getAnnotationAssignment(next.id) : null
    // Swap the item and its labels in together: the kit is keyed on the task, so
    // a new task with the old labels would open the next item with them, and a
    // Back or Next would save them onto it.
    total.value = page.total
    task.value = next
    opened.value = nextOpened
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load labels'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(filter, () => {
  index.value = 0
  notice.value = ''
  load()
})

/** Saves only a real change; throwing keeps the work in the kit, which says why. */
async function persist(assignment: Assignment) {
  if (!task.value || !opened.value || !assignmentChanged(opened.value.assignment, assignment)) return
  await props.adapter.saveAnnotationAssignment(task.value.id, assignment)
  opened.value = { ...opened.value, assignment, labelSource: 'human' }
  emit('saved')
}

async function onSave(assignment: Assignment) {
  await persist(assignment)
}

async function onNext(assignment: Assignment) {
  await persist(assignment)
  if (index.value + 1 >= total.value) {
    notice.value = 'That was the last one.'
    return
  }
  index.value += 1
  await load()
}

async function onPrevious(assignment: Assignment) {
  await persist(assignment)
  if (index.value === 0) return
  index.value -= 1
  notice.value = ''
  await load()
}

const source = computed(() => labelSourceText(opened.value?.labelSource))
const currentLabels = computed(() => opened.value?.assignment.document_annotations.map((t) => t.label) ?? [])
const fileSaid = computed(() => {
  const file = opened.value?.fileLabel
  if (!file || opened.value?.labelSource === 'file' || opened.value?.annotationLevel !== 'document') return ''
  return currentLabels.value.includes(file) ? '' : file
})
const labelset = computed(() => kitLabelset([...new Set([...(opened.value?.labels ?? []), ...props.labels])]))
</script>

<template>
  <section class="vmlb-review" aria-label="Review labels">
    <div class="vmlb-review-head">
      <h2 class="vmlb-review-title">Review labels</h2>
      <label class="vmlb-review-filter">
        <span class="vmlb-label">Show</span>
        <select v-model="filter" aria-label="Show labels">
          <option value="">All labels</option>
          <option v-for="label in labels" :key="label" :value="label">{{ label }}</option>
        </select>
      </label>
      <button class="vmlb-btn-tertiary" @click="emit('close')">Back to the queue</button>
    </div>
    <p class="vmlb-muted vmlb-review-intro">
      Change a label and Save, or move on with Next. Only what you change is saved, as your label.
    </p>

    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>
    <p v-else-if="!loading && !task" class="vmlb-muted">No labelled items{{ filter ? ` with ${filter}` : '' }}.</p>

    <template v-if="task && opened">
      <p class="vmlb-review-source">
        <span v-if="source" class="vmlb-badge">{{ source }}</span>
        <span v-if="fileSaid" class="vmlb-muted">The file said: {{ fileSaid }}</span>
        <span class="vmlb-muted">Row {{ task.item_index + 1 }} of the Dataset</span>
      </p>
      <div class="vmlb-kit">
        <AnnotatorView
          :key="task.id"
          :document="opened.document"
          :assignment="opened.assignment"
          :labelset="labelset"
          :annotation-level="opened.annotationLevel ?? 'document'"
          :position="{ current: index + 1, total }"
          :navigation="true"
          :draft="false"
          :show-relations="false"
          :show-confidence="false"
          :show-metadata="false"
          :document-label-mode="documentLabelMode"
          :allow-overlap="opened.annotationLevel === 'document'"
          :on-save="onSave"
          :on-next="onNext"
          :on-previous="onPrevious"
        />
      </div>
    </template>
    <p v-if="notice" role="status" class="vmlb-muted vmlb-review-notice">{{ notice }}</p>
  </section>
</template>

<style scoped>
.vmlb-review { margin-top: 1rem; }
.vmlb-review-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1rem; }
.vmlb-review-title { margin: 0; font-size: 1.125rem; }
.vmlb-review-filter { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
.vmlb-review-filter select {
  padding: 0.3rem 0.5rem; border: 1px solid var(--vmlb-border); border-radius: var(--vmlb-radius-sm);
  background: var(--vmlb-surface); color: var(--vmlb-text); font: inherit; font-size: 0.875rem;
}
.vmlb-review-intro { margin: 0.5rem 0 1rem; font-size: 0.875rem; }
.vmlb-review-source { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin: 0 0 0.5rem; font-size: 0.8125rem; }
.vmlb-review-notice { margin-top: 0.5rem; font-size: 0.875rem; }
</style>
