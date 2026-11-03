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

/** A resource reading's unit, from the end of its name: `_mb`, `_percent`,
 * `<what>_per_second`, or `seconds_` / `_seconds`. */
export function metricUnitOf(metricName: string): string | undefined {
  if (metricName.endsWith('_mb')) return 'MB'
  if (metricName.endsWith('_percent')) return '%'
  const rate = metricName.match(/^(.+)_per_second$/)
  if (rate) return `${rate[1].replace(/_/g, ' ')} per second`
  if (metricName.startsWith('seconds_') || metricName.endsWith('_seconds')) return 'seconds'
  return undefined
}

// What the readings legal-ml-core takes are called on their chart.
const READING_TITLES: Record<string, string> = {
  memory_mb: 'Memory',
  gpu_memory_mb: 'Memory',
  gpu_use_percent: 'GPU use',
  samples_per_second: 'Speed',
  seconds_remaining: 'Time remaining',
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
  /** The unit of every value on a resource chart, which draws one unit only. */
  unit?: string
  xAxisTitle: string
  series: CurveSeries[]
}

export interface StageEvent {
  name: string
  label: string
  /** When the stage was reached (the point's `created_at`). */
  at: string
}

/** By step, fine-tuning points sit at the trainer's step, falling back to the
 * epoch, then to the write counter. By epoch, the epoch comes first. */
function xOf(point: TrainingMetricPoint, xAxis: CurveXAxis): number {
  if (xAxis === 'epoch') return point.epoch ?? point.training_step ?? point.step
  return point.training_step ?? point.epoch ?? point.step
}

function xAxisTitle(points: TrainingMetricPoint[], xAxis: CurveXAxis): string {
  if (xAxis === 'epoch' && points.some((p) => p.epoch != null)) return 'Epoch'
  if (points.some((p) => p.training_step != null)) return 'Training step'
  if (points.some((p) => p.epoch != null)) return 'Epoch'
  return 'Point'
}

export type CurveXAxis = 'step' | 'epoch'

export interface CurveChartOptions {
  /** Only these metric names are drawn. Default: every metric. */
  metrics?: string[]
  /** `group` (default) draws one chart per group; `none` draws every metric on one chart. */
  groupBy?: 'group' | 'none'
  /** `step` (default) or `epoch`. A point without the chosen one falls back to the other. */
  xAxis?: CurveXAxis
  /** Moving-average weight from 0 (default, raw values) to just below 1 (smoothest). */
  smoothing?: number
}

/** An exponential moving average: each value is `weight` of the last smoothed
 * value plus the rest of the new one. */
function smooth(values: number[], weight: number): number[] {
  const w = Math.min(Math.max(weight, 0), 0.99)
  if (!w) return values
  let last = values[0]
  return values.map((v) => (last = w * last + (1 - w) * v))
}

/** The system group's points, one bucket per unit: memory in MB is not drawn
 * against an axis of seconds. */
function byUnit(points: TrainingMetricPoint[]): Array<Pick<CurveChart, 'group' | 'title' | 'unit'> & { points: TrainingMetricPoint[] }> {
  const units = new Map<string | undefined, TrainingMetricPoint[]>()
  for (const p of points) {
    const unit = metricUnitOf(p.metric_name)
    if (!units.has(unit)) units.set(unit, [])
    units.get(unit)!.push(p)
  }
  return [...units].map(([unit, inUnit]) => {
    const name = inUnit.map((p) => READING_TITLES[p.metric_name]).find(Boolean) ?? 'System'
    return { group: 'system', title: unit ? `${name} (${unit})` : name, unit, points: inUnit }
  })
}

/** One chart per group that has points, so values on different scales are not
 * drawn against one axis; resource readings get one chart per unit. Stage
 * markers are left to `stageEvents`. */
export function curveCharts(points: TrainingMetricPoint[], options: CurveChartOptions = {}): CurveChart[] {
  const xAxis = options.xAxis ?? 'step'
  const shown = options.metrics ? new Set(options.metrics) : null
  const curves = points.filter((p) => metricGroupOf(p) !== 'stage' && (!shown || shown.has(p.metric_name)))
  const buckets: Array<Pick<CurveChart, 'group' | 'title' | 'unit'> & { points: TrainingMetricPoint[] }> =
    options.groupBy === 'none'
      ? [{ group: 'all', title: 'Metrics', points: curves }]
      : CURVE_GROUPS.flatMap((group) => {
          const inGroup = curves.filter((p) => metricGroupOf(p) === group)
          return group === 'system' ? byUnit(inGroup) : [{ group, title: CHART_TITLES[group], points: inGroup }]
        })
  const charts: CurveChart[] = []
  for (const { group, title, unit, points: inGroup } of buckets) {
    if (!inGroup.length) continue
    const byMetric = new Map<string, TrainingMetricPoint[]>()
    for (const p of inGroup) {
      if (!byMetric.has(p.metric_name)) byMetric.set(p.metric_name, [])
      byMetric.get(p.metric_name)!.push(p)
    }
    charts.push({
      group,
      title,
      ...(unit ? { unit } : {}),
      xAxisTitle: xAxisTitle(inGroup, xAxis),
      series: [...byMetric].map(([metric, series]) => ({
        metric,
        x: series.map((p) => xOf(p, xAxis)),
        y: smooth(series.map((p) => p.value), options.smoothing ?? 0),
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
