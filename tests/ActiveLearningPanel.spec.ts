import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AnnotationWorkspace from '../src/components/AnnotationWorkspace.vue'
import { createTestAdapter } from './testAdapter'
import type { ActiveLearningState } from '../src/types'

const SETTINGS = {
  strategies: ['prediction_entropy', 'random'],
  default_strategy: 'prediction_entropy',
  default_batch_size: 20,
  min_per_class: 5,
  default_holdout_percent: 20,
  max_holdout_percent: 50,
  seed_sources: { random: true, llm: false },
}

const READINESS = { labels_total: 40, label_cap: 100, classes_left_out: [], classes_unseen: [], classes_to_train: 2, labels_needed: 0 }

function loopState(overrides: Partial<ActiveLearningState> = {}): ActiveLearningState {
  return {
    active: true,
    strategy: 'prediction_entropy',
    seed_source: 'random',
    batch_size: 20,
    min_per_class: 5,
    model_id: null,
    round: { number: 0, status: 'labelling', strategy: 'random', model_id: null, job_id: null, labels_used: null, metrics: null, error: null, created_at: '', completed_at: null },
    label_counts: {},
    typed_labels: false,
    retrain: { new_labels: 0, allowed: false, suggested: false, classes_short: {}, needs_second_label: false, ...READINESS },
    holdout: { percent: 20, size: 10, labelled: 0, label_counts: {}, needed: 10, verification: null },
    ...overrides,
  }
}

const TASK = { id: 't1', dataset_id: 'ds-1', item_index: 0, text: 'Clause.', status: 'pending' as const, created_at: '', updated_at: '' }

async function mounted(state: ActiveLearningState | { active: false }, overrides = {}, props = {}) {
  const adapter = createTestAdapter({
    getNextAnnotationTask: vi.fn().mockResolvedValue({ task: TASK, stats: { total: 4, annotated: 1, percentage: 25 } }),
    getDataset: vi.fn().mockResolvedValue({ labels: ['Civil', 'Criminal'] }),
    saveAnnotation: vi.fn().mockResolvedValue({}),
    getActiveLearningSettings: vi.fn().mockResolvedValue(SETTINGS),
    getActiveLearningState: vi.fn().mockResolvedValue(state),
    startActiveLearning: vi.fn().mockResolvedValue(loopState()),
    setActiveLearningStrategy: vi.fn().mockResolvedValue(loopState({ strategy: 'random' })),
    retrainActiveLearning: vi.fn().mockResolvedValue({ job_id: 'j1' }),
    verifyActiveLearning: vi.fn().mockResolvedValue(undefined),
    correctActiveLearningLabel: vi.fn().mockResolvedValue(loopState()),
    ...overrides,
  })
  const wrapper = mount(AnnotationWorkspace, { props: { adapter, projectId: 'p1', datasetId: 'ds-1', ...props } })
  await flushPromises()
  return { adapter, wrapper }
}

function button(wrapper: Awaited<ReturnType<typeof mounted>>['wrapper'], text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

afterEach(() => vi.useRealTimers())

describe('starting the loop', () => {
  it('offers it with sensible defaults and sends them', async () => {
    const { adapter, wrapper } = await mounted({ active: false })

    await button(wrapper, 'Start')!.trigger('click')
    await flushPromises()

    expect(adapter.startActiveLearning).toHaveBeenCalledWith('ds-1', {
      strategy: 'prediction_entropy',
      batch_size: 20,
      min_per_class: 5,
      holdout_percent: 20,
      seed_source: 'random',
    })
    expect(adapter.getNextAnnotationTask).toHaveBeenCalledTimes(2)
  })

  it('names strategies in plain language and only the hosts', async () => {
    const { wrapper } = await mounted({ active: false })

    expect(wrapper.text()).toContain('Hardest cases first')
    expect(wrapper.text()).toContain('Random order')
    expect(wrapper.text()).not.toContain('Closest calls first')
    expect(wrapper.text()).not.toContain('entropy')
  })

  it('keeps the LLM seed visible but disabled', async () => {
    const { wrapper } = await mounted({ active: false })

    const radios = wrapper.findAll('input[name="vmlb-seed"]')
    expect(wrapper.text()).toContain('Suggested by an LLM (not available yet)')
    expect(radios[1].attributes('disabled')).toBeDefined()
  })

  it('warns what turning the holdout off means, and sends 0', async () => {
    const { adapter, wrapper } = await mounted({ active: false })

    await wrapper.find('input[type="checkbox"]').setValue(false)
    expect(wrapper.text()).toContain('Not independently verified')

    await button(wrapper, 'Start')!.trigger('click')
    await flushPromises()
    expect(adapter.startActiveLearning).toHaveBeenCalledWith('ds-1', expect.objectContaining({ holdout_percent: 0 }))
  })

  it('does not offer to start with nothing to label', async () => {
    const { wrapper } = await mounted(
      { active: false },
      { getNextAnnotationTask: vi.fn().mockResolvedValue({ task: null, stats: { total: 0, annotated: 0, percentage: 0 } }) },
    )

    expect(button(wrapper, 'Start')).toBeUndefined()
  })

  it('is left out where the adapter has no loop, and for NER', async () => {
    const { wrapper } = await mounted({ active: false }, { getActiveLearningState: undefined })
    expect(button(wrapper, 'Start')).toBeUndefined()

    const ner = await mounted({ active: false }, {}, { taskType: 'ner' })
    expect(ner.adapter.getActiveLearningState).not.toHaveBeenCalled()
  })
})

describe('the running loop', () => {
  it('prompts to retrain and nothing happens until the user does', async () => {
    const { adapter, wrapper } = await mounted(
      loopState({ retrain: { new_labels: 20, allowed: true, suggested: true, classes_short: {}, needs_second_label: false, ...READINESS } }),
    )

    expect(wrapper.text()).toContain('20 new labels, retrain?')
    expect(adapter.retrainActiveLearning).not.toHaveBeenCalled()

    await button(wrapper, 'Retrain')!.trigger('click')
    await flushPromises()
    expect(adapter.retrainActiveLearning).toHaveBeenCalledWith('ds-1')
  })

  it('warns by name when training is open with a label short', async () => {
    const { wrapper } = await mounted(
      loopState({ label_counts: { Common: 98, Rare: 2 }, retrain: { new_labels: 100, allowed: true, suggested: true, classes_short: { Rare: 3 }, needs_second_label: false, ...READINESS, labels_total: 100 } }),
    )

    expect(wrapper.text()).toContain('Few examples of Rare (2), so the Model may miss it.')
    expect(button(wrapper, 'Retrain')).toBeDefined()
  })

  it('counts the held-back items by label', async () => {
    const { wrapper } = await mounted(
      loopState({ holdout: { percent: 20, size: 20, labelled: 10, label_counts: { Verbot: 8, Gebot: 2 }, needed: 10, verification: null } }),
    )

    expect(wrapper.text()).toContain('Held back so far: 8 Verbot, 2 Gebot.')
  })

  it('shows what a short label still needs, with no Retrain button', async () => {
    const { wrapper } = await mounted(
      loopState({ retrain: { new_labels: 8, allowed: false, suggested: false, classes_short: { Civil: 3 }, needs_second_label: false, ...READINESS } }),
    )

    expect(wrapper.text()).toContain('Before the first training: 3 more Civil, or 100 labels in all (40 so far).')
    expect(button(wrapper, 'Retrain')).toBeUndefined()
  })

  it('refreshes the counts after a saved label', async () => {
    const { adapter, wrapper } = await mounted(loopState())

    await button(wrapper, 'Civil')!.trigger('click')
    await button(wrapper, 'Save & Next')!.trigger('click')
    await flushPromises()

    expect(adapter.getActiveLearningState).toHaveBeenCalledTimes(2)
  })

  it('does not reread the state after a save while a poll already does', async () => {
    vi.useFakeTimers()
    const { adapter, wrapper } = await mounted(loopState({ round: { ...loopState().round, status: 'scoring' } }))

    await button(wrapper, 'Civil')!.trigger('click')
    await button(wrapper, 'Save & Next')!.trigger('click')
    await flushPromises()

    expect(adapter.getActiveLearningState).toHaveBeenCalledTimes(1)
  })

  it('does not reread the state after a save with no loop', async () => {
    const { adapter, wrapper } = await mounted({ active: false })

    await button(wrapper, 'Civil')!.trigger('click')
    await button(wrapper, 'Save & Next')!.trigger('click')
    await flushPromises()

    expect(adapter.getActiveLearningState).toHaveBeenCalledTimes(1)
  })

  it('stops polling the old Dataset when the Dataset changes', async () => {
    vi.useFakeTimers()
    const running = loopState({ round: { ...loopState().round, status: 'training' } })
    const { adapter, wrapper } = await mounted(running)

    await wrapper.setProps({ datasetId: 'ds-2' })
    await flushPromises()
    ;(adapter.getActiveLearningState as ReturnType<typeof vi.fn>).mockClear()
    await vi.advanceTimersByTimeAsync(7000)
    await flushPromises()

    const polled = (adapter.getActiveLearningState as ReturnType<typeof vi.fn>).mock.calls.map(([id]) => id)
    expect(polled.length).toBeGreaterThan(0)
    expect(new Set(polled)).toEqual(new Set(['ds-2']))
  })

  it('drops a reply about the old Dataset that lands after a change', async () => {
    let answer: (value: ActiveLearningState) => void = () => {}
    const late = new Promise<ActiveLearningState>((resolve) => { answer = resolve })
    const { wrapper } = await mounted(loopState(), {
      getActiveLearningState: vi.fn().mockReturnValueOnce(late).mockResolvedValue({ active: false }),
    })

    await wrapper.setProps({ datasetId: 'ds-2' })
    await flushPromises()
    answer(loopState({ retrain: { new_labels: 20, allowed: true, suggested: true, classes_short: {}, needs_second_label: false, ...READINESS } }))
    await flushPromises()

    expect(wrapper.text()).not.toContain('20 new labels, retrain?')
  })

  it('reloads the queue when a rescore finishes', async () => {
    vi.useFakeTimers()
    const training = loopState({ round: { ...loopState().round, status: 'scoring' } })
    const next = loopState({ round: { ...loopState().round, number: 1 } })
    const { adapter } = await mounted(training, {
      getActiveLearningState: vi.fn().mockResolvedValueOnce(training).mockResolvedValue(next),
    })
    const before = (adapter.getNextAnnotationTask as ReturnType<typeof vi.fn>).mock.calls.length

    await vi.advanceTimersByTimeAsync(3100)
    await flushPromises()

    expect((adapter.getNextAnnotationTask as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before + 1)
  })

  it('shows a training failure with its reason', async () => {
    const { wrapper } = await mounted(loopState({ round: { ...loopState().round, error: 'Ran out of memory' } }))

    expect(wrapper.text()).toContain('Ran out of memory')
  })

  it('changes the strategy', async () => {
    const { adapter, wrapper } = await mounted(loopState())

    await wrapper.find('.vmlb-al-strategy select').setValue('random')
    await flushPromises()

    expect(adapter.setActiveLearningStrategy).toHaveBeenCalledWith('ds-1', 'random')
  })
})

describe('a mistyped label', () => {
  const short = { new_labels: 9, allowed: false, suggested: false, classes_short: { crimnal: 4 }, needs_second_label: false, ...READINESS }

  it('can be corrected where labels are typed', async () => {
    const { adapter, wrapper } = await mounted(loopState({ typed_labels: true, label_counts: { civil: 8, crimnal: 1 }, retrain: short }))

    await wrapper.find('.vmlb-al-correct input').setValue('criminal')
    await wrapper.find('.vmlb-al-correct').trigger('submit')
    await flushPromises()

    expect(adapter.correctActiveLearningLabel).toHaveBeenCalledWith('ds-1', 'crimnal', 'criminal')
  })

  it('is not offered where the Dataset names its labels', async () => {
    const { wrapper } = await mounted(loopState({ retrain: short }))

    expect(wrapper.find('.vmlb-al-correct').exists()).toBe(false)
  })
})

describe('the holdout', () => {
  it('reads "Not independently verified" without a grade', async () => {
    const { wrapper } = await mounted(
      loopState({ model_id: 'm1', holdout: { percent: 0, size: 0, labelled: 0, label_counts: {}, needed: 0, verification: 'not_independently_verified' } }),
    )

    expect(wrapper.text()).toContain('Not independently verified')
    expect(wrapper.text()).toContain('No items are held back.')
    expect(button(wrapper, 'Check the score')).toBeUndefined()
  })

  it('labels held-back items only when asked, then returns to the queue', async () => {
    const { adapter, wrapper } = await mounted(loopState())

    await button(wrapper, 'Label held-back items')!.trigger('click')
    await flushPromises()

    expect(adapter.getNextAnnotationTask).toHaveBeenLastCalledWith('p1', 'ds-1', { holdout: true })
    expect(wrapper.text()).toContain('never trained on')
    expect(button(wrapper, 'Skip')).toBeUndefined()

    await button(wrapper, 'Back to the queue')!.trigger('click')
    await flushPromises()
    expect(adapter.getNextAnnotationTask).toHaveBeenLastCalledWith('p1', 'ds-1')
  })

  it('offers the check once enough held-back items are labelled', async () => {
    const { adapter, wrapper } = await mounted(
      loopState({ model_id: 'm1', holdout: { percent: 20, size: 10, labelled: 10, label_counts: {}, needed: 10, verification: 'not_independently_verified' } }),
    )

    await button(wrapper, 'Check the score')!.trigger('click')
    await flushPromises()

    expect(adapter.verifyActiveLearning).toHaveBeenCalledWith('ds-1')
  })

  it('reports a check that never finishes instead of waiting for ever', async () => {
    vi.useFakeTimers()
    const { wrapper } = await mounted(
      loopState({ model_id: 'm1', holdout: { percent: 20, size: 10, labelled: 10, label_counts: {}, needed: 10, verification: 'not_independently_verified' } }),
    )

    await button(wrapper, 'Check the score')!.trigger('click')
    await vi.advanceTimersByTimeAsync(40 * 3100)
    await flushPromises()

    expect(wrapper.text()).toContain('The score could not be checked. Try again.')
  })
})
