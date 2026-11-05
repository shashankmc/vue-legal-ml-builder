<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { count } from '../annotation/annotationState'
import { SUGGEST_BATCH_SIZE, percent, queueOrder, tokens } from '../annotation/llmAssist'
import { useLlmAssist } from '../composables/useLlmAssist'
import type { Id, LlmSuggestion, MLAdapter } from '../types'
import Icon from './shared/Icon.vue'

const props = defineProps<{
  adapter: MLAdapter
  projectId: Id
  datasetId: Id
  /** The Dataset's labels, which the prompt defines. */
  labels: string[]
  /** The item on screen, the batch when the adapter cannot list items. */
  currentTaskId?: Id | null
  /** Bumped by the host after each saved label, to refresh what is waiting. */
  labelsVersion: number
}>()
const emit = defineEmits<{
  (e: 'suggestions', suggestions: LlmSuggestion[]): void
  /** Suggestions became labels without the workspace, so its queue is stale. */
  (e: 'labelled'): void
}>()

const {
  status, suggestions, agreement, prompt, promptError, error, notice, isBusy, budgetExhausted, hasAccess, ready,
  refresh, refreshProgress, saveKey, deleteKey, acknowledge, suggest, bulkAccept, loadPrompt, savePrompt,
} = useLlmAssist(props.adapter)

// The edit in progress. It stays as typed when the backend refuses it.
const template = ref('')
const definitions = ref<Record<string, string>>({})

watch(prompt, (value) => {
  if (!value) return
  template.value = value.template
  definitions.value = Object.fromEntries(props.labels.map((label) => [label, value.definitions[label] ?? '']))
})

function onPromptToggle(event: Event) {
  if ((event.target as HTMLDetailsElement).open && !prompt.value) loadPrompt(props.datasetId)
}

function onSavePrompt() {
  const filled = Object.entries(definitions.value)
    .map(([label, text]) => [label, text.trim()] as const)
    .filter(([, text]) => text)
  savePrompt(props.datasetId, { template: template.value, definitions: Object.fromEntries(filled) })
}

async function onBulkAccept() {
  if (await bulkAccept(props.datasetId)) emit('labelled')
}

/** The next pending items the queue would serve, as many as one request takes. */
async function batchIds(): Promise<Id[]> {
  if (!props.adapter.listAnnotationTasks) return props.currentTaskId ? [props.currentTaskId] : []
  const pending = await props.adapter.listAnnotationTasks(props.projectId, { status: 'pending', datasetId: props.datasetId })
  return queueOrder(pending).slice(0, SUGGEST_BATCH_SIZE).map((task) => task.id)
}

/** The key is read from the form when sent and cleared from it straight after. */
async function onSaveKey(event: Event) {
  const form = event.target as HTMLFormElement
  const fields = new FormData(form)
  const keyInput = form.elements.namedItem('api_key') as HTMLInputElement
  const key = {
    base_url: String(fields.get('base_url') ?? '').trim(),
    model: String(fields.get('model') ?? '').trim(),
    api_key: String(fields.get('api_key') ?? '').trim(),
  }
  keyInput.value = ''
  await saveKey(props.datasetId, key)
  if (!error.value) form.reset()
}

onMounted(() => refresh(props.datasetId))
watch(() => props.datasetId, (id) => refresh(id))
watch(() => props.labelsVersion, () => refreshProgress(props.datasetId))
watch(suggestions, (value) => emit('suggestions', value))
</script>

<template>
  <section class="vmlb-card vmlb-llm" aria-label="LLM suggestions">
    <h2 class="vmlb-llm-title">LLM suggestions</h2>
    <div v-if="error" class="vmlb-alert-error"><Icon name="alert" /> {{ error }}</div>
    <p v-if="notice" class="vmlb-muted" role="status">{{ notice }}</p>

    <template v-if="status">
      <p v-if="status.mode === 'shared'" class="vmlb-llm-status">
        Suggestions use the shared key. Text is sent to <strong>{{ status.destination }}</strong>.
        <span v-if="status.remaining_tokens !== null" class="vmlb-muted vmlb-num">{{ tokens(status.remaining_tokens) }} tokens left this month.</span>
      </p>
      <p v-else-if="status.mode === 'byok'" class="vmlb-llm-status">
        Suggestions use your own key. Text is sent to <strong>{{ status.destination }}</strong>.
      </p>
      <p v-else class="vmlb-llm-status">LLM suggestions are not available for your account. Add your own API key to use them.</p>

      <div v-if="hasAccess && !ready" class="vmlb-llm-ack">
        <p>
          Before anything is sent, confirm that text from this Project may be sent to {{ status.destination }}.
          You are asked again if this changes.
        </p>
        <button class="vmlb-btn-primary" :disabled="isBusy" @click="acknowledge(datasetId)">Allow sending to {{ status.destination }}</button>
      </div>

      <p v-if="budgetExhausted && status.mode === 'shared' && !error" class="vmlb-llm-warning" role="status">
        <Icon name="alert" /> You've used this month's limit on the shared key. Add your own API key to continue.
      </p>

      <div v-if="ready" class="vmlb-llm-actions">
        <button class="vmlb-btn-primary" :disabled="isBusy || budgetExhausted" @click="suggest(datasetId, batchIds)">
          <Icon name="spark" /> Suggest labels for this batch
        </button>
        <span class="vmlb-muted">
          Each suggestion shows on its item. It is not a label until you accept it.
          <template v-if="suggestions.length">{{ suggestions.length }} waiting.</template>
        </span>
      </div>

      <div v-if="ready && agreement" class="vmlb-llm-agreement">
        <div class="vmlb-llm-agreement-head">
          <span class="vmlb-label">Agreement check</span>
          <span class="vmlb-muted vmlb-num">{{ Math.min(agreement.checked, agreement.min_sample) }} of {{ count(agreement.min_sample, 'item') }} checked</span>
        </div>
        <div
          class="vmlb-llm-bar"
          role="progressbar"
          aria-label="Agreement check"
          :aria-valuenow="agreement.checked"
          aria-valuemin="0"
          :aria-valuemax="agreement.min_sample"
        >
          <div class="vmlb-llm-bar-fill" :style="{ transform: `scaleX(${Math.min(agreement.checked / agreement.min_sample, 1)})` }" />
        </div>
        <p v-if="agreement.checked && agreement.rate !== null">
          {{ agreement.agreed }} of {{ count(agreement.checked, 'suggestion') }} matched your label ({{ percent(agreement.rate) }}).
        </p>
        <p v-else class="vmlb-muted">Accept or correct suggestions, or label their items yourself, to check the LLM against your own labels.</p>
        <p class="vmlb-muted">
          Bulk accept unlocks at {{ agreement.min_sample }} checked items with at least {{ percent(agreement.threshold) }} agreement.
          A new prompt or model starts the check again.
        </p>
        <button class="vmlb-btn-secondary" :disabled="isBusy || !agreement.unlocked" @click="onBulkAccept">Accept all waiting suggestions</button>
      </div>

      <details v-if="ready" class="vmlb-llm-more vmlb-llm-prompt" @toggle="onPromptToggle">
        <summary>Advanced: the prompt</summary>
        <div v-if="promptError" class="vmlb-alert-error"><Icon name="alert" /> {{ promptError }}</div>
        <form v-if="prompt" class="vmlb-llm-prompt-form" @submit.prevent="onSavePrompt">
          <p class="vmlb-muted">
            {{ prompt.version === 0 ? 'Version 0, the default' : `Version ${prompt.version}` }}.
            Each saved edit is checked, then kept as a new version.
          </p>
          <div v-for="label in labels" :key="label" class="vmlb-field">
            <label :for="`vmlb-llm-def-${label}`">Definition of {{ label }}</label>
            <textarea :id="`vmlb-llm-def-${label}`" v-model="definitions[label]" :name="`definition-${label}`" rows="2" maxlength="500" />
          </div>
          <div class="vmlb-field">
            <label for="vmlb-llm-template">Template</label>
            <textarea id="vmlb-llm-template" v-model="template" name="template" rows="8" maxlength="4000" />
          </div>
          <p class="vmlb-muted">
            Keep <code>{labels}</code> and <code>{text}</code> in the template, once each. <code>{examples}</code> adds up to
            five items you labelled.
          </p>
          <button class="vmlb-btn-secondary" type="submit" :disabled="isBusy || budgetExhausted">Save as a new version</button>
        </form>
      </details>

      <div v-if="status.key" class="vmlb-llm-own vmlb-muted">
        <span>Your own key: {{ status.key.model }} at {{ status.key.base_url }}</span>
        <button class="vmlb-btn-tertiary" :disabled="isBusy" @click="deleteKey(datasetId)">Delete your key</button>
      </div>
      <details v-else class="vmlb-llm-more vmlb-llm-add-key" :open="!hasAccess || budgetExhausted">
        <summary>Add your own API key</summary>
        <form class="vmlb-llm-key" autocomplete="off" @submit.prevent="onSaveKey">
          <p class="vmlb-muted">Any OpenAI-compatible service works. The key is stored encrypted and never shown again.</p>
          <div class="vmlb-field">
            <label for="vmlb-llm-base-url">Base URL</label>
            <input id="vmlb-llm-base-url" name="base_url" type="url" required placeholder="https://api.example.com/v1" />
          </div>
          <div class="vmlb-field">
            <label for="vmlb-llm-model">Model</label>
            <input id="vmlb-llm-model" name="model" type="text" required />
          </div>
          <div class="vmlb-field">
            <label for="vmlb-llm-api-key">API key</label>
            <input id="vmlb-llm-api-key" name="api_key" type="password" required autocomplete="off" />
          </div>
          <button class="vmlb-btn-secondary" type="submit" :disabled="isBusy">Save key</button>
        </form>
      </details>
    </template>
  </section>
</template>

<style scoped>
.vmlb-llm { margin-bottom: 1.25rem; padding: 1.25rem 1.5rem; font-size: 0.875rem; }
.vmlb-llm-title { margin: 0 0 0.35rem; font-size: 1rem; font-weight: 600; }
.vmlb-llm-status { margin: 0.35rem 0; }
.vmlb-llm-ack { margin: 0.75rem 0; padding: 0.75rem 0.85rem; border-radius: var(--vmlb-radius-md); background: var(--vmlb-accent-soft); }
.vmlb-llm-ack p { margin: 0 0 0.5rem; }
.vmlb-llm-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.85rem; margin: 0.75rem 0; }
.vmlb-llm-warning { display: flex; align-items: flex-start; gap: 0.5rem; margin: 0.75rem 0 0; padding: 0.65rem 0.85rem; border-radius: var(--vmlb-radius-md); background: var(--vmlb-warning-soft); color: var(--vmlb-text); }
.vmlb-llm-agreement { margin: 1rem 0; }
.vmlb-llm-agreement p { margin: 0.4rem 0; }
.vmlb-llm-agreement-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin-bottom: 0.35rem; }
.vmlb-llm-bar { width: 100%; height: 0.4rem; overflow: hidden; background: var(--vmlb-surface-sunken); border: 1px solid var(--vmlb-border); border-radius: 999px; }
.vmlb-llm-bar-fill { width: 100%; height: 100%; background: var(--vmlb-accent); transform-origin: left center; transition: transform 0.35s var(--vmlb-ease); }
.vmlb-llm-prompt-form { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
.vmlb-llm-prompt-form textarea { font-family: var(--vmlb-font-mono, monospace); font-size: 0.8125rem; }
.vmlb-llm-own { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.8125rem; }
.vmlb-llm-more { margin-top: 0.75rem; }
.vmlb-llm-more summary { cursor: pointer; font-weight: 600; }
.vmlb-llm-key { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; max-width: 28rem; }
</style>
