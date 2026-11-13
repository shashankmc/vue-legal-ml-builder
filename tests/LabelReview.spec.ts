// Annotation on any Dataset, and a review of the labels it already has (BAIGLE #148).
import { mount, flushPromises } from '@vue/test-utils'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import AnnotationWorkspace from '../src/components/AnnotationWorkspace.vue'
import { assignmentChanged } from '../src/annotation/review'
import type { AnnotationTask } from '../src/types'
import { createTestAdapter, emptyAssignment } from './testAdapter'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})

const tag = (label: string) => ({ id: 1, label, confidence: 0, metadata: null })

function labelled(index: number, label: string, source = 'file'): AnnotationTask {
  return {
    id: `t${index}`, dataset_id: 'ds-1', item_index: index, text: `Clause ${index}.`, status: 'annotated',
    annotation_label: label, label_source: source, file_label: source === 'file' ? label : null, created_at: '', updated_at: '',
  }
}

const ITEMS = [labelled(0, 'Civil'), labelled(1, 'Criminal'), labelled(2, 'Criminal', 'human')]

/** pageAnnotationTasks over ITEMS, as legal-ml-core pages them. */
function pages(items = ITEMS) {
  return vi.fn(async (_p: string, f: { label?: string; limit?: number; offset?: number }) => {
    const matching = items.filter((t) => !f.label || t.annotation_label === f.label)
    const start = f.offset ?? 0
    return { tasks: matching.slice(start, start + (f.limit ?? matching.length)), total: matching.length }
  })
}

async function mounted(overrides = {}) {
  const adapter = createTestAdapter({
    // The queue is empty: every row has a label.
    getNextAnnotationTask: vi.fn().mockResolvedValue({ task: null, stats: { total: 3, annotated: 3, percentage: 100 } }),
    getDataset: vi.fn().mockResolvedValue({ labels: ['Civil', 'Criminal'] }),
    pageAnnotationTasks: pages(),
    getAnnotationAssignment: vi.fn(async (taskId: string) => {
      const task = ITEMS.find((t) => t.id === taskId)!
      return {
        document: { name: `Item ${task.item_index + 1}`, full_text: task.text },
        assignment: { ...emptyAssignment(taskId), status: 'done', document_annotations: [tag(task.annotation_label!)] },
        labels: ['Civil', 'Criminal'],
        annotationLevel: 'document' as const,
        labelSource: task.label_source ?? null,
        fileLabel: task.file_label ?? null,
        hint: null,
      }
    }),
    saveAnnotationAssignment: vi.fn().mockResolvedValue({}),
    ...overrides,
  })
  const wrapper = mount(AnnotationWorkspace, {
    props: { adapter, projectId: 'p1', datasetId: 'ds-1', rowCount: 3, unlabelledRows: 0 },
    attachTo: document.body,
  })
  await flushPromises()
  return { adapter, wrapper }
}

type Wrapper = Awaited<ReturnType<typeof mounted>>['wrapper']

async function click(wrapper: Wrapper, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text)
  if (!button) throw new Error(`no button "${text}"`)
  await button.trigger('click')
  await flushPromises()
}

const header = (wrapper: Wrapper) => wrapper.find('.lak-annotator').text()

describe('assignmentChanged', () => {
  const before = { ...emptyAssignment('t1'), document_annotations: [tag('Civil')] }

  it('is false for the same labels, whatever the ids or order', () => {
    expect(assignmentChanged(before, { ...before, document_annotations: [{ ...tag('Civil'), id: -7 }] })).toBe(false)
  })

  it('is true when a label or span changes', () => {
    expect(assignmentChanged(before, { ...before, document_annotations: [tag('Criminal')] })).toBe(true)
    const span = { id: 1, start: 0, end: 5, label: 'PERSON', text: 'Smith', relations: [], confidence: 0, metadata: null }
    expect(assignmentChanged({ ...before, annotations: [span] }, { ...before, annotations: [{ ...span, end: 6 }] })).toBe(true)
  })
})

describe('Review labels', () => {
  it('offers a review, not a dead end, when every row is labelled', async () => {
    const { wrapper } = await mounted()

    expect(wrapper.text()).not.toContain('nothing to annotate')
    expect(wrapper.findAll('button').some((b) => b.text() === 'Review labels')).toBe(true)
    wrapper.unmount()
  })

  it('opens the labelled items in row order, says where each label came from, and moves on', async () => {
    const { adapter, wrapper } = await mounted()

    await click(wrapper, 'Review labels')

    expect(adapter.pageAnnotationTasks).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'annotated', datasetId: 'ds-1', limit: 1, offset: 0 }))
    expect(header(wrapper)).toContain('Item 1')
    expect(wrapper.text()).toContain('Label from the file')
    expect(wrapper.find('.lak-annotator').text()).toContain('1/3')

    await wrapper.find('.lak-annotator .btn--primary').trigger('click') // the kit's Next
    await flushPromises()

    expect(header(wrapper)).toContain('Item 2')
    expect(adapter.saveAnnotationAssignment).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows each item with its own labels and never saves one item\'s labels onto another', async () => {
    // A real server answers the assignment after the page: the kit must not open
    // the next item with the previous item's labels (found in BAIGLE #149 QA).
    const slow = vi.fn(async (taskId: string) => {
      await new Promise((r) => setTimeout(r, 20))
      const task = ITEMS.find((t) => t.id === taskId)!
      return {
        document: { name: `Item ${task.item_index + 1}`, full_text: task.text },
        assignment: { ...emptyAssignment(taskId), status: 'done', document_annotations: [tag(task.annotation_label!)] },
        labels: ['Civil', 'Criminal'], annotationLevel: 'document' as const,
        labelSource: task.label_source ?? null, fileLabel: task.file_label ?? null, hint: null,
      }
    })
    const { adapter, wrapper } = await mounted({ getAnnotationAssignment: slow })
    await click(wrapper, 'Review labels')
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    await wrapper.find('.lak-annotator .btn--primary').trigger('click') // Next, to item 2 (Criminal)
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()
    const tagged = () => wrapper.findAll('.vmlb-review .doc-tag.is-tagged').map((t) => t.text().replace(/\s+\S$/, '').trim())
    expect(header(wrapper)).toContain('Item 2')
    expect(tagged()[0]).toMatch(/^Criminal/)

    await wrapper.findAll('.lak-annotator button').find((b) => b.text().includes('Back'))!.trigger('click')
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()

    expect(adapter.saveAnnotationAssignment).not.toHaveBeenCalled()
    expect(tagged()[0]).toMatch(/^Civil/)
    wrapper.unmount()
  })

  it('saves a changed label as the person\'s, and nothing for labels left as they were', async () => {
    const { adapter, wrapper } = await mounted()
    await click(wrapper, 'Review labels')

    await wrapper.findAll('.doc-tag').find((t) => t.text().startsWith('Criminal'))!.trigger('click')
    await wrapper.find('.btn--save').trigger('click')
    await flushPromises()

    expect(adapter.saveAnnotationAssignment).toHaveBeenCalledTimes(1)
    const [taskId, saved] = vi.mocked(adapter.saveAnnotationAssignment).mock.calls[0]
    expect(taskId).toBe('t0')
    expect(saved.document_annotations.map((t: { label: string }) => t.label)).toEqual(['Criminal'])
    wrapper.unmount()
  })

  it('shows what the file said for a label a person changed', async () => {
    const changed = { ...labelled(0, 'Criminal', 'human'), file_label: 'Civil' }
    const { wrapper } = await mounted({ pageAnnotationTasks: pages([changed]),
      getAnnotationAssignment: vi.fn().mockResolvedValue({
        document: { name: 'Item 1', full_text: 'Clause 0.' },
        assignment: { ...emptyAssignment('t0'), status: 'done', document_annotations: [tag('Criminal')] },
        labels: ['Civil', 'Criminal'], annotationLevel: 'document', labelSource: 'human', fileLabel: 'Civil', hint: null,
      }) })

    await click(wrapper, 'Review labels')

    expect(wrapper.text()).toContain('Labelled by a person')
    expect(wrapper.text()).toContain('The file said: Civil')
    wrapper.unmount()
  })

  it('narrows the review to one label', async () => {
    const { adapter, wrapper } = await mounted()
    await click(wrapper, 'Review labels')

    await wrapper.find('select[aria-label="Show labels"]').setValue('Criminal')
    await flushPromises()

    expect(adapter.pageAnnotationTasks).toHaveBeenLastCalledWith('p1', expect.objectContaining({ label: 'Criminal', offset: 0 }))
    expect(header(wrapper)).toContain('Item 2')
    expect(wrapper.find('.lak-annotator').text()).toContain('1/2')
    wrapper.unmount()
  })

  it('goes back to the queue', async () => {
    const { wrapper } = await mounted()
    await click(wrapper, 'Review labels')

    await click(wrapper, 'Back to the queue')

    expect(wrapper.find('.vmlb-review').exists()).toBe(false)
    wrapper.unmount()
  })

  it('is not offered when the adapter cannot page tasks', async () => {
    const { wrapper } = await mounted({ pageAnnotationTasks: undefined })

    expect(wrapper.findAll('button').some((b) => b.text() === 'Review labels')).toBe(false)
    wrapper.unmount()
  })
})

describe('NER hints from the file', () => {
  it('shows the entity types the file lists above the item', async () => {
    const task = { id: 'n1', dataset_id: 'ds-1', item_index: 0, text: 'Smith sued Acme.', status: 'pending' as const, created_at: '', updated_at: '' }
    const { wrapper } = await mounted({
      getNextAnnotationTask: vi.fn().mockResolvedValue({ task, stats: { total: 1, annotated: 0, percentage: 0 } }),
      getDataset: vi.fn().mockResolvedValue({ labels: ['PERSON', 'ORG'] }),
      getAnnotationAssignment: vi.fn().mockResolvedValue({
        document: { name: 'Item 1', full_text: task.text }, assignment: emptyAssignment('n1'),
        labels: ['PERSON', 'ORG'], annotationLevel: 'word', labelSource: null, fileLabel: 'PERSON, ORG', hint: 'PERSON, ORG',
      }),
    })
    await wrapper.setProps({ taskType: 'ner' })
    await flushPromises()

    expect(wrapper.text()).toContain('The file lists: PERSON, ORG')
    wrapper.unmount()
  })
})
