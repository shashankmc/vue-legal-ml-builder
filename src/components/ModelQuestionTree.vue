<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { allModelInfo } from './modelCatalogData'
import { decisionTreeFor } from '../lens/modelGuide'

const props = defineProps<{ taskType: string; currentModelType?: string }>()
const emit = defineEmits<{ select: [modelType: string] }>()

const currentNodeId = ref<string>('')
const history = ref<Array<{ question: string; answer: string; nodeId: string }>>([])
const recommendation = ref<string>('')

const tree = computed(() => decisionTreeFor(props.taskType))
const currentNode = computed(() => (tree.value ? tree.value.nodes[currentNodeId.value] ?? null : null))
const recommendedInfo = computed(() => (recommendation.value ? allModelInfo[recommendation.value] : null))

function reset() {
  currentNodeId.value = tree.value?.root ?? ''
  history.value = []
  recommendation.value = ''
}

watch(() => props.taskType, reset, { immediate: true })

function choose(option: { label: string; next?: string; recommend?: string }) {
  if (!currentNode.value) return
  history.value = [...history.value, { question: currentNode.value.question, answer: option.label, nodeId: currentNodeId.value }]
  if (option.recommend) {
    recommendation.value = option.recommend
    return
  }
  if (option.next) currentNodeId.value = option.next
}
</script>

<template>
  <div v-if="tree" class="vmlb-guide-tree">
    <div class="vmlb-guide-top">
      <p class="vmlb-guide-title">Which model fits your case?</p>
      <button v-if="history.length || recommendation" type="button" class="vmlb-guide-restart" @click="reset">Start over</button>
    </div>

    <ol v-if="history.length" class="vmlb-guide-trail">
      <li v-for="(step, i) in history" :key="`${step.nodeId}-${i}`">
        <span class="vmlb-guide-q">{{ step.question }}</span>
        <span class="vmlb-guide-a">{{ step.answer }}</span>
      </li>
    </ol>

    <div v-if="recommendedInfo" class="vmlb-guide-result">
      <p class="vmlb-guide-rec-label">Recommended model</p>
      <p class="vmlb-guide-rec-name">{{ recommendedInfo.label }}</p>
      <p class="vmlb-guide-rec-desc">{{ recommendedInfo.shortDesc }}</p>
      <p v-if="currentModelType === recommendation" class="vmlb-guide-rec-current">Currently selected</p>
      <button
        v-else
        type="button"
        class="vmlb-guide-use"
        @click="emit('select', recommendation)"
      >
        Use {{ recommendedInfo.label }}
      </button>
    </div>

    <div v-else-if="currentNode" class="vmlb-guide-question">
      <p class="vmlb-guide-current-q">{{ currentNode.question }}</p>
      <p v-if="currentNode.help" class="vmlb-guide-help">{{ currentNode.help }}</p>
      <div class="vmlb-guide-options">
        <button
          v-for="option in currentNode.options"
          :key="option.label"
          type="button"
          class="vmlb-guide-option"
          @click="choose(option)"
        >
          <span class="vmlb-guide-option-label">{{ option.label }}</span>
          <span v-if="option.note" class="vmlb-guide-option-note">{{ option.note }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.vmlb-guide-tree {
  border: 1px solid var(--vmlb-border, #e5e7eb);
  border-radius: 0.5rem;
  background: var(--vmlb-lens-paper, #fbfbfc);
  padding: 1rem;
  margin-bottom: 1rem;
}
.vmlb-guide-top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
.vmlb-guide-title { font-weight: 600; font-size: 0.875rem; color: var(--vmlb-lens-boundary, #4338ca); }
.vmlb-guide-restart { background: none; border: none; color: var(--vmlb-text-muted, #6b7280); font-size: 0.75rem; cursor: pointer; text-decoration: underline; padding: 0; }
.vmlb-guide-trail { list-style: none; padding: 0; margin: 0.75rem 0 0; display: flex; flex-direction: column; gap: 0.25rem; }
.vmlb-guide-trail li { display: flex; gap: 0.5rem; font-size: 0.75rem; }
.vmlb-guide-q { color: var(--vmlb-text-muted, #6b7280); }
.vmlb-guide-a { color: var(--vmlb-lens-boundary, #4338ca); font-weight: 600; }
.vmlb-guide-q::after { content: '→'; color: var(--vmlb-lens-grid-strong, #d9dde3); margin-left: 0.35rem; }
.vmlb-guide-question { margin-top: 0.75rem; }
.vmlb-guide-current-q { font-size: 0.9375rem; font-weight: 600; color: var(--vmlb-text, #111827); }
.vmlb-guide-help { font-size: 0.75rem; color: var(--vmlb-text-muted, #6b7280); margin-top: 0.125rem; }
.vmlb-guide-options { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top: 0.625rem; }
.vmlb-guide-option {
  display: flex; flex-direction: column; gap: 0.125rem; text-align: left;
  border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.5rem;
  background: var(--vmlb-surface, #fff); padding: 0.625rem 0.75rem; cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.vmlb-guide-option:hover { border-color: var(--vmlb-lens-boundary, #4338ca); background: var(--vmlb-primary-soft, #eef2ff); }
.vmlb-guide-option-label { font-size: 0.8125rem; font-weight: 500; color: var(--vmlb-text, #111827); }
.vmlb-guide-option-note { font-size: 0.6875rem; color: var(--vmlb-text-muted, #6b7280); }
.vmlb-guide-result { margin-top: 0.75rem; border-top: 1px solid var(--vmlb-border, #e5e7eb); padding-top: 0.75rem; }
.vmlb-guide-rec-label { font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vmlb-text-muted, #6b7280); }
.vmlb-guide-rec-name { font-size: 1rem; font-weight: 700; color: var(--vmlb-text, #111827); margin-top: 0.125rem; }
.vmlb-guide-rec-desc { font-size: 0.8125rem; color: var(--vmlb-text-muted, #6b7280); margin-top: 0.125rem; }
.vmlb-guide-rec-current { margin-top: 0.5rem; font-size: 0.75rem; font-weight: 600; color: var(--vmlb-lens-ok, #15803d); }
.vmlb-guide-use {
  margin-top: 0.5rem; background: var(--vmlb-primary, #4f46e5); color: #fff; border: none;
  border-radius: 0.5rem; padding: 0.5rem 1rem; font-size: 0.8125rem; font-weight: 600; cursor: pointer;
}
</style>
