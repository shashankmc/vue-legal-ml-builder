import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TrainingCurves from '../src/components/TrainingCurves.vue'
import { VueLegalMlBuilderPlugin } from '../src/index'
import { createTestAdapter } from './testAdapter'
import { h } from 'vue'
import type { TrainingMetricPoint } from '../src/types'
import type { CurveChart, StageEvent } from '../src/utils/trainingCharts'

function point(step: number, metric_name: string, overrides: Partial<TrainingMetricPoint> = {}): TrainingMetricPoint {
  return {
    id: `p${step}`, training_job_id: 'job-1', step, epoch: null, training_step: null,
    metric_name, group: 'train', value: 1, created_at: '2026-11-03T10:00:00', ...overrides,
  }
}

const PlotlyChart = { name: 'PlotlyChart', props: ['plotData', 'plotId'], template: '<div class="plot-stub" />' }

async function mountWith(
  points: TrainingMetricPoint[],
  props: Record<string, unknown> = {},
  options: { provide?: Record<string, unknown>; slots?: Record<string, unknown> } = {},
) {
  const adapter = createTestAdapter({ getTrainingMetrics: vi.fn().mockResolvedValue(points) })
  const wrapper = mount(TrainingCurves, {
    props: { adapter, jobId: 'job-1', jobStatus: 'completed', ...props },
    global: { stubs: { PlotlyChart }, provide: options.provide },
    slots: options.slots as never,
  })
  await flushPromises()
  return wrapper
}

describe('TrainingCurves', () => {
  it('draws one chart per group, each against its own axis', async () => {
    const wrapper = await mountWith([
      point(0, 'training_started', { group: 'stage' }),
      point(1, 'loss', { training_step: 10, value: 0.7 }),
      point(2, 'learning_rate', { training_step: 10, value: 2e-5 }),
      point(3, 'eval_accuracy', { group: 'eval', training_step: 20, value: 0.8 }),
    ])

    const charts = wrapper.findAll('.vmlb-curves-chart')
    expect(charts.map((c) => c.find('h4').text())).toEqual(['Training', 'Evaluation'])

    const plots = wrapper.findAllComponents(PlotlyChart)
    const train = plots[0].props('plotData')
    expect(train.data.map((t: { name: string }) => t.name)).toEqual(['loss', 'learning_rate'])
    expect(train.data[0].x).toEqual([10])
    expect(train.layout.xaxis.title).toBe('Training step')
    expect(plots[1].props('plotData').data.map((t: { name: string }) => t.name)).toEqual(['eval_accuracy'])
  })

  it('shows stage markers as labelled events, not as a line', async () => {
    const wrapper = await mountWith([
      point(0, 'preprocessing_started', { group: 'stage' }),
      point(1, 'training_started', { group: 'stage' }),
      point(2, 'model_saved', { group: 'stage' }),
    ])

    const events = wrapper.findAll('.vmlb-stage-timeline li')
    expect(events.map((e) => e.find('.vmlb-stage-label').text())).toEqual([
      'Preparing the data',
      'Training started',
      'Model saved',
    ])
    expect(wrapper.findAllComponents(PlotlyChart)).toHaveLength(0)
  })

  it('says a run with only stages has no step-by-step curve', async () => {
    const wrapper = await mountWith([point(0, 'training_started', { group: 'stage' })])

    expect(wrapper.find('.vmlb-hint').exists()).toBe(true)
  })

  describe('configuration', () => {
    const fineTuning = () => [
      point(1, 'loss', { training_step: 10, epoch: 0.5, value: 0.8 }),
      point(2, 'learning_rate', { training_step: 10, epoch: 0.5, value: 2e-5 }),
      point(3, 'loss', { training_step: 20, epoch: 1, value: 0.4 }),
      point(4, 'eval_accuracy', { group: 'eval', training_step: 20, epoch: 1, value: 0.8 }),
    ]
    const names = (wrapper: Awaited<ReturnType<typeof mountWith>>) =>
      wrapper.findAllComponents(PlotlyChart).map((p) => p.props('plotData').data.map((t: { name: string }) => t.name))

    it('shows only the metrics it is given', async () => {
      const wrapper = await mountWith(fineTuning(), { metrics: ['loss', 'eval_accuracy'] })

      expect(names(wrapper)).toEqual([['loss'], ['eval_accuracy']])
    })

    it('draws every metric on one chart when grouping is off', async () => {
      const wrapper = await mountWith(fineTuning(), { groupBy: 'none' })

      expect(wrapper.findAll('.vmlb-curves-chart h4').map((h) => h.text())).toEqual(['Metrics'])
      expect(names(wrapper)).toEqual([['loss', 'learning_rate', 'eval_accuracy']])
    })

    it('draws against the training step by default, or the epoch when asked', async () => {
      const byStep = (await mountWith(fineTuning())).findAllComponents(PlotlyChart)[0].props('plotData')
      expect(byStep.data[0].x).toEqual([10, 20])
      expect(byStep.layout.xaxis.title).toBe('Training step')

      const byEpoch = (await mountWith(fineTuning(), { xAxis: 'epoch' })).findAllComponents(PlotlyChart)[0].props('plotData')
      expect(byEpoch.data[0].x).toEqual([0.5, 1])
      expect(byEpoch.layout.xaxis.title).toBe('Epoch')
    })

    it('smooths each curve by a moving average when asked', async () => {
      const points = [0.8, 0.4, 0.6].map((value, i) => point(i, 'loss', { training_step: (i + 1) * 10, value }))

      const raw = (await mountWith(points)).findComponent(PlotlyChart).props('plotData')
      expect(raw.data[0].y).toEqual([0.8, 0.4, 0.6])

      const smoothed = (await mountWith(points, { smoothing: 0.5 })).findComponent(PlotlyChart).props('plotData')
      // Each value is half the last smoothed value plus half the new one.
      expect(smoothed.data[0].y.map((v: number) => Number(v.toFixed(6)))).toEqual([0.8, 0.6, 0.6])
    })

    it('draws values on a log scale when asked', async () => {
      const linear = (await mountWith(fineTuning())).findComponent(PlotlyChart).props('plotData')
      expect(linear.layout.yaxis.type).toBeUndefined()

      const log = (await mountWith(fineTuning(), { logScale: true })).findComponent(PlotlyChart).props('plotData')
      expect(log.layout.yaxis.type).toBe('log')
    })

    it('takes its defaults from the app, and its props override them', async () => {
      const provide = { 'vmlb:monitoring': { metrics: ['loss'], groupBy: 'none', xAxis: 'epoch', logScale: true, smoothing: 0.5 } }

      const fromApp = (await mountWith(fineTuning(), {}, { provide })).findComponent(PlotlyChart).props('plotData')
      expect(fromApp.data.map((t: { name: string }) => t.name)).toEqual(['loss'])
      expect(fromApp.data[0].x).toEqual([0.5, 1])
      expect(fromApp.data[0].y.map((v: number) => Number(v.toFixed(6)))).toEqual([0.8, 0.6])
      expect(fromApp.layout.yaxis.type).toBe('log')

      const overridden = await mountWith(
        fineTuning(),
        { metrics: ['loss', 'eval_accuracy'], groupBy: 'group', xAxis: 'step', logScale: false, smoothing: 0 },
        { provide },
      )
      expect(names(overridden)).toEqual([['loss'], ['eval_accuracy']])
      const train = overridden.findComponent(PlotlyChart).props('plotData')
      expect(train.data[0].x).toEqual([10, 20])
      expect(train.data[0].y).toEqual([0.8, 0.4])
      expect(train.layout.yaxis.type).toBeUndefined()
    })

    it('takes app-wide defaults from the plugin', async () => {
      const adapter = createTestAdapter({ getTrainingMetrics: vi.fn().mockResolvedValue(fineTuning()) })
      const wrapper = mount(TrainingCurves, {
        props: { jobId: 'job-1', jobStatus: 'completed' },
        global: { stubs: { PlotlyChart }, plugins: [[VueLegalMlBuilderPlugin, { adapter, monitoring: { metrics: ['eval_accuracy'] } }]] },
      })
      await flushPromises()

      expect(names(wrapper)).toEqual([['eval_accuracy']])
    })

    it('lets the host draw the grouped series and stages itself, through its slot', async () => {
      let received: { charts: CurveChart[]; stages: StageEvent[] } | undefined
      const wrapper = await mountWith(
        [point(0, 'training_started', { group: 'stage' }), ...fineTuning()],
        { metrics: ['loss', 'eval_accuracy'] },
        {
          slots: {
            default: (scope: { charts: CurveChart[]; stages: StageEvent[] }) => {
              received = scope
              return h('div', { class: 'host-curves' }, scope.charts.map((c) => c.title).join(','))
            },
          },
        },
      )

      expect(wrapper.find('.host-curves').text()).toBe('Training,Evaluation')
      expect(received!.charts[0].series).toEqual([{ metric: 'loss', x: [10, 20], y: [0.8, 0.4] }])
      expect(received!.stages.map((e) => e.label)).toEqual(['Training started'])
      expect(wrapper.findAllComponents(PlotlyChart)).toHaveLength(0)
      expect(wrapper.find('.vmlb-stage-timeline').exists()).toBe(false)
    })

    it('polls a running job at the interval it is given, 3 seconds by default', async () => {
      vi.useFakeTimers()
      try {
        const callsAfter = async (ms: number, props: Record<string, unknown> = {}, provide = {}) => {
          const getTrainingMetrics = vi.fn().mockResolvedValue([])
          const wrapper = mount(TrainingCurves, {
            props: { adapter: createTestAdapter({ getTrainingMetrics }), jobId: 'job-1', jobStatus: 'running', ...props },
            global: { stubs: { PlotlyChart }, provide },
          })
          await vi.advanceTimersByTimeAsync(ms)
          wrapper.unmount()
          return getTrainingMetrics.mock.calls.length
        }

        // The first fetch on mount, then one per interval.
        expect(await callsAfter(3000)).toBe(2)
        expect(await callsAfter(3000, { pollIntervalMs: 1000 })).toBe(4)
        expect(await callsAfter(3000, {}, { 'vmlb:monitoring': { pollIntervalMs: 1000 } })).toBe(4)
        expect(await callsAfter(3000, { pollIntervalMs: 3000 }, { 'vmlb:monitoring': { pollIntervalMs: 1000 } })).toBe(2)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
