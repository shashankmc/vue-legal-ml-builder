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
.vmlb-cm-title { font-weight: 600; margin-bottom: 0.75rem; }
.vmlb-cm-scroll { overflow-x: auto; }
.vmlb-cm-table { font-size: 0.875rem; border-collapse: collapse; }
.vmlb-cm-table th, .vmlb-cm-table td { border: 1px solid var(--vmlb-border, #e5e7eb); padding: 0.5rem 0.75rem; white-space: nowrap; }
.vmlb-cm-corner, .vmlb-cm-colhead, .vmlb-cm-rowhead { background: var(--vmlb-surface, #f9fafb); font-size: 0.75rem; font-weight: 500; color: var(--vmlb-text-muted, #6b7280); }
.vmlb-cm-colhead { text-align: center; }
.vmlb-cm-rowhead { text-align: right; }
.vmlb-cm-cell { text-align: center; }
.vmlb-cm-diag { background: #dcfce7; color: #15803d; font-weight: 700; }
.vmlb-cm-off { background: #fef2f2; color: #dc2626; font-weight: 600; }
.vmlb-cm-zero { color: var(--vmlb-text-muted, #6b7280); }
.vmlb-cm-caption { font-size: 0.75rem; color: var(--vmlb-text-muted, #9ca3af); margin-top: 0.5rem; }
</style>
