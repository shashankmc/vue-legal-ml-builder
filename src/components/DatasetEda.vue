<script setup lang="ts">
import { computed, inject, onMounted } from 'vue'
import type { MLAdapter } from '../types'
import { useEda } from '../composables/useEda'

const props = defineProps<{ adapter?: MLAdapter; datasetId: string }>()
const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { result, isLoading, error, load } = useEda(adapter.value as MLAdapter)

onMounted(() => load(props.datasetId))
</script>

<template>
  <div class="vmlb-eda">
    <h2 class="vmlb-eda-title">Exploratory Data Analysis</h2>

    <div v-if="error" class="vmlb-alert-error">{{ error }}</div>
    <div v-if="isLoading" class="vmlb-spinner-wrap"><div class="vmlb-spinner" /></div>

    <template v-else-if="result">
      <div class="vmlb-eda-grid">
        <div class="vmlb-stat"><span class="vmlb-muted">Rows</span><strong>{{ result.dataset_overview.shape?.rows }}</strong></div>
        <div class="vmlb-stat"><span class="vmlb-muted">Columns</span><strong>{{ result.dataset_overview.shape?.columns }}</strong></div>
        <div class="vmlb-stat">
          <span class="vmlb-muted">Data quality score</span>
          <strong>{{ result.data_quality.overall_quality_score }}/100</strong>
        </div>
      </div>

      <div v-if="result.data_quality.issues?.length" class="vmlb-section">
        <h3>Data quality issues</h3>
        <ul>
          <li v-for="(issue, i) in result.data_quality.issues" :key="i" class="vmlb-issue" :class="`vmlb-issue-${issue.severity}`">
            {{ issue.message }}
          </li>
        </ul>
      </div>

      <div v-if="result.insights?.length" class="vmlb-section">
        <h3>Insights</h3>
        <div v-for="(insight, i) in result.insights" :key="i" class="vmlb-insight" :class="`vmlb-priority-${insight.priority}`">
          <p class="vmlb-insight-title">{{ insight.title }}</p>
          <p class="vmlb-muted">{{ insight.message }}</p>
        </div>
      </div>

      <div class="vmlb-section">
        <h3>Columns</h3>
        <div class="vmlb-cols">
          <div v-for="(analysis, col) in result.column_analysis" :key="col" class="vmlb-col-card">
            <p class="vmlb-col-name">{{ col }}</p>
            <p class="vmlb-muted">{{ analysis.dtype }} · {{ analysis.null_percentage?.toFixed(1) }}% missing · {{ analysis.unique_count }} unique</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vmlb-eda-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 1rem; }
.vmlb-eda-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.vmlb-stat { background: var(--vmlb-surface, #f9fafb); border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.5rem; padding: 1rem; display: flex; flex-direction: column; gap: 0.25rem; }
.vmlb-stat strong { font-size: 1.5rem; }
.vmlb-section { margin-bottom: 1.5rem; }
.vmlb-section h3 { font-weight: 600; margin-bottom: 0.5rem; }
.vmlb-issue { font-size: 0.875rem; padding: 0.375rem 0; }
.vmlb-issue-warning { color: #a16207; }
.vmlb-issue-info { color: #1d4ed8; }
.vmlb-insight { border-left: 3px solid var(--vmlb-border, #e5e7eb); padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; }
.vmlb-priority-high { border-color: #dc2626; }
.vmlb-priority-medium { border-color: #d97706; }
.vmlb-priority-low { border-color: #16a34a; }
.vmlb-insight-title { font-weight: 600; font-size: 0.875rem; }
.vmlb-cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.75rem; }
.vmlb-col-card { border: 1px solid var(--vmlb-border, #e5e7eb); border-radius: 0.5rem; padding: 0.75rem; font-size: 0.8125rem; }
.vmlb-col-name { font-weight: 600; margin-bottom: 0.25rem; }
.vmlb-muted { color: var(--vmlb-text-muted, #6b7280); }
.vmlb-alert-error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1rem; font-size: 0.875rem; }
.vmlb-spinner-wrap { display: flex; justify-content: center; padding: 3rem 0; }
.vmlb-spinner { width: 2.5rem; height: 2.5rem; border-radius: 999px; border: 3px solid #e5e7eb; border-bottom-color: var(--vmlb-primary, #4f46e5); animation: vmlb-spin 0.7s linear infinite; }
@keyframes vmlb-spin { to { transform: rotate(360deg); } }
</style>
