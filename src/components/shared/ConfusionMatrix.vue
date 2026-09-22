<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  matrix: number[][]
  labels?: string[] | null
  classificationReport?: string | null
}>()

function parseLabelsFromReport(report: string | null | undefined, count: number): string[] | null {
  if (!report) return null
  const SKIP = ['accuracy', 'macro avg', 'weighted avg', 'micro avg', 'samples avg']
  const found: string[] = []
  for (const line of report.split('\n')) {
    const t = line.trim()
    if (!t) continue
    if (SKIP.some((s) => t.startsWith(s))) continue
    const m = t.match(/^(.+?)\s{2,}[\d.]/)
    if (m) found.push(m[1].trim())
    if (found.length === count) break
  }
  return found.length === count ? found : null
}

const resolvedLabels = computed<string[]>(() => {
  if (props.labels?.length === props.matrix.length) return props.labels
  const fromReport = parseLabelsFromReport(props.classificationReport, props.matrix.length)
  if (fromReport) return fromReport
  return props.matrix.map((_, i) => String(i))
})

function cellClass(row: number, col: number, value: number) {
  if (row === col) return 'vmlb-cm-diag'
  if (value > 0) return 'vmlb-cm-off'
  return 'vmlb-cm-zero'
}
</script>

<template>
  <div>
    <h4 class="vmlb-cm-title">Confusion Matrix</h4>
    <div class="vmlb-cm-scroll">
      <table class="vmlb-cm-table">
        <thead>
          <tr>
            <th class="vmlb-cm-corner">Actual \ Predicted</th>
            <th v-for="label in resolvedLabels" :key="`h-${label}`" class="vmlb-cm-colhead">{{ label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in matrix" :key="`r-${i}`">
            <td class="vmlb-cm-rowhead">{{ resolvedLabels[i] }}</td>
            <td
              v-for="(value, j) in row"
              :key="`c-${i}-${j}`"
              class="vmlb-cm-cell"
              :class="cellClass(i, j, value)"
            >
              {{ value }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="vmlb-cm-caption">
      Rows = Actual labels, Columns = Predicted labels. Green diagonal = correct predictions, red = misclassifications.
    </p>
  </div>
</template>

<style scoped>
.vmlb-cm-title { margin: 0 0 var(--vmlb-space-sm); font-family: var(--vmlb-font-display); font-size: 1.0625rem; font-weight: 600; letter-spacing: -0.01em; }
.vmlb-cm-scroll { overflow-x: auto; }
.vmlb-cm-table { font-size: 0.875rem; border-collapse: separate; border-spacing: 0; }
.vmlb-cm-table th, .vmlb-cm-table td { border-bottom: 1px solid var(--vmlb-border); padding: 0.5rem 0.75rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
.vmlb-cm-table tr:last-child td { border-bottom: none; }
.vmlb-cm-corner, .vmlb-cm-colhead, .vmlb-cm-rowhead { background: var(--vmlb-surface-sunken); font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.03em; color: var(--vmlb-text-muted); }
.vmlb-cm-colhead { text-align: center; }
.vmlb-cm-rowhead { text-align: right; }
.vmlb-cm-cell { text-align: center; color: var(--vmlb-text); }
.vmlb-cm-diag { background: var(--vmlb-success-soft); color: var(--vmlb-success); font-weight: 700; }
.vmlb-cm-off { background: var(--vmlb-error-soft); color: var(--vmlb-error); font-weight: 600; }
.vmlb-cm-zero { color: var(--vmlb-text-subtle); }
.vmlb-cm-caption { font-size: 0.75rem; color: var(--vmlb-text-subtle); margin-top: var(--vmlb-space-xs); }
</style>
