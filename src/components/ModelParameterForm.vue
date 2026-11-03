<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { ModelTypeInfo } from '../types'
import { parameterRules, parameterSchemas } from './modelCatalogData'
import { allowedOptions, mergeSchema, reconcileChoices } from './parameterOptions'
import type { ParameterFieldSchema } from './modelCatalogData'
import Icon from './shared/Icon.vue'

const props = withDefaults(defineProps<{
  modelType: string
  /** Settings to start from, e.g. an existing Model's. Missing ones take their
   * defaults. A new object starts the form again, so pass the same one to keep edits. */
  parameters?: Record<string, unknown>
  /** What the backend says about this model type: it decides the options,
   * ranges, defaults and dependent options. Without it the package's own apply. */
  modelInfo?: ModelTypeInfo
  /** The Dataset's row count, which caps settings that cannot exceed it. */
  rowCount?: number
  /** The Dataset's labels, for the options that depend on how many there are. */
  labels?: string[] | null
  /** The setting a refusal named. It is marked, and the settings open on it, when it is on the form. */
  refusedField?: string
  /** The id of the host's alert that explains the refusal. */
  refusalId?: string
}>(), { refusalId: 'vmlb-refusal' })

const emit = defineEmits<{
  /** The settings to send, after every change, and once with the starting ones. */
  change: [parameters: Record<string, unknown>]
}>()

const parameters = reactive<Record<string, unknown>>({})
const advanced = ref<HTMLDetailsElement | null>(null)
const expandedParams = reactive<Record<string, boolean>>({})
// Why a setting just moved, for the settings that had to.
const adjusted = ref<Record<string, string>>({})

const allSettings = computed(() => mergeSchema(parameterSchemas[props.modelType] || [], props.modelInfo, props.rowCount))
const currentRules = computed(() => props.modelInfo?.rules ?? parameterRules[props.modelType] ?? [])
const currentSchema = computed(() =>
  allSettings.value.filter((p) => Object.entries(p.showWhen ?? {}).every(([key, value]) => parameters[key] === value)),
)
const multiclass = computed(() => (props.labels?.length ?? 0) > 2)

const optionsFor = (param: ParameterFieldSchema) => allowedOptions(param, currentRules.value, parameters, multiclass.value)

watch([() => props.modelType, () => props.parameters], () => {
  Object.keys(expandedParams).forEach((k) => delete expandedParams[k])
  adjusted.value = {}
  Object.keys(parameters).forEach((k) => delete parameters[k])
  for (const p of allSettings.value) parameters[p.key] = p.default
  Object.assign(parameters, props.parameters)
}, { immediate: true })

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
  // A number cleared by hand is left to its default.
  emit('change', Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== '')))
}, { immediate: true })

/** The label of a setting on the form, or undefined when it is not on show. */
const labelFor = (key?: string) => currentSchema.value.find((p) => p.key === key)?.label
const refused = computed(() => (labelFor(props.refusedField) ? props.refusedField : undefined))

// The refused setting may be tucked away in the closed settings.
function openOnRefused() {
  if (refused.value && advanced.value) advanced.value.open = true
}
watch(refused, openOnRefused, { flush: 'post' })
onMounted(openOnRefused)

const refusalMark = (key: string) =>
  refused.value === key
    ? { id: 'vmlb-refused-field', 'aria-invalid': 'true' as const, 'aria-describedby': props.refusalId }
    : {}

function toggleParam(key: string) {
  expandedParams[key] = !expandedParams[key]
}

defineExpose({ labelFor })
</script>

<template>
  <details v-if="currentSchema.length" ref="advanced" class="vmlb-advanced">
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
          <select v-if="param.type === 'select'" v-model="parameters[param.key]" v-bind="refusalMark(param.key)">
            <option v-for="opt in optionsFor(param).options" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <select v-else-if="param.type === 'boolean'" v-model="parameters[param.key]" v-bind="refusalMark(param.key)">
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
            v-bind="refusalMark(param.key)"
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
</template>

<style scoped>
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
.vmlb-param-input [aria-invalid='true'] { border-color: var(--vmlb-error); box-shadow: 0 0 0 1px var(--vmlb-error); }
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
