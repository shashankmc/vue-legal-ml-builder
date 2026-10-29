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
