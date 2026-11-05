<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useLlmAssist } from '../composables/useLlmAssist'
import type { Id, MLAdapter } from '../types'
import Icon from './shared/Icon.vue'

const props = defineProps<{
  adapter: MLAdapter
  datasetId: Id
}>()

const { status, error, notice, isBusy, budgetExhausted, hasAccess, ready, refresh, saveKey, deleteKey, acknowledge } =
  useLlmAssist(props.adapter)

function tokens(value: number) {
  return value.toLocaleString('en')
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

      <div v-if="status.key" class="vmlb-llm-own vmlb-muted">
        <span>Your own key: {{ status.key.model }} at {{ status.key.base_url }}</span>
        <button class="vmlb-btn-tertiary" :disabled="isBusy" @click="deleteKey(datasetId)">Delete your key</button>
      </div>
      <details v-else class="vmlb-llm-more" :open="!hasAccess || budgetExhausted">
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
.vmlb-llm-own { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.8125rem; }
.vmlb-llm-more { margin-top: 0.75rem; }
.vmlb-llm-more summary { cursor: pointer; font-weight: 600; }
.vmlb-llm-key { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; max-width: 28rem; }
</style>
