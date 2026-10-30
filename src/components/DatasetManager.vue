<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from 'vue'
import type { Dataset, MLAdapter } from '../types'
import { useDatasets } from '../composables/useDatasets'
import { taskTypeLabel } from './modelCatalogData'
import Icon from './shared/Icon.vue'

const props = defineProps<{ adapter?: MLAdapter }>()
const emit = defineEmits<{ view: [dataset: Dataset]; eda: [dataset: Dataset]; createModel: [dataset: Dataset] }>()

const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { datasets, isLoading, error, load, upload, remove } = useDatasets(adapter.value as MLAdapter)

onMounted(load)

const TASK_TYPES = [
  { value: 'classification', label: 'Text Classification', desc: 'Required columns: text, label' },
  { value: 'document_classification', label: 'Document Classification', desc: 'Required columns: text, label' },
  { value: 'ner', label: 'Named Entity Recognition', desc: 'Required columns: text, entities' },
  { value: 'summarization', label: 'Text Summarisation', desc: 'Required columns: text, summary' },
  { value: 'topic_modeling', label: 'Topic Modelling', desc: 'Required columns: text' },
  { value: 'clustering', label: 'Document Clustering', desc: 'Required columns: text' },
  { value: 'judgment_prediction', label: 'Judgment Prediction', desc: 'Required columns: text, judgment' },
]

const showUpload = ref(false)
const confirmingId = ref<string | null>(null)
const uploadState = reactive({ file: null as File | null, name: '', description: '', taskType: '', isLoading: false, error: '' })

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    uploadState.file = file
    if (!uploadState.name) uploadState.name = file.name.replace(/\.[^/.]+$/, '')
  }
}

async function submitUpload() {
  if (!uploadState.file || !uploadState.name || !uploadState.taskType) {
    uploadState.error = 'Add a file, a name, and a task type before uploading.'
    return
  }
  try {
    uploadState.isLoading = true
    uploadState.error = ''
    await upload(uploadState.file, {
      name: uploadState.name,
      description: uploadState.description,
      task_type: uploadState.taskType,
    })
    showUpload.value = false
    Object.assign(uploadState, { file: null, name: '', description: '', taskType: '' })
  } catch (err) {
    uploadState.error = err instanceof Error ? err.message : 'Upload failed'
  } finally {
    uploadState.isLoading = false
  }
}

async function confirmDelete(id: string) {
  await remove(id)
  confirmingId.value = null
}
</script>

<template>
  <div class="vmlb-list">
    <div class="vmlb-list-header">
      <div>
        <h2 class="vmlb-display">Datasets</h2>
        <p class="vmlb-muted">Raw material for training — upload a table and pick its task type.</p>
      </div>
      <button class="vmlb-btn-primary" @click="showUpload = true">
        <Icon name="upload" /> Upload Dataset
      </button>
    </div>

    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>

    <div v-if="isLoading" class="vmlb-grid" aria-label="Loading datasets">
      <div v-for="i in 3" :key="i" class="vmlb-skeleton vmlb-skeleton-tile" />
    </div>

    <div v-else-if="datasets.length === 0" class="vmlb-empty">
      <Icon name="dataset" size="2rem" class="vmlb-empty-icon" />
      <p class="vmlb-empty-title">No datasets yet</p>
      <p>Upload a CSV, XLSX, or JSON file (up to 10,000 rows) to get started.</p>
      <button class="vmlb-btn-primary" @click="showUpload = true">Upload your first dataset</button>
    </div>

    <div v-else class="vmlb-grid">
      <article v-for="ds in datasets" :key="ds.id" class="vmlb-tile">
        <div class="vmlb-tile-head">
          <div>
            <h3>{{ ds.name }}</h3>
            <p class="vmlb-muted vmlb-capitalize">{{ taskTypeLabel(ds.task_type) }}</p>
          </div>
          <button class="vmlb-icon-btn" title="Delete dataset" @click="confirmingId = ds.id">
            <Icon name="close" />
          </button>
        </div>
        <div class="vmlb-tile-body">
          <div class="vmlb-row">
            <span class="vmlb-muted">Rows</span>
            <span class="vmlb-num">{{ ds.row_count.toLocaleString() }}</span>
          </div>
          <div class="vmlb-row">
            <span class="vmlb-muted">Columns</span>
            <span class="vmlb-num">{{ ds.columns?.length || 0 }}</span>
          </div>
        </div>

        <div v-if="confirmingId === ds.id" class="vmlb-confirm">
          <span>Delete this dataset?</span>
          <div class="vmlb-confirm-actions">
            <button class="vmlb-btn-tertiary" @click="confirmingId = null">Cancel</button>
            <button class="vmlb-btn-primary" @click="confirmDelete(ds.id)">Delete</button>
          </div>
        </div>
        <div v-else class="vmlb-tile-actions">
          <button class="vmlb-btn-secondary" @click="emit('view', ds)">View</button>
          <button class="vmlb-btn-secondary" @click="emit('eda', ds)">EDA</button>
          <button class="vmlb-btn-primary" @click="emit('createModel', ds)">Create Model</button>
        </div>
      </article>
    </div>

    <!-- Upload modal -->
    <div v-if="showUpload" class="vmlb-modal-backdrop" @click="showUpload = false">
      <div class="vmlb-modal" @click.stop>
        <div class="vmlb-modal-head">
          <h3>Upload dataset</h3>
          <button class="vmlb-icon-btn" title="Close" @click="showUpload = false"><Icon name="close" /></button>
        </div>

        <div v-if="uploadState.error" class="vmlb-alert-error">
          <Icon name="alert" /> {{ uploadState.error }}
        </div>

        <div class="vmlb-field">
          <label>Dataset file *</label>
          <input type="file" accept=".csv,.xlsx,.json" @change="onFileChange" />
        </div>
        <div class="vmlb-field">
          <label>Dataset name *</label>
          <input v-model="uploadState.name" type="text" placeholder="e.g., Lease agreements, Q1 2026" />
        </div>
        <div class="vmlb-field">
          <label>Task type *</label>
          <select v-model="uploadState.taskType">
            <option value="">Choose a task type…</option>
            <option v-for="t in TASK_TYPES" :key="t.value" :value="t.value">{{ t.label }} — {{ t.desc }}</option>
          </select>
        </div>
        <div class="vmlb-field">
          <label>Description (optional)</label>
          <textarea v-model="uploadState.description" rows="2" />
        </div>

        <div class="vmlb-actions">
          <button class="vmlb-btn-secondary" @click="showUpload = false">Cancel</button>
          <button class="vmlb-btn-primary" :disabled="uploadState.isLoading" @click="submitUpload">
            {{ uploadState.isLoading ? 'Uploading…' : 'Upload dataset' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vmlb-list-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
.vmlb-list-header h2 { margin: 0 0 0.25rem; font-size: 1.75rem; }
.vmlb-list-header .vmlb-muted { margin: 0; max-width: 48ch; }
.vmlb-capitalize { text-transform: capitalize; }
.vmlb-confirm {
  display: flex; flex-direction: column; gap: 0.5rem; margin-top: auto;
  padding-top: 0.75rem; border-top: 1px dashed var(--vmlb-border-strong);
  font-size: 0.8125rem; color: var(--vmlb-text-muted);
}
.vmlb-confirm-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
@media (max-width: 40rem) {
  .vmlb-list-header { flex-direction: column; align-items: flex-start; }
}
</style>
