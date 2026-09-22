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

/**
 * Read the active theme's CSS custom properties off the plot element (they
 * inherit from the surrounding `.vmlb-theme`) and fold them into the layout so
 * charts stay legible in both presets without every caller hardcoding colors.
 */
function themedLayout(layout: unknown): Record<string, unknown> {
  const base = (layout && typeof layout === 'object' ? layout : {}) as Record<string, unknown>
  const el = plotElement.value
  const cs = el ? getComputedStyle(el) : null
  const read = (name: string, fallback: string) =>
    (cs?.getPropertyValue(name) || '').trim() || fallback

  const text = read('--vmlb-text', '#1b1916')
  const muted = read('--vmlb-text-muted', '#6d6455')
  const border = read('--vmlb-border', '#e2dccd')
  const paper = read('--vmlb-surface', '#fffdf9')
  const family =
    (cs?.fontFamily || '').trim() || 'ui-sans-serif, system-ui, sans-serif'
  const colorway = ['--vmlb-accent', '--vmlb-lens-class-b', '--vmlb-lens-class-c', '--vmlb-lens-class-d', '--vmlb-lens-class-e'].map(
    (name, i) => read(name, ['#0f5f5a', '#b06a2a', '#4a7c59', '#8b4a5c', '#6a5a8c'][i]),
  )

  const axisTheme = {
    gridcolor: border,
    zerolinecolor: border,
    linecolor: border,
    tickfont: { color: muted },
  }

  return {
    ...base,
    paper_bgcolor: paper,
    plot_bgcolor: paper,
    colorway,
    font: { family, size: 12, color: text, ...(base.font as object) },
    margin: { l: 56, r: 24, t: 48, b: 48, ...(base.margin as object) },
    xaxis: { ...axisTheme, ...(base.xaxis as object) },
    yaxis: { ...axisTheme, ...(base.yaxis as object) },
  }
}

async function renderPlot() {
  if (!plotly || !props.plotData || !plotElement.value) return
  try {
    const parsed = parsedPlotData()
    if (!parsed) return
    const layout = themedLayout(parsed.layout)
    if (!hasRendered) {
      await plotly.newPlot(plotElement.value, parsed.data, layout, plotConfig)
      hasRendered = true
    } else {
      await plotly.react(plotElement.value, parsed.data, layout, plotConfig)
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
