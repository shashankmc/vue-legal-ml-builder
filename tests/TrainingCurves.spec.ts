import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import TrainingCurves from '../src/components/TrainingCurves.vue'
import { createTestAdapter } from './testAdapter'
import type { TrainingMetricPoint } from '../src/types'

function point(step: number, metric_name: string, overrides: Partial<TrainingMetricPoint> = {}): TrainingMetricPoint {
  return {
    id: `p${step}`, training_job_id: 'job-1', step, epoch: null, training_step: null,
    metric_name, group: 'train', value: 1, created_at: '2026-11-03T10:00:00', ...overrides,
  }
}

const PlotlyChart = { name: 'PlotlyChart', props: ['plotData', 'plotId'], template: '<div class="plot-stub" />' }

async function mountWith(points: TrainingMetricPoint[]) {
  const adapter = createTestAdapter({ getTrainingMetrics: vi.fn().mockResolvedValue(points) })
  const wrapper = mount(TrainingCurves, {
    props: { adapter, jobId: 'job-1', jobStatus: 'completed' },
    global: { stubs: { PlotlyChart } },
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
})
