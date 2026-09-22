<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: IconName; size?: number | string }>(), {
  size: '1em',
})

type IconName =
  | 'close'
  | 'check'
  | 'spark'
  | 'upload'
  | 'play'
  | 'search'
  | 'back'
  | 'dataset'
  | 'model'
  | 'chart'
  | 'layers'
  | 'alert'
  | 'inbox'
const PATHS: Record<IconName, string> = {
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
  upload: 'M12 16V4M7.5 8.5L12 4l4.5 4.5M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16',
  play: 'M7 5.5v13l11-6.5z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  back: 'M19 12H5M11 18l-6-6 6-6',
  dataset: 'M12 3c4.4 0 8 1.1 8 2.5S16.4 8 12 8 4 6.9 4 5.5 7.6 3 12 3zM4 5.5v13C4 19.9 7.6 21 12 21s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
  model: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v9M4 7.5l8 4.5 8-4.5',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  alert: 'M12 4l9 16H3zM12 10v4M12 17.5h.01',
  inbox: 'M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
}

const path = computed(() => PATHS[props.name])
</script>

<template>
  <svg
    class="vmlb-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="path" />
  </svg>
</template>

<style scoped>
.vmlb-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: -0.125em;
}
.vmlb-icon path {
  vector-effect: non-scaling-stroke;
}
</style>
