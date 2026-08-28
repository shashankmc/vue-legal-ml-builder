<script setup lang="ts">
import { computed, inject, onMounted, reactive, ref } from 'vue'
import type { Dataset, MLAdapter } from '../types'
import { useDatasets } from '../composables/useDatasets'

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
  { value: 'summarization', label: 'Text Summarization', desc: 'Required columns: text, summary' },
  { value: 'topic_modeling', label: 'Topic Modeling', desc: 'Required columns: text' },
  { value: 'clustering', label: 'Document Clustering', desc: 'Required columns: text' },
  { value: 'judgment_prediction', label: 'Judgment Prediction', desc: 'Required columns: text, judgment' },
]

const showUpload = ref(false)
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
    uploadState.error = 'Please fill in all required fields'
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

async function onDelete(id: string) {
  if (!confirm('Are you sure you want to delete this dataset?')) return
  await remove(id)
}
</script>

<template>
  <div class="vmlb-list">
    <div class="vmlb-list-header">
      <h2>Datasets</h2>
      <button class="vmlb-btn-primary" @click="showUpload = true">+ Upload Dataset</button>
    </div>

    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>
    <div v-if="isLoading" class="vmlb-spinner-wrap"><div class="vmlb-spinner" /></div>

    <div v-else-if="datasets.length === 0" class="vmlb-empty">
      <p>No datasets yet. Upload a CSV, XLSX, or JSON file (max 10,000 rows) to get started.</p>
      <button class="vmlb-btn-primary" @click="showUpload = true">Upload Your First Dataset</button>
    </div>

    <div v-else class="vmlb-grid">
      <div v-for="ds in datasets" :key="ds.id" class="vmlb-model-tile">
        <div class="vmlb-tile-head">
          <div>
            <h3>{{ ds.name }}</h3>
            <p class="vmlb-muted">{{ ds.task_type }}</p>
          </div>
          <button class="vmlb-icon-btn" title="Delete dataset" @click="onDelete(ds.id)">✕</button>
        </div>
        <div class="vmlb-tile-body">
          <div class="vmlb-row"><span class="vmlb-muted">Rows:</span><span>{{ ds.row_count.toLocaleString() }}</span></div>
          <div class="vmlb-row"><span class="vmlb-muted">Columns:</span><span>{{ ds.columns?.length || 0 }}</span></div>
        </div>
        <div class="vmlb-tile-actions">
          <button class="vmlb-btn-secondary" @click="emit('view', ds)">View</button>
          <button class="vmlb-btn-secondary" @click="emit('eda', ds)">EDA</button>
          <button class="vmlb-btn-primary" @click="emit('createModel', ds)">Create Model</button>
        </div>
      </div>
    </div>

    <!-- Upload modal -->
    <div v-if="showUpload" class="vmlb-modal-backdrop" @click="showUpload = false">
      <div class="vmlb-modal" @click.stop>
        <div class="vmlb-modal-head">
          <h3>Upload Dataset</h3>
          <button class="vmlb-icon-btn" @click="showUpload = false">✕</button>
        </div>

        <div v-if="uploadState.error" class="vmlb-alert-error">{{ uploadState.error }}</div>

        <div class="vmlb-field">
          <label>Dataset File *</label>
          <input type="file" accept=".csv,.xlsx,.json" @change="onFileChange" />
        </div>
        <div class="vmlb-field">
          <label>Dataset Name *</label>
          <input v-model="uploadState.name" type="text" placeholder="e.g., Legal Contracts Q1 2026" />
        </div>
        <div class="vmlb-field">
          <label>Task Type *</label>
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
            {{ uploadState.isLoading ? 'Uploading…' : 'Upload Dataset' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vmlb-list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
.vmlb-list-header h2 { font-size: 1.5rem; font-weight: 700; }
.vmlb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: 1.25rem; }
.vmlb-model-tile { border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.75rem; padding: 1.25rem; background: var(--vmlb-surface, #fff); }
.vmlb-tile-head { display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem; }
.vmlb-tile-head h3 { font-weight: 600; }
.vmlb-icon-btn { background: none; border: none; color: #9ca3af; cursor: pointer; font-size: 1rem; }
.vmlb-icon-btn:hover { color: #dc2626; }
.vmlb-tile-body { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-row { display: flex; justify-content: space-between; }
.vmlb-tile-actions { display: flex; gap: 0.5rem; }
.vmlb-tile-actions button { flex: 1; }
.vmlb-empty { text-align: center; padding: 3rem 0; color: var(--vmlb-text-muted, #6b7280); }
.vmlb-empty button { margin-top: 1rem; }
.vmlb-btn-primary, .vmlb-btn-secondary { padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; font-size: 0.875rem; cursor: pointer; border: 1px solid transparent; }
.vmlb-btn-primary { background: var(--vmlb-primary, #4f46e5); color: #fff; }
.vmlb-btn-primary:disabled { background: #d1d5db; cursor: not-allowed; }
.vmlb-btn-secondary { background: #fff; color: #374151; border-color: var(--vmlb-border, #d1d5db); }
.vmlb-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-muted { color: var(--vmlb-text-muted, #6b7280); }
.vmlb-spinner-wrap { display: flex; justify-content: center; padding: 3rem 0; }
.vmlb-spinner { width: 2.5rem; height: 2.5rem; border-radius: 999px; border: 3px solid #e5e7eb; border-bottom-color: var(--vmlb-primary, #4f46e5); animation: vmlb-spin 0.7s linear infinite; }
@keyframes vmlb-spin { to { transform: rotate(360deg); } }
.vmlb-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: flex-start; justify-content: center; padding-top: 5rem; z-index: 50; }
.vmlb-modal { background: #fff; border-radius: 0.5rem; padding: 1.5rem; width: 90%; max-width: 32rem; }
.vmlb-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.vmlb-modal-head h3 { font-weight: 600; font-size: 1.125rem; }
.vmlb-field { margin-bottom: 1rem; }
.vmlb-field label { display: block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.25rem; }
.vmlb-field input, .vmlb-field select, .vmlb-field textarea { width: 100%; border: 1px solid var(--vmlb-border, #d1d5db); border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
.vmlb-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem; }
</style>
