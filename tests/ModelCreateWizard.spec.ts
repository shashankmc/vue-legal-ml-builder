import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ModelCreateWizard from '../src/components/ModelCreateWizard.vue'
import { createTestAdapter } from './testAdapter'
import type { Dataset } from '../src/types'

function dataset(overrides: Partial<Dataset> = {}): Dataset {
  return {
    id: 'ds-1',
    user_id: 'u1',
    name: 'Contracts',
    file_path: '/tmp/x.csv',
    row_count: 100,
    columns: [],
    task_type: 'classification',
    dataset_type: 'training',
    annotation_progress: 0,
    annotated_count: 0,
    total_count: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('ModelCreateWizard', () => {
  it('loads datasets on mount and pre-selects one via the datasetId prop', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    // Selecting the dataset reveals step 2 (model type selection).
    expect(wrapper.text()).toContain('Select model type')
    expect(wrapper.text()).toContain('Support Vector Machine')
  })

  it('only shows model types valid for the dataset task_type', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset({ task_type: 'clustering' })]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    expect(wrapper.text()).toContain('K-Means Clustering')
    expect(wrapper.text()).not.toContain('Support Vector Machine')
  })

  it('populates default parameters when a model type is selected', async () => {
    const adapter = createTestAdapter({ listDatasets: vi.fn().mockResolvedValue([dataset()]) })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    const svmCard = wrapper.findAll('[role="button"]').find((c) => c.text().includes('Support Vector Machine'))
    await svmCard!.trigger('click')

    expect(wrapper.text()).toContain('Configure model')
    const cInput = wrapper.find('input[type="number"]')
    expect((cInput.element as HTMLInputElement).value).toBe('1')
  })

  it('calls createModel with the configured payload and emits created', async () => {
    const createdModel = { id: 'm-1' }
    const adapter = createTestAdapter({
      listDatasets: vi.fn().mockResolvedValue([dataset()]),
      createModel: vi.fn().mockResolvedValue(createdModel),
    })
    const wrapper = mount(ModelCreateWizard, { props: { adapter, datasetId: 'ds-1' } })
    await flushPromises()

    const svmCard = wrapper.findAll('[role="button"]').find((c) => c.text().includes('Support Vector Machine'))
    await svmCard!.trigger('click')

    await wrapper.find('#vmlb-model-name').setValue('My SVM')
    await wrapper.find('button.vmlb-btn-primary').trigger('click')
    await flushPromises()

    expect(adapter.createModel).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My SVM', dataset_id: 'ds-1', model_type: 'svm' }),
    )
    expect(wrapper.emitted('created')?.[0]).toEqual([createdModel])
  })
})
