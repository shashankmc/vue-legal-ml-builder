<script setup lang="ts">
import { computed } from 'vue'
import { THEME_PRESETS, presetMeta, type ThemeId, type ThemePresetMeta } from '../../theme/presets'

const props = withDefaults(
  defineProps<{
    /** Selected preset id (v-model). */
    modelValue: ThemeId
    presets?: ThemePresetMeta[]
    /** Show the "Theme" label above the control. */
    showLabel?: boolean
  }>(),
  { presets: () => THEME_PRESETS, showLabel: true },
)

const emit = defineEmits<{ 'update:modelValue': [id: ThemeId] }>()

const current = computed(() => presetMeta(props.modelValue) ?? props.presets[0])

function onChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLSelectElement).value as ThemeId)
}
</script>

<template>
  <div class="vmlb-theme-switcher">
    <label v-if="showLabel" class="vmlb-label" for="vmlb-theme-select">Theme</label>
    <div class="vmlb-theme-switcher-row">
      <span class="vmlb-swatches" aria-hidden="true">
        <i v-for="(color, i) in current?.swatches" :key="i" :style="{ background: color }" />
      </span>
      <select id="vmlb-theme-select" class="vmlb-input" :value="modelValue" @change="onChange">
        <option v-for="preset in presets" :key="preset.id" :value="preset.id">
          {{ preset.label }} — {{ preset.description }}
        </option>
      </select>
    </div>
  </div>
</template>

<style scoped>
.vmlb-theme-switcher { display: flex; flex-direction: column; gap: 0.375rem; }
.vmlb-theme-switcher-row { display: flex; align-items: center; gap: 0.5rem; }
.vmlb-swatches { display: inline-flex; border-radius: var(--vmlb-radius-sm); overflow: hidden; border: 1px solid var(--vmlb-border-strong); }
.vmlb-swatches i { display: block; width: 0.85rem; height: 1.35rem; }
.vmlb-theme-switcher select { min-width: 15rem; }
</style>
