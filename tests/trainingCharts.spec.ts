import { describe, expect, it } from 'vitest'
import { curveCharts, metricGroupOf, stageEvents } from '../src/utils/trainingCharts'
import type { TrainingMetricPoint } from '../src/types'

let nextStep = 0
function point(metric_name: string, overrides: Partial<TrainingMetricPoint> = {}): TrainingMetricPoint {
  const step = nextStep++
  return {
    id: `p${step}`,
    training_job_id: 'job-1',
    step,
    epoch: null,
    training_step: null,
    metric_name,
    group: 'train',
    value: 1,
    created_at: '2026-11-03T10:00:00',
    ...overrides,
  }
}

describe('metricGroupOf', () => {
  it('uses the group the point carries', () => {
    expect(metricGroupOf(point('gpu_memory', { group: 'system' }))).toBe('system')
  })

  it('gives a point from an older host a group from its name', () => {
    const legacy = (name: string) => metricGroupOf(point(name, { group: undefined }))

    expect(legacy('eval_accuracy')).toBe('eval')
    expect(legacy('training_started')).toBe('stage')
    expect(legacy('model_saved')).toBe('stage')
    expect(legacy('loss')).toBe('train')
  })
})

describe('curveCharts', () => {
  it('draws one chart per group, in a fixed order, leaving out stage markers', () => {
    const charts = curveCharts([
      point('eval_loss', { group: 'eval', training_step: 20 }),
      point('training_started', { group: 'stage' }),
      point('loss', { group: 'train', training_step: 10 }),
      point('learning_rate', { group: 'train', training_step: 10 }),
    ])

    expect(charts.map((c) => c.group)).toEqual(['train', 'eval'])
    expect(charts[0].series.map((s) => s.metric)).toEqual(['loss', 'learning_rate'])
    expect(charts[1].series.map((s) => s.metric)).toEqual(['eval_loss'])
  })

  it('plots fine-tuning points against the training step', () => {
    const [chart] = curveCharts([
      point('loss', { training_step: 10, epoch: 0.5, value: 0.7 }),
      point('loss', { training_step: 20, epoch: 1, value: 0.6 }),
    ])

    expect(chart.xAxisTitle).toBe('Training step')
    expect(chart.series[0].x).toEqual([10, 20])
    expect(chart.series[0].y).toEqual([0.7, 0.6])
  })

  it('titles the axis Iteration for points the run counts in iterations', () => {
    const charts = curveCharts([
      point('loss', { training_step: 1, x_kind: 'iteration' }),
      point('loss', { training_step: 4, x_kind: 'iteration' }),
      point('eval_loss', { group: 'eval', training_step: 1, x_kind: 'iteration' }),
    ])

    expect(charts.map((c) => [c.group, c.xAxisTitle])).toEqual([
      ['train', 'Iteration'],
      ['eval', 'Iteration'],
    ])
    expect(charts[0].series[0].x).toEqual([1, 4])
  })

  it('falls back to the epoch when a point has no training step', () => {
    const [chart] = curveCharts([
      point('loss', { epoch: 0.5 }),
      point('loss', { epoch: 1 }),
    ])

    expect(chart.xAxisTitle).toBe('Epoch')
    expect(chart.series[0].x).toEqual([0.5, 1])
  })

  it('plots learning-curve points on their own chart, against the training-set size', () => {
    const charts = curveCharts([
      point('loss', { group: 'train', training_step: 1 }),
      point('learning_curve_train_accuracy', { group: 'train', training_step: 3, value: 1 }),
      point('learning_curve_eval_accuracy', { group: 'eval', training_step: 3, value: 0.5 }),
      point('learning_curve_train_accuracy', { group: 'train', training_step: 32, value: 0.9 }),
      point('learning_curve_eval_accuracy', { group: 'eval', training_step: 32, value: 0.8 }),
      point('eval_loss', { group: 'eval', training_step: 1 }),
    ])

    expect(charts.map((c) => c.group)).toEqual(['train', 'eval', 'learning_curve'])
    expect(charts[0].series.map((s) => s.metric)).toEqual(['loss'])
    expect(charts[1].series.map((s) => s.metric)).toEqual(['eval_loss'])
    const curve = charts[2]
    expect(curve.title).toBe('Learning curve')
    expect(curve.xAxisTitle).toBe('Training examples')
    expect(curve.series).toEqual([
      { metric: 'learning_curve_train_accuracy', x: [3, 32], y: [1, 0.9] },
      { metric: 'learning_curve_eval_accuracy', x: [3, 32], y: [0.5, 0.8] },
    ])
  })

  it('keeps the learning curve on its own chart when grouping is off', () => {
    const charts = curveCharts(
      [point('loss', { training_step: 1 }), point('learning_curve_eval_accuracy', { group: 'eval', training_step: 8 })],
      { groupBy: 'none' },
    )

    expect(charts.map((c) => [c.group, c.series.map((s) => s.metric)])).toEqual([
      ['all', ['loss']],
      ['learning_curve', ['learning_curve_eval_accuracy']],
    ])
  })

  it('draws a run with both resource readings and a learning curve, each on its own charts', () => {
    const charts = curveCharts([
      point('memory_mb', { group: 'system', value: 2048 }),
      point('learning_curve_train_accuracy', { group: 'train', training_step: 3, value: 1 }),
      point('samples_per_second', { group: 'system', value: 16 }),
      point('learning_curve_eval_accuracy', { group: 'eval', training_step: 3, value: 0.5 }),
    ])

    expect(charts.map((c) => [c.group, c.title, c.unit, c.series.map((s) => s.metric)])).toEqual([
      ['system', 'Memory (MB)', 'MB', ['memory_mb']],
      ['system', 'Speed (samples per second)', 'samples per second', ['samples_per_second']],
      ['learning_curve', 'Learning curve', undefined, ['learning_curve_train_accuracy', 'learning_curve_eval_accuracy']],
    ])
    expect(charts[2].xAxisTitle).toBe('Training examples')
  })

  it('draws the resource readings one chart per unit, each titled with its unit', () => {
    const system = (name: string, value: number) => point(name, { group: 'system', training_step: 10, value })
    const charts = curveCharts([
      point('loss', { training_step: 10 }),
      system('memory_mb', 2048),
      system('gpu_memory_mb', 512),
      system('gpu_use_percent', 40),
      system('samples_per_second', 16),
      system('seconds_remaining', 45),
    ])

    expect(charts.map((c) => [c.group, c.title, c.unit])).toEqual([
      ['train', 'Training', undefined],
      ['system', 'Memory (MB)', 'MB'],
      ['system', 'GPU use (%)', '%'],
      ['system', 'Speed (samples per second)', 'samples per second'],
      ['system', 'Time remaining (seconds)', 'seconds'],
    ])
    expect(charts[1].series.map((s) => s.metric)).toEqual(['memory_mb', 'gpu_memory_mb'])
  })

  it('takes the unit of a resource reading it does not know from its name', () => {
    const charts = curveCharts([
      point('cpu_percent', { group: 'system' }),
      point('disk_mb', { group: 'system' }),
      point('open_files', { group: 'system' }),
    ])

    expect(charts.map((c) => [c.title, c.unit])).toEqual([
      ['System (%)', '%'],
      ['System (MB)', 'MB'],
      ['System', undefined],
    ])
  })

  it('has no charts when a run only has stage markers', () => {
    expect(curveCharts([point('training_started', { group: 'stage' })])).toEqual([])
  })
})

describe('stageEvents', () => {
  it('lists the stage markers in order, with a plain label', () => {
    const events = stageEvents([
      point('preprocessing_started', { group: 'stage', created_at: '2026-11-03T10:00:00' }),
      point('loss'),
      point('training_done', { group: undefined, created_at: '2026-11-03T10:05:00' }),
    ])

    expect(events).toEqual([
      { name: 'preprocessing_started', label: 'Preparing the data', at: '2026-11-03T10:00:00' },
      { name: 'training_done', label: 'Training finished', at: '2026-11-03T10:05:00' },
    ])
  })

  it('shows an unknown stage by its name', () => {
    expect(stageEvents([point('warmup_done', { group: 'stage' })])[0].label).toBe('warmup done')
  })
})
