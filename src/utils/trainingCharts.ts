import type { TrainingMetricGroup, TrainingMetricPoint } from '../types'

/** Every metric group, in the order their charts are drawn. */
export const TRAINING_METRIC_GROUPS: readonly TrainingMetricGroup[] = ['train', 'eval', 'system', 'stage']

type CurveGroup = Exclude<TrainingMetricGroup, 'stage'>

const CURVE_GROUPS = TRAINING_METRIC_GROUPS.filter((g): g is CurveGroup => g !== 'stage')

const CHART_TITLES: Record<CurveGroup, string> = {
  train: 'Training',
  eval: 'Evaluation',
  system: 'System',
}

const STAGE_LABELS: Record<string, string> = {
  preprocessing_started: 'Preparing the data',
  preprocessing_done: 'Data prepared',
  training_started: 'Training started',
  training_done: 'Training finished',
  model_saved: 'Model saved',
  training_cancelled: 'Training stopped',
  training_failed: 'Training failed',
}

/** The point's group. A point without one (from a host on an older
 * legal-ml-core) gets it from its name, as legal-ml-core does for old rows. */
export function metricGroupOf(point: TrainingMetricPoint): TrainingMetricGroup {
  if (point.group) return point.group
  if (point.metric_name in STAGE_LABELS) return 'stage'
  if (point.metric_name.startsWith('eval_')) return 'eval'
  return 'train'
}

export interface CurveSeries {
  metric: string
  x: number[]
  y: number[]
}

export interface CurveChart {
  /** The group charted, or `all` when grouping is off. */
  group: CurveGroup | 'all'
  title: string
  xAxisTitle: string
  series: CurveSeries[]
}

export interface StageEvent {
  name: string
  label: string
  /** When the stage was reached (the point's `created_at`). */
  at: string
}

/** Fine-tuning points sit at the trainer's step, falling back to the epoch,
 * then to the write counter. */
function xOf(point: TrainingMetricPoint): number {
  return point.training_step ?? point.epoch ?? point.step
}

function xAxisTitle(points: TrainingMetricPoint[]): string {
  if (points.some((p) => p.training_step != null)) return 'Training step'
  if (points.some((p) => p.epoch != null)) return 'Epoch'
  return 'Point'
}

export interface CurveChartOptions {
  /** Only these metric names are drawn. Default: every metric. */
  metrics?: string[]
  /** `group` (default) draws one chart per group; `none` draws every metric on one chart. */
  groupBy?: 'group' | 'none'
}

/** One chart per group that has points, so values on different scales are not
 * drawn against one axis. Stage markers are left to `stageEvents`. */
export function curveCharts(points: TrainingMetricPoint[], options: CurveChartOptions = {}): CurveChart[] {
  const shown = options.metrics ? new Set(options.metrics) : null
  const curves = points.filter((p) => metricGroupOf(p) !== 'stage' && (!shown || shown.has(p.metric_name)))
  const buckets: Array<Pick<CurveChart, 'group' | 'title'> & { points: TrainingMetricPoint[] }> =
    options.groupBy === 'none'
      ? [{ group: 'all', title: 'Metrics', points: curves }]
      : CURVE_GROUPS.map((group) => ({
          group,
          title: CHART_TITLES[group],
          points: curves.filter((p) => metricGroupOf(p) === group),
        }))
  const charts: CurveChart[] = []
  for (const { group, title, points: inGroup } of buckets) {
    if (!inGroup.length) continue
    const byMetric = new Map<string, TrainingMetricPoint[]>()
    for (const p of inGroup) {
      if (!byMetric.has(p.metric_name)) byMetric.set(p.metric_name, [])
      byMetric.get(p.metric_name)!.push(p)
    }
    charts.push({
      group,
      title,
      xAxisTitle: xAxisTitle(inGroup),
      series: [...byMetric].map(([metric, series]) => ({
        metric,
        x: series.map(xOf),
        y: series.map((p) => p.value),
      })),
    })
  }
  return charts
}

/** The run's milestones, in the order they were reached. */
export function stageEvents(points: TrainingMetricPoint[]): StageEvent[] {
  return points
    .filter((p) => metricGroupOf(p) === 'stage')
    .map((p) => ({
      name: p.metric_name,
      label: STAGE_LABELS[p.metric_name] ?? p.metric_name.replace(/_/g, ' '),
      at: p.created_at,
    }))
}
