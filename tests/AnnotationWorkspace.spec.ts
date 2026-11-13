import { mount, flushPromises } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import AnnotationWorkspace from '../src/components/AnnotationWorkspace.vue'
import { VueLegalMlBuilderPlugin } from '../src/index'
import { AnnotatorView } from 'legal-annotation-kit'
import { labelColour } from '../src/annotation/labelColours'
import { createTestAdapter, emptyAssignment } from './testAdapter'

// jsdom has no layout; the kit's span view only needs ResizeObserver to exist.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})

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
    saveAnnotationAssignment: vi.fn().mockResolvedValue({}),
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

async function chooseTag(wrapper: Awaited<ReturnType<typeof mounted>>['wrapper'], name: string) {
  const tag = wrapper.findAll('.doc-tag').find((t) => t.text().startsWith(name))
  if (!tag) throw new Error(`no tag "${name}"`)
  await tag.trigger('click')
}

async function saveInKit(wrapper: Awaited<ReturnType<typeof mounted>>['wrapper']) {
  await wrapper.find('.btn--save').trigger('click')
  await flushPromises()
}

function kit(wrapper: Awaited<ReturnType<typeof mounted>>['wrapper']) {
  return wrapper.findComponent(AnnotatorView)
}

describe('AnnotationWorkspace on legal-annotation-kit', () => {
  it('opens a single-label item in the kit: one tag, the Dataset\'s labels, nothing but labels', async () => {
    const { adapter, wrapper } = await mounted()

    expect(adapter.getAnnotationAssignment).toHaveBeenCalledWith('t1')
    const view = kit(wrapper)
    expect(view.props('document').full_text).toBe('Clause one.')
    expect(view.props('annotationLevel')).toBe('document')
    expect(view.props('labelset').labels).toEqual([
      { name: 'Civil', color: labelColour('Civil') },
      { name: 'Criminal', color: labelColour('Criminal') },
    ])
    expect(view.props()).toMatchObject({
      navigation: false,
      draft: false,
      documentLabelMode: 'single',
      showRelations: false,
      showConfidence: false,
      showMetadata: false,
    })
    wrapper.unmount()
  })

  it('opens an NER item at the server\'s level with spans kept apart', async () => {
    const { wrapper } = await mounted(
      {
        getDataset: vi.fn().mockResolvedValue({ labels: ['PERSON', 'ORG'] }),
        getAnnotationAssignment: vi.fn(async (id: string) => ({
          document: { name: 'Item', full_text: 'Smith sued Acme.' },
          assignment: emptyAssignment(id),
          labels: ['PERSON', 'ORG'],
          annotationLevel: 'word' as const,
        })),
      },
      { taskType: 'ner' },
    )

    expect(kit(wrapper).props('annotationLevel')).toBe('word')
    expect(kit(wrapper).props('allowOverlap')).toBe(false)
    expect(kit(wrapper).props('labelset').labels.map((l: { name: string }) => l.name)).toEqual(['PERSON', 'ORG'])
    wrapper.unmount()
  })

  it('saves the kit\'s assignment and moves to the next item', async () => {
    const next = queue(item('t1', 'Clause one.'))
    next.mockResolvedValueOnce({ task: item('t1', 'Clause one.'), stats: { total: 4, annotated: 1, percentage: 25 } })
    next.mockResolvedValueOnce({ task: item('t2', 'Clause two.'), stats: { total: 4, annotated: 2, percentage: 50 } })
    const { adapter, wrapper } = await mounted({ getNextAnnotationTask: next })

    await chooseTag(wrapper, 'Civil')
    await saveInKit(wrapper)

    expect(adapter.saveAnnotationAssignment).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ document_annotations: [expect.objectContaining({ label: 'Civil' })] }),
    )
    expect(adapter.saveAnnotation).not.toHaveBeenCalled()
    expect(kit(wrapper).props('document').full_text).toBe('Clause two.')
    wrapper.unmount()
  })

  it('refuses to save an item with no label', async () => {
    const { adapter, wrapper } = await mounted()

    await saveInKit(wrapper)

    expect(adapter.saveAnnotationAssignment).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Choose a label for this item.')
    wrapper.unmount()
  })

  it('keeps the item and shows why when a save fails', async () => {
    const { wrapper } = await mounted({
      saveAnnotationAssignment: vi.fn().mockRejectedValue(new Error('Choose only one label for this item.')),
    })

    await chooseTag(wrapper, 'Civil')
    await saveInKit(wrapper)

    expect(wrapper.text()).toContain('Choose only one label for this item.')
    expect(kit(wrapper).props('document').full_text).toBe('Clause one.')
    wrapper.unmount()
  })

  it('skips from the kit\'s header, or with S when not typing', async () => {
    const { adapter, wrapper } = await mounted()

    const skip = wrapper.find('.lak-annotator .vmlb-skip')
    expect(skip.exists()).toBe(true)
    await skip.trigger('click')
    await flushPromises()
    expect(adapter.skipAnnotation).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S' }))
    await flushPromises()
    expect(adapter.skipAnnotation).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('adds a typed label where the Dataset names none, and saves it on the item', async () => {
    const { adapter, wrapper } = await mounted({ getDataset: vi.fn().mockResolvedValue({ labels: [] }) })

    const input = wrapper.find('.vmlb-new-label input')
    await input.setValue('  novel  ')
    await input.trigger('keydown', { key: 's' })
    await flushPromises()
    expect(adapter.skipAnnotation).not.toHaveBeenCalled()
    await wrapper.find('.vmlb-new-label button').trigger('click')
    await flushPromises()

    expect(kit(wrapper).props('labelset').labels.map((l: { name: string }) => l.name)).toEqual(['novel'])
    await chooseTag(wrapper, 'novel')
    await saveInKit(wrapper)
    expect(adapter.saveAnnotationAssignment).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ document_annotations: [expect.objectContaining({ label: 'novel' })] }),
    )
    wrapper.unmount()
  })

  it('offers no new-label field where the Dataset names its labels', async () => {
    const { wrapper } = await mounted()
    expect(wrapper.find('.vmlb-new-label').exists()).toBe(false)
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

  it('says every item has a label, without claiming the user made them all', async () => {
    // Since #147 labels from the file count too, so "You annotated" would be wrong.
    const { wrapper } = await mounted({ getNextAnnotationTask: queue(null, { total: 4, annotated: 4, percentage: 100 }) })

    expect(wrapper.text()).toContain('Every item has a label')
    expect(wrapper.text()).toContain('4 of 4 items are labelled.')
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
