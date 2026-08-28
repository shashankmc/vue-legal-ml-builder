<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  plotData: string | { data: unknown; layout: unknown } | null
  plotId?: string
}>()

type PlotlyModule = typeof import('plotly.js-dist').default

const plotElement = ref<HTMLDivElement | null>(null)
let plotly: PlotlyModule | null = null

async function renderPlot() {
  if (!plotly || !props.plotData || !plotElement.value) return
  try {
    const parsed = typeof props.plotData === 'string' ? JSON.parse(props.plotData) : props.plotData
    await plotly.newPlot(plotElement.value, parsed.data, parsed.layout, {
      responsive: true,
      displayModeBar: true,
      modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
    })
  } catch (err) {
    console.error('Error rendering plot:', err)
  }
}

onMounted(async () => {
  if (!props.plotData) return
  try {
    plotly = (await import('plotly.js-dist')).default
    await renderPlot()
  } catch (err) {
    console.error('Error loading Plotly:', err)
  }
})

watch(() => props.plotData, renderPlot)

onBeforeUnmount(() => {
  if (plotly && plotElement.value) {
    plotly.purge(plotElement.value)
  }
})
</script>

<template>
  <div ref="plotElement" :id="plotId ?? 'plot'" class="vmlb-plot" />
</template>

<style scoped>
.vmlb-plot {
  width: 100%;
  min-height: 24rem;
}
</style>
