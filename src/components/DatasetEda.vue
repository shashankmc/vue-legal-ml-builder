<script setup lang="ts">
import { computed, inject, onMounted } from 'vue'
import type { MLAdapter } from '../types'
import { useEda } from '../composables/useEda'
import Icon from './shared/Icon.vue'

const props = defineProps<{ adapter?: MLAdapter; datasetId: string }>()
const injectedAdapter = inject<MLAdapter | null>('vmlb:adapter', null)
const adapter = computed(() => props.adapter ?? injectedAdapter)
const { result, isLoading, error, load } = useEda(adapter.value as MLAdapter)

onMounted(() => load(props.datasetId))
</script>

<template>
  <div class="vmlb-eda">
    <h2 class="vmlb-display vmlb-eda-title">Exploratory data analysis</h2>

    <div v-if="error" class="vmlb-alert-error">
      <Icon name="alert" /> {{ error }}
    </div>
    <div v-if="isLoading" class="vmlb-eda-loading">
      <div class="vmlb-skeleton vmlb-skeleton-line" style="width: 30%" />
      <div class="vmlb-skeleton vmlb-skeleton-tile" />
    </div>

    <template v-else-if="result">
      <div class="vmlb-eda-stats">
        <div class="vmlb-stat">
          <span class="vmlb-label">Rows</span>
          <strong class="vmlb-num">{{ result.dataset_overview.shape?.rows?.toLocaleString() }}</strong>
        </div>
        <div class="vmlb-stat">
          <span class="vmlb-label">Columns</span>
          <strong class="vmlb-num">{{ result.dataset_overview.shape?.columns }}</strong>
        </div>
        <div class="vmlb-stat vmlb-stat-wide">
          <span class="vmlb-label">Data quality score</span>
          <strong class="vmlb-num">{{ result.data_quality.overall_quality_score }}<span class="vmlb-stat-unit">/100</span></strong>
        </div>
      </div>

      <div v-if="result.data_quality.issues?.length" class="vmlb-section">
        <h3 class="vmlb-section-title">Data quality issues</h3>
        <ul class="vmlb-issues">
          <li
            v-for="(issue, i) in result.data_quality.issues"
            :key="i"
            class="vmlb-issue"
            :class="`vmlb-issue-${issue.severity}`"
          >
            {{ issue.message }}
          </li>
        </ul>
      </div>

      <div v-if="result.insights?.length" class="vmlb-section">
        <h3 class="vmlb-section-title">Insights</h3>
        <div class="vmlb-insight-list">
          <div
            v-for="(insight, i) in result.insights"
            :key="i"
            class="vmlb-insight"
            :class="`vmlb-priority-${insight.priority}`"
          >
            <p class="vmlb-insight-title">{{ insight.title }}</p>
            <p class="vmlb-muted">{{ insight.message }}</p>
          </div>
        </div>
      </div>

      <div class="vmlb-section">
        <h3 class="vmlb-section-title">Columns</h3>
        <div class="vmlb-cols">
          <div v-for="(analysis, col) in result.column_analysis" :key="col" class="vmlb-col-card">
            <p class="vmlb-col-name">{{ col }}</p>
            <p class="vmlb-muted vmlb-num">
              {{ analysis.dtype }} · {{ analysis.null_percentage?.toFixed(1) }}% missing ·
              {{ analysis.unique_count }} unique
            </p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.vmlb-eda { max-width: 62rem; margin: 0 auto; }
.vmlb-eda-title { margin: 0 0 1.5rem; font-size: 1.75rem; }
.vmlb-eda-loading { display: flex; flex-direction: column; gap: 1rem; }
.vmlb-eda-stats { display: grid; grid-template-columns: repeat(2, 1fr) 1.4fr; gap: 1rem; margin-bottom: 2rem; }
@media (max-width: 40rem) { .vmlb-eda-stats { grid-template-columns: 1fr; } }
.vmlb-stat {
  display: flex; flex-direction: column; gap: 0.375rem;
  padding: 1.125rem 1.25rem;
  background: var(--vmlb-surface-sunken);
  border-radius: var(--vmlb-radius-md);
  border-left: 3px solid var(--vmlb-border-strong);
}
.vmlb-stat-wide { border-left-color: var(--vmlb-accent); }
.vmlb-stat strong { font-size: 1.75rem; font-weight: 600; letter-spacing: -0.01em; }
.vmlb-stat-unit { font-size: 1rem; color: var(--vmlb-text-subtle); font-weight: 500; }
.vmlb-section { margin-bottom: 2rem; }
.vmlb-section-title { margin: 0 0 0.75rem; font-family: var(--vmlb-font-display); font-size: 1.125rem; font-weight: 600; }
.vmlb-issues { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.vmlb-issue {
  font-size: 0.875rem; padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--vmlb-border-strong);
  background: var(--vmlb-surface-sunken);
  border-radius: 0 var(--vmlb-radius-sm) var(--vmlb-radius-sm) 0;
}
.vmlb-issue-warning { border-left-color: var(--vmlb-warning); color: var(--vmlb-warning); }
.vmlb-issue-info { border-left-color: var(--vmlb-accent); color: var(--vmlb-accent-strong); }
.vmlb-insight-list { display: flex; flex-direction: column; gap: 0.5rem; }
.vmlb-insight {
  border-left: 3px solid var(--vmlb-border-strong);
  padding: 0.5rem 0.85rem;
  background: var(--vmlb-surface);
  border-radius: 0 var(--vmlb-radius-sm) var(--vmlb-radius-sm) 0;
}
.vmlb-priority-high { border-left-color: var(--vmlb-error); }
.vmlb-priority-medium { border-left-color: var(--vmlb-warning); }
.vmlb-priority-low { border-left-color: var(--vmlb-success); }
.vmlb-insight-title { margin: 0; font-weight: 600; font-size: 0.875rem; }
.vmlb-insight .vmlb-muted { margin: 0.15rem 0 0; line-height: 1.5; }
.vmlb-cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.75rem; }
.vmlb-col-card {
  padding: 0.75rem 0.9rem;
  border: 1px solid var(--vmlb-border);
  border-radius: var(--vmlb-radius-md);
  background: var(--vmlb-surface);
  font-size: 0.8125rem;
}
.vmlb-col-name { margin: 0 0 0.25rem; font-family: var(--vmlb-font-mono); font-weight: 600; }
.vmlb-col-card .vmlb-muted { margin: 0; }
</style>
