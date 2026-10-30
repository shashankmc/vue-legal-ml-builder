import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AnnotationWorkspace from '../src/components/AnnotationWorkspace.vue'
import { VueLegalMlBuilderPlugin } from '../src/index'
import { createTestAdapter } from './testAdapter'

function annotatingAdapter() {
  return createTestAdapter({
    getNextAnnotationTask: vi.fn().mockResolvedValue({
      task: { id: 't1', dataset_id: 'ds-1', item_index: 0, text: 'Clause 4.2 limits liability.', status: 'pending', created_at: '', updated_at: '' },
      stats: { total: 10, annotated: 3, percentage: 30 },
    }),
  })
}

describe('AnnotationWorkspace hideAnnotation flag', () => {
  it('shows the annotation view by default (BAIGLE behaviour)', async () => {
    const adapter = annotatingAdapter()
    const wrapper = mount(AnnotationWorkspace, { props: { adapter, projectId: 'p1' } })
    await flushPromises()

    expect(wrapper.text()).toContain('Clause 4.2 limits liability.')
    expect(wrapper.text()).toContain('Annotation progress')
    expect(adapter.getNextAnnotationTask).toHaveBeenCalledWith('p1', undefined)
  })

  it('renders nothing and calls no annotation operation when hideAnnotation is set', async () => {
    const adapter = annotatingAdapter()
    const wrapper = mount(AnnotationWorkspace, { props: { adapter, projectId: 'p1', hideAnnotation: true } })
    await flushPromises()

    expect(wrapper.find('.vmlb-annotate').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
    expect(adapter.getNextAnnotationTask).not.toHaveBeenCalled()
  })
})

describe('VueLegalMlBuilderPlugin hideAnnotation option', () => {
  it('keeps annotation visible when the option is omitted', async () => {
    const adapter = annotatingAdapter()
    const wrapper = mount(AnnotationWorkspace, {
      props: { projectId: 'p1' },
      global: { plugins: [[VueLegalMlBuilderPlugin, { adapter }]] },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Clause 4.2 limits liability.')
    expect(adapter.getNextAnnotationTask).toHaveBeenCalled()
  })

  it('hides annotation views app-wide when hideAnnotation: true', async () => {
    const adapter = annotatingAdapter()
    const wrapper = mount(AnnotationWorkspace, {
      props: { projectId: 'p1' },
      global: { plugins: [[VueLegalMlBuilderPlugin, { adapter, hideAnnotation: true }]] },
    })
    await flushPromises()

    expect(wrapper.find('.vmlb-annotate').exists()).toBe(false)
    expect(adapter.getNextAnnotationTask).not.toHaveBeenCalled()
  })
})

function item(id: string, text: string, extra = {}) {
  return { id, dataset_id: 'ds-1', item_index: 2, text, status: 'pending' as const, created_at: '', updated_at: '', ...extra }
}

function queue(task: ReturnType<typeof item> | null, stats = { total: 4, annotated: 1, percentage: 25 }) {
  return vi.fn().mockResolvedValue({ task, stats })
}

async function mounted(adapterOverrides = {}, props = {}) {
  const adapter = createTestAdapter({
    getNextAnnotationTask: queue(item('t1', 'Clause one.')),
    getDataset: vi.fn().mockResolvedValue({ labels: ['Civil', 'Criminal'] }),
    saveAnnotation: vi.fn().mockResolvedValue({}),
    skipAnnotation: vi.fn().mockResolvedValue({}),
    ...adapterOverrides,
  })
  const wrapper = mount(AnnotationWorkspace, {
    props: { adapter, projectId: 'p1', datasetId: 'ds-1', ...props },
    attachTo: document.body,
  })
  await flushPromises()
  return { adapter, wrapper }
}

async function clickText(wrapper: Awaited<ReturnType<typeof mounted>>['wrapper'], text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  if (!button) throw new Error(`no button "${text}"`)
  await button.trigger('click')
  await flushPromises()
}

describe('AnnotationWorkspace parity with the host screen', () => {
  it('saves a chosen label only on Save & Next', async () => {
    const { adapter, wrapper } = await mounted()

    await clickText(wrapper, 'Civil')
    expect(adapter.saveAnnotation).not.toHaveBeenCalled()

    await clickText(wrapper, 'Save & Next')
    expect(adapter.saveAnnotation).toHaveBeenCalledWith('t1', 'Civil')
  })

  it('refuses an empty label', async () => {
    const { adapter, wrapper } = await mounted()

    const save = wrapper.findAll('button').find((b) => b.text() === 'Save & Next')!
    expect(save.attributes('disabled')).toBeDefined()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
    await flushPromises()

    expect(adapter.saveAnnotation).not.toHaveBeenCalled()
  })

  it('keeps the item and shows why when a save fails', async () => {
    const { wrapper } = await mounted({ saveAnnotation: vi.fn().mockRejectedValue(new Error('annotation_label must not be empty')) })

    await clickText(wrapper, 'Civil')
    await clickText(wrapper, 'Save & Next')

    expect(wrapper.text()).toContain('annotation_label must not be empty')
    expect(wrapper.text()).toContain('Clause one.')
  })

  it('takes the N and S keys, but not while typing', async () => {
    const { adapter, wrapper } = await mounted()

    await clickText(wrapper, 'Civil')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
    await flushPromises()
    expect(adapter.saveAnnotation).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S' }))
    await flushPromises()
    expect(adapter.skipAnnotation).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('does not treat keys typed into the label box as commands', async () => {
    const { adapter, wrapper } = await mounted({ getDataset: vi.fn().mockResolvedValue({ labels: [] }) })

    const input = wrapper.find('input[type="text"]')
    await input.setValue('novel')
    await input.trigger('keydown', { key: 's' })
    await flushPromises()

    expect(adapter.skipAnnotation).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('saves a typed label where the Dataset names none', async () => {
    const { adapter, wrapper } = await mounted({ getDataset: vi.fn().mockResolvedValue({ labels: [] }) })

    await wrapper.find('input[type="text"]').setValue('  novel  ')
    await clickText(wrapper, 'Save & Next')

    expect(adapter.saveAnnotation).toHaveBeenCalledWith('t1', 'novel')
    wrapper.unmount()
  })

  it('joins several labels on a multi-label Dataset', async () => {
    const { adapter, wrapper } = await mounted({}, { taskType: 'multi-label' })

    await clickText(wrapper, 'Civil')
    await clickText(wrapper, 'Criminal')
    await clickText(wrapper, 'Save & Next')

    expect(adapter.saveAnnotation).toHaveBeenCalledWith('t1', 'Civil,Criminal')
    wrapper.unmount()
  })

  it('saves NER with no entities as an empty list', async () => {
    const { adapter, wrapper } = await mounted({}, { taskType: 'ner' })

    await clickText(wrapper, 'Save & Next')

    expect(adapter.saveAnnotation).toHaveBeenCalledWith('t1', '[]')
    wrapper.unmount()
  })

  it('uses the host\'s name for the task type', async () => {
    const { wrapper } = await mounted({}, { projectName: 'Cases', taskTypeName: 'Text Classification' })

    expect(wrapper.find('.vmlb-annotate-head').text()).toContain('Text Classification')
    wrapper.unmount()
  })

  it('shows guidelines and the row number', async () => {
    const { wrapper } = await mounted({}, { guidelines: 'Label by court.' })

    expect(wrapper.text()).toContain('Label by court.')
    expect(wrapper.text()).toContain('Row 3 of the Dataset')
    wrapper.unmount()
  })

  it('counts progress as labelled rows out of all rows', async () => {
    const { wrapper } = await mounted({ getNextAnnotationTask: queue(item('t1', 'x'), { total: 12, annotated: 3, percentage: 25 }) }, { rowCount: 20 })

    expect(wrapper.text()).toContain('11 / 20 rows · 55%')
    wrapper.unmount()
  })

  it('never claims success at 0/0', async () => {
    const { wrapper } = await mounted(
      { getNextAnnotationTask: queue(null, { total: 0, annotated: 0, percentage: 0 }) },
      { createModelHref: '/models/create' },
    )

    expect(wrapper.text()).toContain('Nothing to annotate')
    expect(wrapper.text()).not.toContain('All items annotated')
    expect(wrapper.find('a').attributes('href')).toBe('/models/create')
    wrapper.unmount()
  })

  it('says when rows need labels but none could be queued', async () => {
    const { wrapper } = await mounted({ getNextAnnotationTask: queue(null, { total: 0, annotated: 0, percentage: 0 }) }, { unlabelledRows: 12 })

    expect(wrapper.text()).toContain('12 rows still need a label')
    wrapper.unmount()
  })

  it('congratulates only finished real items', async () => {
    const { wrapper } = await mounted({ getNextAnnotationTask: queue(null, { total: 4, annotated: 4, percentage: 100 }) })

    expect(wrapper.text()).toContain('All items annotated')
    expect(wrapper.text()).toContain('You annotated 4 of 4 items.')
    wrapper.unmount()
  })

  it('returns to skipped items once the queue runs out', async () => {
    const skipped = item('t9', 'Skipped clause.', { status: 'skipped' })
    const { wrapper } = await mounted({
      getNextAnnotationTask: queue(null, { total: 4, annotated: 3, percentage: 75 }),
      listAnnotationTasks: vi.fn().mockResolvedValue([skipped]),
    })

    expect(wrapper.text()).toContain('1 skipped item left')
    await clickText(wrapper, 'Review skipped items')

    expect(wrapper.text()).toContain('Skipped clause.')
    wrapper.unmount()
  })

  it('does not count held-back items as skipped', async () => {
    const { wrapper } = await mounted({
      getNextAnnotationTask: queue(null, { total: 10, annotated: 8, percentage: 80, holdout_remaining: 2 } as never),
    })

    expect(wrapper.text()).toContain('2 held-back items left')
    expect(wrapper.text()).not.toContain('skipped')
    wrapper.unmount()
  })
})
