<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  plotData: string | { data: unknown; layout: unknown } | null
  plotId?: string
}>()

type PlotlyModule = typeof import('plotly.js-basic-dist').default

const plotElement = ref<HTMLDivElement | null>(null)
let plotly: PlotlyModule | null = null
let hasRendered = false

let cachedSource: typeof props.plotData = null
let cachedParsed: { data: unknown; layout: unknown } | null = null

function parsedPlotData(): { data: unknown; layout: unknown } | null {
  if (props.plotData === cachedSource) return cachedParsed
  cachedSource = props.plotData
  if (!props.plotData) {
    cachedParsed = null
  } else if (typeof props.plotData === 'string') {
    cachedParsed = JSON.parse(props.plotData)
  } else {
    cachedParsed = props.plotData
  }
  return cachedParsed
}

const plotConfig = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
}

async function renderPlot() {
  if (!plotly || !props.plotData || !plotElement.value) return
  try {
    const parsed = parsedPlotData()
    if (!parsed) return
    if (!hasRendered) {
      await plotly.newPlot(plotElement.value, parsed.data, parsed.layout, plotConfig)
      hasRendered = true
    } else {
      await plotly.react(plotElement.value, parsed.data, parsed.layout, plotConfig)
    }
  } catch (err) {
    console.error('Error rendering plot:', err)
  }
}

onMounted(async () => {
  if (!props.plotData) return
  try {
    plotly = (await import('plotly.js-basic-dist')).default
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
  hasRendered = false
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
